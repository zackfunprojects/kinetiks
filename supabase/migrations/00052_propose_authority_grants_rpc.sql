-- ============================================================
-- 00052_propose_authority_grants_rpc.sql
--
-- Phase 4 — Kinetiks Contract Addendum §2.7.
--
-- Atomic persistence path for Authority Agent proposals. Inserts N
-- grant rows (status='proposed') and N matching approval rows
-- (approval_class='authority_grant_proposal') in a single
-- transaction. Half-proposed state ("grant exists without an
-- approval", "approval exists without a grant") is the worst-possible
-- customer UX; this RPC is the only legitimate write path for
-- proposed grants.
--
-- Input shape per member:
--   {
--     "grant_id": "<pre-generated-uuid>",
--     "grant": {
--       "scope_type": "campaign" | "workflow" | "program" | "standing",
--       "scope_id": string | null,
--       "scope_description": string,
--       "parent_grant_id": uuid | null,
--       "granted_capabilities": [...],
--       "escalation_triggers": [...],
--       "max_unapproved_spend_per_day": number | null,
--       "max_unapproved_spend_per_action": number | null,
--       "spending_currency": "USD",
--       "expires_at": string | null
--     },
--     "reasoning": string,
--     "evidence": { ... },
--     "approval_title": string,           -- pre-rendered from customer_template
--     "approval_description": string,     -- summary line for the approval card
--     "approval_expires_at": string | null
--   }
--
-- The Authority Agent (apps/id/src/lib/operators/executors/authority-agent.ts)
-- is the canonical caller. The structural validator
-- (apps/id/src/lib/operators/executors/authority-agent/validate.ts)
-- runs BEFORE this RPC, so by the time we arrive every
-- granted_capabilities[].constraints validates against its
-- ActionClassDescriptor and every escalation_triggers[].condition
-- validates against its trigger-type schema. The RPC therefore does
-- not re-run those validations; it trusts its caller and focuses on
-- atomicity.
--
-- Returns: TABLE(grant_id uuid, approval_id uuid) — one row per
-- inserted (grant, approval) pair, in input order. The caller uses
-- the returned IDs to emit `authority_grant_proposed` Ledger entries
-- (one per grant) immediately after the RPC returns.
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
BEGIN
  -- Validate top-level inputs (explicit NULL guard before jsonb_typeof,
  -- which returns NULL for SQL NULL and would short-circuit the rest of
  -- the validation chain to a silent no-op).
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
  -- v1 cap per Phase 4 plan: at most 3 members (root + ≤2 nested children)
  IF jsonb_array_length(p_proposals) > 3 THEN
    RAISE EXCEPTION 'propose_authority_grants: p_proposals exceeds v1 cap of 3 members';
  END IF;

  -- Iterate parent-first to satisfy the self-FK on parent_grant_id.
  -- The bundle is small (≤3) so a sort with parent_grant_id NULLS FIRST
  -- plus the inserted-ids tracking array is sufficient. Validation:
  --   * every child's parent_grant_id must reference either NULL or a
  --     grant_id already inserted in this batch (no forward refs);
  --   * cycles are impossible because the constraint is checked at each
  --     iteration and a cycle would never satisfy "parent already inserted".
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

    -- Forward-reference check: when a child names a parent_grant_id, the
    -- parent must already be inserted in this batch (or pre-exist in the
    -- table). The ORDER BY above guarantees parent-first within the
    -- bundle; this guard catches the case where the bundle references a
    -- non-existent parent or a cycle would otherwise be possible.
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
      escalation_triggers
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
      COALESCE(v_grant_payload->'escalation_triggers', '[]'::jsonb)
    );

    -- Insert the matching approval row. approval_type = 'review'
    -- mirrors budget_proposal (never auto-approved; prominent surface).
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

    -- Track inserted ids so subsequent children in this batch can
    -- reference them. Insertions happen parent-first per the ORDER BY.
    v_known_ids := v_known_ids || v_grant_id;

    grant_id := v_grant_id;
    approval_id := v_approval_id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) IS
  'Atomic insert of N proposed Authority Grants + matching authority_grant_proposal approvals. Called by the Authority Agent (apps/id/src/lib/operators/executors/authority-agent/persist.ts). Returns one (grant_id, approval_id) row per input proposal in input order. Half-proposed state is structurally impossible — both inserts happen in one transaction.';

-- Lock down execute: service role only (the Authority Agent runs
-- under service_role; no anon/authenticated calls).
REVOKE ALL ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) TO service_role;
