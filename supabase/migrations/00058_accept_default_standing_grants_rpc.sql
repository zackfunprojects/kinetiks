-- ============================================================
-- 00058_accept_default_standing_grants_rpc.sql
--
-- Phase 5 — Kinetiks Contract Addendum §2.6.
--
-- Atomic persistence path for default standing grants the customer
-- accepts during signup. Mirrors `propose_authority_grants`
-- (migration 00052) in shape but with three structural differences:
--
--   1. Status is `active` on insert — not `proposed`. The signup
--      gesture itself is the customer's approval; there is no separate
--      approval card to flip later. `granted_at` is stamped to now().
--
--   2. No companion `kinetiks_approvals` row is inserted. The signup
--      decision is recorded in the Learning Ledger by the caller as
--      `authority_grant_proposed` + `authority_grant_approved` Ledger
--      entries with `detail.source_label = 'default_at_signup'`. The
--      Approvals queue stays free of synthetic "already approved" rows.
--
--   3. `default_origin_app` and `default_origin_key` (added in
--      migration 00055) are required on each proposal element. The
--      diff cron uses these columns to detect coverage; signup-accept
--      grants are joinable on the same key as cron-proposed grants.
--
-- Scope is hard-coded to `standing` per addendum §2.6: defaults are
-- always indefinite standing grants. `scope_id`, `parent_grant_id`,
-- `expires_at`, `max_unapproved_spend_per_day`, and
-- `max_unapproved_spend_per_action` are NULL for every accepted
-- default — these fields shape campaign/workflow/program grants, not
-- defaults.
--
-- Input shape per element (same envelope as propose_authority_grants
-- with two added fields, no parent_grant_id):
--   {
--     "grant_id": "<pre-generated uuid>",
--     "grant": {
--       "scope_description": string,
--       "granted_capabilities": [...],
--       "escalation_triggers": [...]
--     },
--     "default_origin_app": "kinetiks_id",
--     "default_origin_key": "<manifest key>"
--   }
--
-- The Server Action that calls this RPC
-- (`apps/id/src/app/onboarding/authority-defaults/actions.ts`) is the
-- canonical caller. The manifest validator runs at app boot and
-- guarantees that every default's `granted_capabilities[].constraints`
-- already validates against its ActionClassDescriptor; the RPC
-- therefore trusts its caller on shape and focuses on atomicity.
--
-- Returns: TABLE(grant_id uuid, default_origin_app text,
-- default_origin_key text) — one row per inserted grant in input
-- order. The caller uses these to emit per-grant Ledger entries
-- immediately after the RPC returns.
-- ============================================================

CREATE OR REPLACE FUNCTION accept_default_standing_grants(
  p_account_id        uuid,
  p_granted_by        uuid,
  p_proposed_by_agent text,
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
BEGIN
  -- Validate top-level inputs (explicit NULL guard before jsonb_typeof,
  -- which returns NULL for SQL NULL and would silently no-op the rest).
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_account_id is required';
  END IF;
  IF p_granted_by IS NULL THEN
    RAISE EXCEPTION 'accept_default_standing_grants: p_granted_by is required';
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
  -- v1 cap. Manifest growth is intentionally conservative; bumps to
  -- this number should be deliberate, not accidental.
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

    -- No two proposals in the same call share an origin key. Without
    -- this guard, the unique partial index added in 00055 would catch
    -- the collision but with a less helpful error message.
    IF (v_origin_app || ':' || v_origin_key) = ANY(v_seen_keys) THEN
      RAISE EXCEPTION
        'accept_default_standing_grants: duplicate (default_origin_app, default_origin_key) within batch: %.%',
        v_origin_app, v_origin_key;
    END IF;
    v_seen_keys := v_seen_keys || (v_origin_app || ':' || v_origin_key);

    -- Insert the active grant directly. Status is 'active' from
    -- inception — the customer's acceptance in the signup flow IS the
    -- approval gesture. The state-machine trigger added in 00050 only
    -- guards UPDATE; INSERT at 'active' is allowed and is the
    -- semantically correct entry point here. granted_at is required
    -- by the table-level CHECK (status NOT IN ('active','paused') OR
    -- granted_at IS NOT NULL).
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

    grant_id := v_grant_id;
    default_origin_app := v_origin_app;
    default_origin_key := v_origin_key;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION accept_default_standing_grants(uuid, uuid, text, jsonb) IS
  'Atomic insert of N customer-accepted default standing grants. Status starts at active (signup gesture IS the approval). No companion approval rows; the caller emits Ledger entries directly. Used only by the onboarding accept-defaults Server Action (apps/id/src/app/onboarding/authority-defaults/actions.ts). Locked to service_role EXECUTE.';

-- Lock down execute: service role only. User tokens cannot invoke;
-- the onboarding Server Action runs under service_role.
REVOKE ALL ON FUNCTION accept_default_standing_grants(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_default_standing_grants(uuid, uuid, text, jsonb) TO service_role;
