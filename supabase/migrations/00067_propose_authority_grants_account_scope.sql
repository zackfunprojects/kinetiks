-- ============================================================
-- 00067_propose_authority_grants_account_scope.sql
--
-- Two Phase 7 CR fixes on the propose_authority_grants RPC (review
-- on PR #69):
--
--   1. Add `AND account_id = p_account_id` to the parent_grant_id
--      existence check. Under SECURITY DEFINER the row-level RLS is
--      bypassed, so a malicious caller could nest a child grant
--      under another tenant's parent. CLAUDE.md flags cross-account
--      leakage as a critical bug.
--
--   2. Replace the single ORDER-BY-NULLS-FIRST pass over proposals
--      with a real topological resolution. The legacy pass only
--      separated roots from non-roots; for deep nesting (root →
--      child → grandchild) it could process a descendant before its
--      parent. v1's 3-member cap means depth ≤ 2 so the legacy code
--      was correct in practice, but the topological loop is robust
--      and barely more expensive at n=3.
--
-- Algorithm for (2): load all proposals into an array, then
-- iteratively process any whose parent is null OR already inserted.
-- If a pass makes zero progress, the remaining proposals reference
-- a forward / missing / cyclic / cross-account parent — raise the
-- same forward-reference error as before. Bounded by N iterations
-- (each iteration eliminates at least one proposal on the
-- happy path).
--
-- CREATE OR REPLACE preserves the function signature (uuid, uuid,
-- text, jsonb), the EXECUTE grants, and every existing call site.
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
  v_remaining      jsonb[];
  v_next_round     jsonb[];
  v_made_progress  boolean;
  v_can_insert     boolean;
BEGIN
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
  IF jsonb_array_length(p_proposals) > 3 THEN
    RAISE EXCEPTION 'propose_authority_grants: p_proposals exceeds v1 cap of 3 members';
  END IF;

  v_known_ids := ARRAY[]::uuid[];
  v_remaining := ARRAY(
    SELECT proposal FROM jsonb_array_elements(p_proposals) AS proposal
  );

  WHILE array_length(v_remaining, 1) IS NOT NULL AND array_length(v_remaining, 1) > 0 LOOP
    v_next_round := ARRAY[]::jsonb[];
    v_made_progress := false;

    FOREACH v_proposal IN ARRAY v_remaining LOOP
      v_grant_id := (v_proposal->>'grant_id')::uuid;
      IF v_grant_id IS NULL THEN
        RAISE EXCEPTION 'propose_authority_grants: each proposal must carry a grant_id';
      END IF;

      v_grant_payload := v_proposal->'grant';
      IF v_grant_payload IS NULL OR jsonb_typeof(v_grant_payload) != 'object' THEN
        RAISE EXCEPTION 'propose_authority_grants: each proposal must carry a grant object';
      END IF;

      v_parent_ref := NULLIF(v_grant_payload->>'parent_grant_id', '')::uuid;
      v_can_insert := false;
      IF v_parent_ref IS NULL THEN
        v_can_insert := true;
      ELSIF v_parent_ref = ANY(v_known_ids) THEN
        v_can_insert := true;
      ELSIF EXISTS (
        SELECT 1 FROM kinetiks_authority_grants
        WHERE id = v_parent_ref
          AND account_id = p_account_id
      ) THEN
        v_can_insert := true;
      END IF;

      IF NOT v_can_insert THEN
        v_next_round := v_next_round || v_proposal;
        CONTINUE;
      END IF;

      v_made_progress := true;

      v_origin_app := v_proposal->>'default_origin_app';
      v_origin_key := v_proposal->>'default_origin_key';
      IF (v_origin_app IS NULL) <> (v_origin_key IS NULL) THEN
        RAISE EXCEPTION
          'propose_authority_grants: default_origin_app and default_origin_key must both be set or both be null (grant_id=%)', v_grant_id;
      END IF;

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

    -- Topological progress check. If we made no progress in this
    -- iteration, the remaining proposals reference a parent that
    -- isn't in the batch and isn't in the table for this account.
    -- Could be a forward reference, a cycle, a missing grant, or a
    -- cross-account reference (which the account-scoped EXISTS
    -- check above rejects).
    IF NOT v_made_progress THEN
      RAISE EXCEPTION
        'propose_authority_grants: % proposal(s) reference a parent_grant_id that is neither inserted in this batch nor present in this account''s rows (forward reference, cycle, missing parent, or cross-account)',
        array_length(v_next_round, 1);
    END IF;

    v_remaining := v_next_round;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) IS
  'Atomic insert of N proposed Authority Grants + matching authority_grant_proposal approvals. Phase 7 CR fixes: (1) parent_grant_id lookup scopes by p_account_id to prevent cross-tenant parent/child links; (2) iterative topological insert handles arbitrary nesting depth correctly. Returns one (grant_id, approval_id) row per proposal in dependency order.';

REVOKE ALL ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) TO service_role;
