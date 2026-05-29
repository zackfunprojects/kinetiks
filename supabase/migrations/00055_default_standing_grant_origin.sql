-- ============================================================
-- 00055_default_standing_grant_origin.sql
--
-- Phase 5 — Kinetiks Contract Addendum §2.6 (Default Standing Grants).
--
-- Two nullable columns on kinetiks_authority_grants that link a grant
-- back to the manifest entry it was created from. The diff cron
-- (`supabase/functions/authority-defaults-diff-cron/index.ts`) joins on
-- (account_id, default_origin_app, default_origin_key) to detect which
-- manifest defaults a customer has not yet decided on, so the columns
-- are indexed.
--
-- Both columns set together or both null:
--   * Grants created from a manifest default (via the accept RPC at
--     migration 00058, or the diff cron via the extended propose RPC
--     at migration 00059) carry both.
--   * Grants created by the Authority Agent for explicit campaign /
--     workflow / program proposals carry neither.
--
-- The unique partial index enforces that a given (account, app, key)
-- triple has at most one non-terminal grant. Customers cannot
-- accidentally accumulate duplicate defaults from concurrent signups
-- or repeated cron passes; the constraint is the structural guard.
-- ============================================================

ALTER TABLE kinetiks_authority_grants
  ADD COLUMN IF NOT EXISTS default_origin_app text,
  ADD COLUMN IF NOT EXISTS default_origin_key text;

COMMENT ON COLUMN kinetiks_authority_grants.default_origin_app IS
  'The KineticsAppManifest.app value that declared this default standing grant. Null for grants created outside the manifest-default flow.';
COMMENT ON COLUMN kinetiks_authority_grants.default_origin_key IS
  'The DefaultStandingGrant.key value from the manifest. Stable identifier the diff cron joins on to detect new or removed defaults.';

-- Both set together or both null. The diff cron and the unique index
-- below both depend on this invariant; loosening it would silently
-- break the manifest-default lifecycle.
ALTER TABLE kinetiks_authority_grants
  DROP CONSTRAINT IF EXISTS default_origin_consistent;
ALTER TABLE kinetiks_authority_grants
  ADD CONSTRAINT default_origin_consistent
  CHECK (
    (default_origin_app IS NULL AND default_origin_key IS NULL)
    OR (default_origin_app IS NOT NULL AND default_origin_key IS NOT NULL)
  );

-- Diff cron hot path: per-account lookup of all manifest-default grants
-- for a given (account, app). Partial index — non-default grants do
-- not pay the index maintenance cost.
CREATE INDEX IF NOT EXISTS idx_authority_grants_default_origin
  ON kinetiks_authority_grants (account_id, default_origin_app, default_origin_key)
  WHERE default_origin_app IS NOT NULL;

-- Structural guard: a given (account, app, key) triple may have at
-- most one non-terminal grant. Revoked or expired grants do not block
-- a new proposal; the diff cron's 30-day cooldown is the *separate*
-- soft guard against re-proposing rejected defaults.
CREATE UNIQUE INDEX IF NOT EXISTS idx_authority_grants_default_origin_active
  ON kinetiks_authority_grants (account_id, default_origin_app, default_origin_key)
  WHERE default_origin_app IS NOT NULL AND status IN ('proposed','active','paused');
