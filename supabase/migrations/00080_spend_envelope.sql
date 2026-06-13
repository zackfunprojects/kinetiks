-- ============================================================
-- 00080_spend_envelope.sql  (Phase E2 — spend envelope + Budget nesting)
--
-- 1. kinetiks_daily_counters — the shared atomic daily-window counter.
--    Backs two enforcement points that previously had (or would have
--    had) read-then-write races:
--      * the grant spending envelope: `max_unapproved_spend_per_day`
--        aggregation at authority resolution (counter_key
--        'authority_spend:<grant_id>')
--      * the system-email daily cap (counter_key 'system_email') —
--        the D2 TOCTOU follow-up in QUESTIONS.md lands here.
--    Service-role plumbing: RLS enabled with NO user policies
--    (default deny — documented decision, the same posture as
--    kinetiks_inbound_events). team_scope_id carried per the trust-
--    architecture placeholder rule (the counter is calibration-
--    adjacent data for grants).
--
-- 2. _kt_reserve_daily_counter — atomic conditional increment.
--    INSERT ... ON CONFLICT DO UPDATE ... WHERE new_total <= cap in a
--    single statement: under concurrency, row-level locking
--    serializes the two reservations and the second sees the first's
--    total. Returns the new total on success, NULL on refusal
--    (over-cap), so callers get reserve+check in one round trip.
--
-- 3. _kt_release_daily_counter — compensating decrement (floors at
--    zero) for reservations whose action never happened (downstream
--    escalation, execution failure, email send failure).
--
-- 4. kinetiks_authority_grants.budget_category — the Budget
--    allocation category a spend-bearing grant's envelope operates
--    inside (addendum §2.11: "the envelope itself cannot exceed the
--    approved Budget for the relevant category"). Nullable; required
--    by proposal validation + the runtime resolver whenever any
--    granted capability's action class declares
--    always_requires_budget_attachment.
--
-- 5. propose_authority_grants — replaced verbatim from 00052 plus the
--    budget_category column in the grant insert.
-- ============================================================

-- 1. The counter table.
CREATE TABLE kinetiks_daily_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  counter_key text NOT NULL,
  day_utc date NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  -- v2 multi-user placeholder; always null in v1.
  team_scope_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, counter_key, day_utc)
);

ALTER TABLE kinetiks_daily_counters ENABLE ROW LEVEL SECURITY;
-- Deliberately NO user policies: enforcement plumbing written and read
-- only by the service role (runtime adapter + email sender).
-- Default-deny for authenticated users is the intended posture.

-- Old buckets are dead weight after their day passes; ratelimit-cleanup
-- purges by created_at (same 7-day horizon as inbound-event claims).
CREATE INDEX idx_kinetiks_daily_counters_created
  ON kinetiks_daily_counters (created_at);

-- 2. Atomic reserve.
CREATE OR REPLACE FUNCTION _kt_reserve_daily_counter(
  p_account_id  uuid,
  p_counter_key text,
  p_day         date,
  p_amount      numeric,
  p_cap         numeric
) RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF p_account_id IS NULL OR p_counter_key IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION '_kt_reserve_daily_counter: account, key, and day are required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '_kt_reserve_daily_counter: amount must be positive (got %)', p_amount;
  END IF;
  -- First-write refusal: an amount alone exceeding the cap can never
  -- reserve, with or without an existing bucket.
  IF p_cap IS NOT NULL AND p_amount > p_cap THEN
    RETURN NULL;
  END IF;

  INSERT INTO kinetiks_daily_counters AS c (account_id, counter_key, day_utc, amount)
  VALUES (p_account_id, p_counter_key, p_day, p_amount)
  ON CONFLICT (account_id, counter_key, day_utc)
  DO UPDATE SET
    amount = c.amount + EXCLUDED.amount,
    updated_at = now()
  WHERE p_cap IS NULL OR c.amount + EXCLUDED.amount <= p_cap
  RETURNING amount INTO v_total;

  -- NULL when the conditional update refused: the existing bucket plus
  -- this amount would cross the cap. The bucket is left untouched.
  RETURN v_total;
END;
$$;

-- 3. Compensating release.
CREATE OR REPLACE FUNCTION _kt_release_daily_counter(
  p_account_id  uuid,
  p_counter_key text,
  p_day         date,
  p_amount      numeric
) RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '_kt_release_daily_counter: amount must be positive (got %)', p_amount;
  END IF;
  UPDATE kinetiks_daily_counters
  SET amount = GREATEST(amount - p_amount, 0),
      updated_at = now()
  WHERE account_id = p_account_id
    AND counter_key = p_counter_key
    AND day_utc = p_day
  RETURNING amount INTO v_total;
  -- NULL when no bucket exists (nothing to release) — a benign no-op.
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION _kt_reserve_daily_counter(uuid, text, date, numeric, numeric) IS
  'Atomic conditional increment for daily-window caps (grant spend envelopes, system-email cap). Returns the new bucket total, or NULL when the reservation would cross p_cap (bucket untouched). Called by the runtime DailySpendCounter adapter and lib/email/sender.ts under service_role.';
COMMENT ON FUNCTION _kt_release_daily_counter(uuid, text, date, numeric) IS
  'Compensating decrement (floors at zero) for reservations whose action never happened. Returns the new total, or NULL when no bucket exists.';

-- Service-role only, same posture as propose_authority_grants.
REVOKE ALL ON FUNCTION _kt_reserve_daily_counter(uuid, text, date, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION _kt_reserve_daily_counter(uuid, text, date, numeric, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION _kt_reserve_daily_counter(uuid, text, date, numeric, numeric) TO service_role;
REVOKE ALL ON FUNCTION _kt_release_daily_counter(uuid, text, date, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION _kt_release_daily_counter(uuid, text, date, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION _kt_release_daily_counter(uuid, text, date, numeric) TO service_role;

-- 4. Budget category attachment on grants.
ALTER TABLE kinetiks_authority_grants
  ADD COLUMN IF NOT EXISTS budget_category text;

COMMENT ON COLUMN kinetiks_authority_grants.budget_category IS
  'E2 — the kinetiks_budget_allocations.category this grant''s spending envelope operates inside (addendum §2.11). Required when any granted capability''s action class declares always_requires_budget_attachment; null otherwise. Enforced at proposal validation (validate.ts check 6) and at authority resolution (missing_budget denial).';

-- 5. propose_authority_grants — 00052 verbatim + budget_category.
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
      budget_category,
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
      NULLIF(v_grant_payload->>'budget_category', ''),
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
  'Atomic insert of N proposed Authority Grants + matching authority_grant_proposal approvals. Called by the Authority Agent (apps/id/src/lib/operators/executors/authority-agent/persist.ts). Returns one (grant_id, approval_id) row per input proposal in input order. Half-proposed state is structurally impossible — both inserts happen in one transaction. E2: persists grant.budget_category.';

-- Lock down execute: service role only (the Authority Agent runs
-- under service_role; no anon/authenticated calls).
REVOKE ALL ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION propose_authority_grants(uuid, uuid, text, jsonb) TO service_role;
