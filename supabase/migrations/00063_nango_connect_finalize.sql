-- ============================================================
-- 00063_nango_connect_finalize.sql
--
-- Phase 7 — Nango Connect end-to-end (the "Slice 12" referenced in
-- migration 00036's banner comment).
--
-- Three changes:
--
--   1. Add `nango_end_user_id` to `kinetiks_accounts`. The
--      acceptOnboardingDefaults equivalent for connections — every
--      account gets a stable Nango end-user id of the form
--      `kt_<account_id>`. The auth webhook resolves account_id back
--      from this on `connection.created` events.
--
--   2. Document via COMMENTs that `credentials` is null for Nango-
--      managed connections (Nango holds the OAuth tokens) and that
--      `nango_connection_id` + `nango_provider_config_key` are the
--      canonical correlation columns from Phase 7 forward.
--
--   3. Tighten RLS: drop the legacy user-token INSERT/UPDATE/DELETE
--      policies. The auth webhook (service-role) is the canonical
--      writer; the DELETE route at /api/connections/[id] uses
--      service-role too. User tokens keep SELECT only — matches the
--      pattern from kinetiks_authority_grants (migration 00050).
--
-- Zero existing connections in production (verified via service-role
-- count on 2026-05-27), so the tighter RLS does not affect any live
-- user.
-- ============================================================

-- ── 1. nango_end_user_id on kinetiks_accounts ────────────────
ALTER TABLE kinetiks_accounts
  ADD COLUMN IF NOT EXISTS nango_end_user_id text;

COMMENT ON COLUMN kinetiks_accounts.nango_end_user_id IS
  'Stable Nango end-user id assigned to this account. Format: kt_<uuid>. Set lazily on the first connect-session request (apps/id/src/app/api/connections/route.ts). The auth webhook resolves account_id back from this on connection.created events.';

-- Unique partial index so a single end_user_id cannot map to two
-- accounts. Partial because pre-Phase-7 accounts have null and we
-- don''t backfill in this migration.
CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_accounts_nango_end_user_id
  ON kinetiks_accounts (nango_end_user_id)
  WHERE nango_end_user_id IS NOT NULL;

-- ── 2. Documentation comments on kinetiks_connections ────────
COMMENT ON COLUMN kinetiks_connections.credentials IS
  'AES-256-GCM encrypted credentials JSON (legacy per-provider OAuth). NULL for Phase-7 Nango-managed connections — Nango holds tokens, refreshes them internally, and we never see them. Reference Nango via nango_connection_id + nango_provider_config_key instead.';

COMMENT ON COLUMN kinetiks_connections.nango_connection_id IS
  'Phase 7: canonical Nango connection identifier. Webhook handler resolves account_id from this. Set on connection.created auth webhook; null for legacy rows (none in production).';

COMMENT ON COLUMN kinetiks_connections.nango_provider_config_key IS
  'Phase 7: Nango integration key (e.g. google-analytics, tiktok). Maps the Kinetiks ConnectionProvider value to the Nango dashboard integration via apps/id/src/lib/integrations/nango/provider-config.ts.';

-- ── 3. Tighten RLS ──────────────────────────────────────────
-- Drop the legacy user-token write policies. The auth webhook
-- (handlers/auth.ts) and the DELETE route both use the service-role
-- client, so removing user-token write policies does not break the
-- production code path. Tightening it now prevents future feature
-- work from accidentally writing via the anon/authenticated role.
DROP POLICY IF EXISTS "Users can insert own connections" ON kinetiks_connections;
DROP POLICY IF EXISTS "Users can update own connections" ON kinetiks_connections;
DROP POLICY IF EXISTS "Users can delete own connections" ON kinetiks_connections;

-- The SELECT policy stays (users read their own connections to
-- render the /connections page). RLS default-deny on writes means
-- only service-role can mutate.
--
-- For symmetry with kinetiks_authority_grants and the canonical
-- "service-role-only writes" comment on migration 00050, drop and
-- recreate the SELECT policy with an explicit comment.
DROP POLICY IF EXISTS "Users can read own connections" ON kinetiks_connections;
CREATE POLICY "Users read own connections"
  ON kinetiks_connections
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies declared: default-deny. Only
-- service-role (Nango auth webhook + admin Server Actions in
-- apps/id) may mutate. Cross-tenant pgTAP at
-- supabase/tests/connections_cross_tenant.sql will be added in the
-- same PR as this migration.

COMMENT ON TABLE kinetiks_connections IS
  'Per-account third-party integration connections. From Phase 7 onward, every connection is Nango-managed: tokens live in Nango, we hold only nango_connection_id + nango_provider_config_key. Writes are service-role only (auth webhook, admin Server Actions); user tokens have SELECT only. Legacy per-provider OAuth columns (credentials jsonb) remain in schema for backward compatibility with the zero pre-existing rows but are not populated by new connections.';
