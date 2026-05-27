-- ============================================================
-- 00048_apply_pattern_decay_calibration_fn.sql
--
-- Phase 2: atomic UPDATE + Ledger INSERT for the empirical decay
-- calibration pass. The /api/archivist/patterns/calibrate route
-- previously did the UPDATE and the Ledger INSERT as two separate
-- Supabase client calls — a failure between them would leave the
-- pattern with a calibrated effective_decay_days but no Ledger entry
-- recording why. This function wraps both in a single statement
-- (one transaction by default in plpgsql) so the audit trail is
-- always consistent with the table state.
--
-- The CAS predicates are intentionally strict:
--   - effective_decay_days = prior_effective_decay_days (calibration
--     reads this value; an emission that changed it should re-trigger
--     calibration on the next tick)
--   - updated_at = prior_updated_at (catches concurrent emissions
--     that updated other fields — variance, observation_count — even
--     if effective_decay_days happened to be the same)
--
-- Returns:
--   applied=true  → UPDATE affected 1 row and Ledger INSERT succeeded
--   applied=false → CAS predicate failed (raced by an emission);
--                   no Ledger entry was written
--
-- Auth: called via service-role admin client only (RLS bypassed by
-- the postgres role). The function is SECURITY INVOKER so it runs
-- with the caller's privileges; the service role has full RLS bypass.
-- ============================================================

CREATE OR REPLACE FUNCTION _kt_apply_pattern_decay_calibration(
  p_account_id                    uuid,
  p_pattern_id                    uuid,
  p_prior_effective_decay_days    integer,
  p_prior_updated_at              timestamptz,
  p_next_effective_decay_days     integer,
  p_next_decay_at                 timestamptz,
  p_ledger_detail                 jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE kinetiks_pattern_library
  SET effective_decay_days = p_next_effective_decay_days,
      decay_at             = p_next_decay_at,
      updated_at           = now()
  WHERE id                   = p_pattern_id
    AND account_id           = p_account_id
    AND effective_decay_days = p_prior_effective_decay_days
    AND updated_at           = p_prior_updated_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    INSERT INTO kinetiks_ledger (
      account_id,
      event_type,
      source_app,
      source_operator,
      target_layer,
      detail
    ) VALUES (
      p_account_id,
      'pattern_decay_calibrated',
      'kinetiks_id',
      'archivist',
      NULL,
      p_ledger_detail
    );
    RETURN jsonb_build_object('applied', true);
  END IF;

  RETURN jsonb_build_object('applied', false);
END;
$$;

COMMENT ON FUNCTION _kt_apply_pattern_decay_calibration IS
  'Phase 2: atomic UPDATE + Ledger INSERT for empirical decay calibration. '
  'Called by /api/archivist/patterns/calibrate. '
  'Returns { applied: true } when both writes land; { applied: false } when '
  'a concurrent emission raced the CAS predicate. See migration 00048 and '
  'docs/build-phases/built/phase-2-empirical-decay-calibration.md.';
