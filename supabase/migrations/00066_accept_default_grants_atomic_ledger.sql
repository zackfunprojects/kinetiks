-- ============================================================
-- 00066_accept_default_grants_atomic_ledger.sql
--
-- Phase 7 CR fix (review on PR #69, CodeRabbit finding on
-- migration 00058 line 189). Make the accept RPC write its required
-- Ledger entries inside the same transaction as the grant insert,
-- so a crash/timeout between RPC return and the app-side Ledger
-- emit cannot leave active grants without their audit trail.
--
-- Why this matters: every authority lifecycle event is supposed to
-- write to the Learning Ledger (CLAUDE.md), and a default-at-signup
-- grant without its authority_grant_proposed + authority_grant_approved
-- pair breaks the calibration loop and the audit trail. Pre-fix, the
-- accept RPC returned the grant_ids and the app code at
-- `apps/id/src/app/api/onboarding/authority-defaults/route.ts` then
-- called the Supabase REST API to insert the Ledger rows. Two
-- round-trips, two atomicity boundaries. If the Vercel worker died
-- between them (timeout, OOM, redeploy), the grant existed without
-- audit.
--
-- The new RPC signature adds two parameters:
--   p_invocation_id   text   — caller's correlation id, recorded on
--                              the proposed entry. Used to thread
--                              all grants in one accept call together.
--   p_proposals[].action_classes  text[]
--                            — per-proposal action class list used in
--                              the `authority_grant_proposed.detail`.
--
-- The caller (defaults.ts in apps/id) stops emitting Ledger entries
-- itself; the RPC owns the entire write. Backward incompat — the old
-- signature is replaced.
--
-- IMPORTANT for production state: migration 00058 already shipped a
-- function with the old signature, and the application code in PR #69
-- expected to write Ledger entries itself. Both surfaces ship together
-- in this PR so the merge order is irrelevant.
-- ============================================================

