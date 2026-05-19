-- ============================================================
-- 00046_kinetiks_pattern_pending_observations.sql
--
-- Phase 1.7 — substrate for the deferred-emit helper.
--
-- Three of the four kinetiks_id.* pattern types observe an event whose
-- outcome value isn't known until later (Marcus follow-up rate,
-- insight action acceptance, connection evidence usefulness). At
-- observation time the dimensions are recorded here; when the outcome
-- arrives OR the window expires, the row flips to 'closed' /
-- 'expired' and the helper emits the canonical pattern through
-- /api/synapse/patterns.
--
-- RLS:
--   - SELECT: owning account only (informational; users can see what
--     observations are pending against their account).
--   - INSERT / UPDATE / DELETE: service-role only. The deferred-emit
--     helper runs from server actions / Edge Functions under the
--     admin client; user tokens have no write path.
--
-- The team_scope_id placeholder column matches the 2027 trust
-- architecture forward-compat rule: always null in v1, schema-shaped
-- for v2 intra-org segmentation.
-- ============================================================

CREATE TABLE kinetiks_pattern_pending_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  pattern_type text NOT NULL,
  dimensions jsonb NOT NULL,
  -- caller-provided correlation key (thread_id, insight_id, etc.).
  -- A (account_id, pattern_type, observation_key) tuple is unique
  -- per the close path: close looks up by these three to find the
  -- pending row.
  observation_key text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  outcome_window_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  closed_outcome_value numeric,
  closed_at timestamptz,
  team_scope_id text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kinetiks_pattern_pending_observations_status_valid
    CHECK (status IN ('pending', 'closed', 'expired'))
);

-- Lookup path for close(): account + type + key.
CREATE INDEX idx_pending_obs_lookup
  ON kinetiks_pattern_pending_observations
  (account_id, pattern_type, observation_key)
  WHERE status = 'pending';

-- Sweep path: every pending row with expiry < now().
CREATE INDEX idx_pending_obs_expiry
  ON kinetiks_pattern_pending_observations
  (outcome_window_expires_at)
  WHERE status = 'pending';

-- Per-account ledger surface order.
CREATE INDEX idx_pending_obs_account_observed
  ON kinetiks_pattern_pending_observations
  (account_id, observed_at DESC);

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION _kt_pending_obs_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_pending_obs_touch_updated_at
  BEFORE UPDATE ON kinetiks_pattern_pending_observations
  FOR EACH ROW EXECUTE FUNCTION _kt_pending_obs_touch_updated_at();

-- RLS — SELECT-only for users; service role writes via admin client.
ALTER TABLE kinetiks_pattern_pending_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_obs_select_own ON kinetiks_pattern_pending_observations
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE kinetiks_pattern_pending_observations IS
  'Phase 1.7 substrate for deferred-emit pattern observations. Rows are written at observation time and closed/expired by the helper or the archivist-cron deferred sweep. See apps/id/src/lib/patterns/deferred-emit.ts.';

COMMENT ON COLUMN kinetiks_pattern_pending_observations.team_scope_id IS
  'v2 intra-org segmentation placeholder. Always null in v1.';
