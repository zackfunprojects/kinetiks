-- ============================================================
-- 00059_propose_authority_grants_default_origin.sql
--
-- Phase 5 — Kinetiks Contract Addendum §2.6.
--
-- Extend `propose_authority_grants` (migration 00052) to thread the
-- two default_origin columns added in migration 00055 through to the
-- inserted grant row. Two new optional fields per proposal element:
--
--   - default_origin_app
--   - default_origin_key
--
-- Backward-compatible: when both are absent on a proposal, the
-- inserted grant has NULL on both columns and behaves exactly as
-- before. The Authority Agent's existing call sites (campaign,
-- workflow, program proposals) do not need to change.
--
-- Forward use: the authority-defaults-diff-cron at
-- `supabase/functions/authority-defaults-diff-cron/index.ts` calls
-- this RPC with default_origin_app and default_origin_key set so the
-- proposed grant carries the manifest provenance through to the
-- customer's approval and beyond.
--
-- CREATE OR REPLACE preserves the function signature (uuid, uuid,
-- text, jsonb) so all existing grants of EXECUTE remain valid.
-- ============================================================

CREATE OR REPLACE FUNCTION propose_authority_grants(
  p_account_id        uuid,
  p_granted_by        uuid,
  p_proposed_by_agent text,
  p_proposals         jsonb
)
RETURNS TABLE(grant_id uuid, approval_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal       jsonb;
  v_grant_id       uuid;
  v_approval_id    uuid;
  v_grant_payload  jsonb;
  v_parent_ref     uuid;
  v_known_ids      uuid[];
  v_origin_app     text;
  v_origin_key     text;
BEGIN
  -- Validate top-level inputs (NULL guard before jsonb_typeof).
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'propose_authority_grants: p_account_id is required';
  END IF;
  IF p_granted_by IS NULL THEN
    RAISE EXCEPTION 'propose_authority_grants: p_granted_by is required';
  END IF;
  IF p_proposals IS NULL THEN
    RAISE EXCEPTION 'propose_authority_grants: p_proposals must be provided and not NULL';
  END IF;
  IF jsonb_typeof(p_proposals) != 'array' THEN
    RAISE EXCEPTION 'propose_authority_grants: p_proposals must be a JSON array';
  END IF;
  IF jsonb_array_length(p_proposals) = 0 THEN
    RAISE EXCEPTION 'propose_authority_grants: p_proposals must be non-empty';
  END IF;
  -- v1 cap unchanged: at most 3 members (root + ≤2 nested children).
  -- The diff cron emits proposals one at a time, so this cap continues
  -- to apply.
  IF jsonb_array_length(p_proposals) > 3 THEN
    RAISE EXCEPTION 'propose_authority_grants: p_proposals exceeds v1 cap of 3 members';
  END IF;

  v_known_ids := ARRAY[]::uuid[];

  FOR v_proposal IN
    SELECT proposal
    FROM jsonb_array_elements(p_proposals) AS proposal
    ORDER BY (proposal->'grant'->>'parent_grant_id') IS NOT NULL,
             proposal->'grant'->>'parent_grant_id' NULLS FIRST
  LOOP
    v_grant_id := (v_proposal->>'grant_id')::uuid;
    IF v_grant_id IS NULL THEN
      RAISE EXCEPTION 'propose_authority_grants: each proposal must carry a grant_id';
    END IF;

    v_grant_payload := v_proposal->'grant';
    IF v_grant_payload IS NULL OR jsonb_typeof(v_grant_payload) != 'object' THEN
      RAISE EXCEPTION 'propose_authority_grants: each proposal must carry a grant object';
    END IF;

    -- Forward-reference check unchanged from 00052.
    v_parent_ref := NULLIF(v_grant_payload->>'parent_grant_id', '')::uuid;
    IF v_parent_ref IS NOT NULL
       AND NOT (v_parent_ref = ANY(v_known_ids))
       AND NOT EXISTS (
         SELECT 1 FROM kinetiks_authority_grants WHERE id = v_parent_ref
       )
    THEN
      RAISE EXCEPTION
        'propose_authority_grants: parent_grant_id % is neither inserted in this batch nor present in the table (forward reference or cycle)',
        v_parent_ref;
    END IF;

    -- Default-origin fields: both null OR both set. The CHECK
    -- constraint added in 00055 catches the inconsistent case at the
    -- table level, but this guard surfaces a clearer error and stops
    -- the iteration before the INSERT.
    v_origin_app := v_proposal->>'default_origin_app';
    v_origin_key := v_proposal->>'default_origin_key';
    IF (v_origin_app IS NULL) <> (v_origin_key IS NULL) THEN
      RAISE EXCEPTION
        'propose_authority_grants: default_origin_app and default_origin_key must both be set or both be null (grant_id=%)', v_grant_id;
    END IF;

    -- Insert the proposed grant
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
      v_grant_payload->>'scope_type',
      v_grant_payload->>'scope_id',
      v_grant_payload->>'scope_description',
      NULLIF(v_grant_payload->>'parent_grant_id', '')::uuid,
      'proposed',
      p_proposed_by_agent,
      now(),
      NULLIF(v_grant_payload->>'expires_at', '')::timestamptz,
      NULLIF(v_grant_payload->>'max_unapproved_spend_per_day', '')::numeric,
      NULLIF(v_grant_payload->>'max_unapproved_spend_per_action', '')::numeric,
      COALESCE(v_grant_payload->>'spending_currency', 'USD'),
      v_grant_payload->'granted_capabilities',
      COALESCE(v_grant_payload->'escalation_triggers', '[]'::jsonb),
      v_origin_app,
      v_origin_key
    );

    -- Insert the matching approval row (unchanged from 00052).
    INSERT INTO kinetiks_approvals (
      account_id,
      source_app,
      source_operator,
      action_category,
      approval_type,
      approval_class,
      title,
      description,
      preview,
      status,
      expires_at
    ) VALUES (
      p_account_id,
      'kinetiks_id',
      'authority_agent',
      'authority_grant_proposal',
      'review',
      'authority_grant_proposal',
      v_proposal->>'approval_title',
      v_proposal->>'approval_description',
      jsonb_build_object(
        'grant_id', v_grant_id,
        'grant', v_grant_payload,
        'reasoning', v_proposal->'reasoning',
        'evidence', v_proposal->'evidence'
      ),
      'pending',
      NULLIF(v_proposal->>'approval_expires_at', '')::timestamptz
    )
    RETURNING id INTO v_approval_id;

    v_known_ids := v_known_ids || v_grant_id;

    grant_id := v_grant_id;
    approval_id := v_approval_id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) IS
  'Atomic insert of N proposed Authority Grants + matching authority_grant_proposal approvals. Phase 5 extension: each proposal element may carry optional default_origin_app and default_origin_key (both set together or both null) that thread through to the inserted grant row. Backward-compatible with Phase 4 callers (Authority Agent persistence path) that omit both. Returns one (grant_id, approval_id) row per proposal in input order.';

-- EXECUTE grants remain unchanged (service_role only).
REVOKE ALL ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) TO service_role;
