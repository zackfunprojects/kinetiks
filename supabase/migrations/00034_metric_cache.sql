-- ============================================================
-- 00034_metric_cache.sql
-- Stale-while-revalidate cache for extractor responses across
-- every connected provider (GA4 first via D1, Stripe + GSC in D3).
--
-- Cache key: (account_id, source, normalized_input_hash). The
-- input hash is sha256 of canonical-JSON-serialized tool input
-- (e.g. {"metric":"ga4_sessions","date_range":"last_7_days"}).
--
-- SWR semantics (D1):
--   fresh                -> tool returns the cached response immediately
--   stale (past expires) -> tool returns the cached response + enqueues
--                           a background refresh via metric-cache-cron
--   miss                 -> tool blocks on the extractor and writes a row
--
-- A single Postgres advisory lock keyed by hashtext('refresh:' || ...)
-- gates concurrent refreshes; the cache row itself is the recovery
-- point if a refresh crashes mid-flight.
-- ============================================================

CREATE TABLE IF NOT EXISTS kinetiks_metric_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id text,                                       -- v2 placeholder, null in v1

  -- Cache key
  source text NOT NULL,                                     -- 'ga4', 'stripe', 'gsc'
  normalized_input_hash text NOT NULL,                      -- sha256 hex of canonical-JSON input
  input jsonb NOT NULL,                                     -- canonicalized input (debugging)

  -- Payload
  response jsonb NOT NULL,                                  -- { rows, dimension_headers, metric_unit, property_id, ... }

  -- SWR markers (refreshed_at and stale_after_seconds determine when expires_at
  -- is recomputed at write time; expires_at drives the cron scan + tool freshness)
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  stale_after_seconds integer NOT NULL,
  expires_at timestamptz NOT NULL,
  provider_etag text,                                       -- when the provider returns an etag

  -- Failure state: null when last refresh succeeded. Populated only when
  -- a refresh attempt failed and stale data is being served while we retry.
  error_state jsonb,                                        -- { error_class, message, attempted_at, retry_count }

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cache key uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_metric_cache_key
  ON kinetiks_metric_cache (account_id, source, normalized_input_hash);

-- Cron scan: find due refreshes ordered by oldest expiry
CREATE INDEX IF NOT EXISTS idx_kinetiks_metric_cache_due_refresh
  ON kinetiks_metric_cache (expires_at, source)
  WHERE error_state IS NULL OR error_state IS NOT NULL;
  -- Note: index covers both success + failure rows so the cron can
  -- retry failed refreshes; the cron applies its own backoff policy.

-- Account-scoped browse
CREATE INDEX IF NOT EXISTS idx_kinetiks_metric_cache_account_source
  ON kinetiks_metric_cache (account_id, source, refreshed_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION _kt_metric_cache_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metric_cache_touch_updated_at ON kinetiks_metric_cache;
CREATE TRIGGER metric_cache_touch_updated_at
  BEFORE UPDATE ON kinetiks_metric_cache
  FOR EACH ROW EXECUTE FUNCTION _kt_metric_cache_touch_updated_at();

-- RLS: read-own only. Writes via service role (the cron + extractor path).
ALTER TABLE kinetiks_metric_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own metric_cache" ON kinetiks_metric_cache;
CREATE POLICY "Users read own metric_cache"
  ON kinetiks_metric_cache
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- No client INSERT/UPDATE/DELETE policy. Default-deny applies.

COMMENT ON TABLE kinetiks_metric_cache IS
  'Stale-while-revalidate cache for extractor responses. Key (account_id, source, normalized_input_hash). Service-role insert/update only. team_scope_id is v2 placeholder.';

-- ─── Advisory lock helpers ─────────────────────────────────
-- The metric-cache refresh path needs to deduplicate concurrent
-- workers. We use Postgres session-scoped advisory locks keyed by a
-- bigint derived from the cache key. The bigint is passed as text from
-- the application to avoid JSON's 2^53 precision issue.
CREATE OR REPLACE FUNCTION _kt_try_advisory_lock(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_key::bigint);
END;
$$;

CREATE OR REPLACE FUNCTION _kt_release_advisory_lock(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN pg_advisory_unlock(p_key::bigint);
END;
$$;

-- Only the service role should be exercising the cache write path.
REVOKE EXECUTE ON FUNCTION _kt_try_advisory_lock(text) FROM public;
REVOKE EXECUTE ON FUNCTION _kt_release_advisory_lock(text) FROM public;
GRANT EXECUTE ON FUNCTION _kt_try_advisory_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION _kt_release_advisory_lock(text) TO service_role;

-- ─── kinetiks_analytics_metrics (existing, unused) ──────────
-- The 00023_oracle_analytics.sql table is a scalar-per-row time series
-- for Oracle aggregations. Different shape, different purpose. D1 leaves
-- it alone; D4 (Oracle activation) decides whether to fold the cache
-- into it or keep them separate.
COMMENT ON TABLE kinetiks_analytics_metrics IS
  'Oracle time-series metric store. Distinct from kinetiks_metric_cache (which stores raw extractor responses). TODO(D4): revisit during Oracle activation — decide whether the cache feeds this table or remains independent.';