DROP FUNCTION IF EXISTS accept_default_standing_grants(uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION accept_default_standing_grants(
  p_account_id        uuid,
  p_granted_by        uuid,
  p_proposed_by_agent text,
  p_invocation_id     text,
  p_proposals         jsonb
)
RETURNS TABLE(
  grant_id            uuid,
  default_origin_app  text,
  default_origin_key  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal       jsonb;
  v_grant_id       uuid;
  v_grant_payload  jsonb;
  v_origin_app     text;
  v_origin_key     text;
  v_seen_keys      text[];
  v_action_classes text[];
BEGIN
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_account_id is required';
  END IF;
  IF p_granted_by IS NULL THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_granted_by is required';
  END IF;
  IF p_invocation_id IS NULL OR p_invocation_id = '' THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_invocation_id is required';
  END IF;
  IF p_proposals IS NULL THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_proposals must be provided and not NULL';
  END IF;
  IF jsonb_typeof(p_proposals) != 'array' THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_proposals must be a JSON array';
  END IF;
  IF jsonb_array_length(p_proposals) = 0 THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_proposals must be non-empty';
  END IF;
  IF jsonb_array_length(p_proposals) > 8 THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_proposals exceeds v1 cap of 8 members';
  END IF;

  v_seen_keys := ARRAY[]::text[];

  FOR v_proposal IN
    SELECT proposal
    FROM jsonb_array_elements(p_proposals) AS proposal
  LOOP
    v_grant_id := (v_proposal->>'grant_id')::uuid;
    IF v_grant_id IS NULL THEN
      RAISE EXCEPTION 'accept_default_standing_grants: each proposal must carry a grant_id';
    END IF;

    v_grant_payload := v_proposal->'grant';
    IF v_grant_payload IS NULL OR jsonb_typeof(v_grant_payload) != 'object' THEN
      RAISE EXCEPTION 'accept_default_standing_grants: each proposal must carry a grant object';
    END IF;

    v_origin_app := v_proposal->>'default_origin_app';
    v_origin_key := v_proposal->>'default_origin_key';
    IF v_origin_app IS NULL OR v_origin_key IS NULL THEN
      RAISE EXCEPTION 'accept_default_standing_grants: each proposal must carry default_origin_app and default_origin_key';
    END IF;

    -- Extract action_classes for the Ledger detail. Default to empty
    -- array if absent so older callers fail loudly via the detail
    -- typing in @kinetiks/types/billing.ts rather than the RPC.
    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(v_proposal->'action_classes')),
      ARRAY[]::text[]
    ) INTO v_action_classes;

    IF (v_origin_app || ':' || v_origin_key) = ANY(v_seen_keys) THEN
      RAISE EXCEPTION
        'accept_default_standing_grants: duplicate (default_origin_app, default_origin_key) within batch: %.%',
        v_origin_app, v_origin_key;
    END IF;
    v_seen_keys := v_seen_keys || (v_origin_app || ':' || v_origin_key);

    -- Insert the active grant directly (status='active' on insert is
    -- legal — the state-machine trigger only guards UPDATE).
    INSERT INTO kinetiks_authority_grants (
      id,
      account_id,
      granted_by,
      scope_type,
      scope_id,
      scope_description,
      parent_grant_id,
      status,
      proposed_by_agent,
      proposed_at,
      granted_at,
      expires_at,
      max_unapproved_spend_per_day,
      max_unapproved_spend_per_action,
      spending_currency,
      granted_capabilities,
      escalation_triggers,
      default_origin_app,
      default_origin_key
    ) VALUES (
      v_grant_id,
      p_account_id,
      p_granted_by,
      'standing',
      NULL,
      v_grant_payload->>'scope_description',
      NULL,
      'active',
      p_proposed_by_agent,
      now(),
      now(),
      NULL,
      NULL,
      NULL,
      'USD',
      v_grant_payload->'granted_capabilities',
      COALESCE(v_grant_payload->'escalation_triggers', '[]'::jsonb),
      v_origin_app,
      v_origin_key
    );

    -- Phase 7 CR: emit the two Ledger entries inside the same
    -- transaction as the grant insert. authority_grant_proposed first
    -- (logically the proposal moment), authority_grant_approved
    -- second (the customer's inline acceptance).
    INSERT INTO kinetiks_ledger (
      account_id,
      event_type,
      source_app,
      source_operator,
      grant_id,
      detail
    ) VALUES (
      p_account_id,
      'authority_grant_proposed',
      'kinetiks_id',
      'onboarding_signup',
      v_grant_id,
      jsonb_build_object(
        'grant_id', v_grant_id,
        'invocation_id', p_invocation_id,
        'request_type', 'first_connect',
        'source_label', 'default_at_signup',
        'action_classes', to_jsonb(v_action_classes),
        'scope_type', 'standing',
        'parent_grant_id', null,
        'default_origin_app', v_origin_app,
        'default_origin_key', v_origin_key
      )
    );
    INSERT INTO kinetiks_ledger (
      account_id,
      event_type,
      source_app,
      source_operator,
      grant_id,
      detail
    ) VALUES (
      p_account_id,
      'authority_grant_approved',
      'kinetiks_id',
      'onboarding_signup',
      v_grant_id,
      jsonb_build_object(
        'grant_id', v_grant_id,
        'approval_id', null,
        'edits_applied', false,
        'source_label', 'default_at_signup'
      )
    );

    grant_id := v_grant_id;
    default_origin_app := v_origin_app;
    default_origin_key := v_origin_key;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION accept_default_standing_grants(uuid, uuid, text, text, jsonb) IS
  'Atomic insert of N customer-accepted default standing grants plus the matching authority_grant_proposed + authority_grant_approved Ledger entries. Phase 7 CR fix: Ledger writes happen inside the same transaction as the grant insert so a crash between RPC return and app-side Ledger emit cannot leave active grants without lifecycle audit. Locked to service_role EXECUTE.';

REVOKE ALL ON FUNCTION accept_default_standing_grants(uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_default_standing_grants(uuid, uuid, text, text, jsonb) TO service_role;
