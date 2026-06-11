-- ============================================================
-- 00075_system_connections.sql  (Phase D1 — comms connections)
--
-- Two changes backing the creatable, encrypted system connections
-- (google_workspace / slack / calendar):
--
-- 1. One live connection per (account, provider), enforced at the
--    database. Four code paths already assume this invariant (the
--    Nango connect POST, the D1 OAuth callback, the availability
--    resolver, the Google token helper) but it was app-layer-only.
--    A partial unique index makes the concurrent-connect race lose
--    cleanly (23505 → "already connected") instead of minting
--    duplicate live rows. Revoked rows are history and may repeat.
--
--    Defensive dedup first: if any (account_id, provider) pair has
--    multiple non-revoked rows today, keep the newest and revoke the
--    rest (no data loss — rows flip status, nothing is deleted).
--
-- 2. Drop kinetiks_system_identity.email_credentials. The Phase 6
--    path that wrote it stored OAuth tokens as PLAINTEXT jsonb
--    (audit 2026-06-09; lib/email/connect.ts — dead code, zero
--    importers, deleted in this phase). System-connection tokens now
--    live AES-256-GCM-encrypted in kinetiks_connections.credentials,
--    the same custody the google-workspace-token helper has read
--    since Phase 4. The column held no production rows (the writer
--    was unreachable); dropping it removes the plaintext landing
--    zone entirely.
-- ============================================================

-- 1a. Dedup sweep: keep the newest non-revoked row per pair.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY account_id, provider
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM kinetiks_connections
  WHERE status <> 'revoked'
)
UPDATE kinetiks_connections c
SET
  status = 'revoked',
  metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
    'revoked_at', now(),
    'revocation_reason', 'duplicate_live_row_migration_00075'
  )
FROM ranked
WHERE c.id = ranked.id
  AND ranked.rn > 1;

-- 1b. The invariant, enforced.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_connections_account_provider_live
  ON kinetiks_connections (account_id, provider)
  WHERE status <> 'revoked';

-- 2. Remove the plaintext credential column.
ALTER TABLE kinetiks_system_identity DROP COLUMN IF EXISTS email_credentials;
