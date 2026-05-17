-- ============================================================
-- 00036_nango_connections_and_crm.sql
--
-- D2 Slice 2: prepare the database for the Nango-backed integration
-- platform and the multi-source Oracle pipeline.
--
-- Changes:
--   1. Add nango_connection_id + nango_provider_config_key to
--      kinetiks_connections so we can correlate a Kinetiks connection
--      with its Nango counterpart. Old token columns (credentials jsonb,
--      etc.) are LEFT IN PLACE — they get dropped in Slice 12 after
--      every source migrates and the in-house OAuth path is retired.
--   2. New kinetiks_crm_entities table — raw entity store for HubSpot
--      deals, contacts, companies, owners, pipelines. RLS read-own;
--      service role writes from the webhook handler. PII allowlist
--      enforced application-side; the schema does not store raw emails
--      (handler stores `email_lower_hash` and `domain` only).
--   3. New kinetiks_sync_logs table — per-webhook arrival log so we can
--      see per-source sync history and surface health in the Analytics
--      SourcesPanel. RLS read-own.
--
-- team_scope_id placeholder on every new table per the 2027 addendum.
-- ============================================================

-- ── 1. Nango columns on kinetiks_connections ──────────────────
ALTER TABLE kinetiks_connections
  ADD COLUMN IF NOT EXISTS nango_connection_id text,
  ADD COLUMN IF NOT EXISTS nango_provider_config_key text;

COMMENT ON COLUMN kinetiks_connections.nango_connection_id IS
  'Stable connection id assigned by Nango on successful OAuth. Used for triggerSync calls and for correlating webhook payloads to a Kinetiks account.';
COMMENT ON COLUMN kinetiks_connections.nango_provider_config_key IS
  'Nango integration key (e.g. google-analytics, hubspot, facebook). Matches the providerConfigKey on inbound webhook payloads.';

-- Lookup index for the webhook handler's account resolution.
CREATE INDEX IF NOT EXISTS idx_kinetiks_connections_nango
  ON kinetiks_connections (nango_connection_id)
  WHERE nango_connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kinetiks_connections_nango_provider
  ON kinetiks_connections (account_id, nango_provider_config_key)
  WHERE nango_provider_config_key IS NOT NULL;

-- ── 2. kinetiks_crm_entities ──────────────────────────────────
CREATE TABLE IF NOT EXISTS kinetiks_crm_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id text,                                            -- v2 placeholder

  source text NOT NULL,                                          -- 'hubspot' for now
  entity_type text NOT NULL,                                     -- 'deal' | 'contact' | 'company' | 'pipeline' | 'owner'
  external_id text NOT NULL,                                     -- HubSpot record id (or other source's natural id)

  -- Normalized payload. The handler strips raw PII before write:
  --   - emails → email_lower_hash (sha256 hex of normalized address)
  --   - phone → phone_lower_hash
  --   - addresses → city / country / domain only
  --   - free-text notes → stripped or never read
  data jsonb NOT NULL,

  external_updated_at timestamptz,                               -- provider's last-modified
  synced_at timestamptz NOT NULL DEFAULT now(),                  -- our last upsert time

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, source, entity_type, external_id)
);

-- Lookups
CREATE INDEX IF NOT EXISTS idx_kinetiks_crm_entities_account_type_updated
  ON kinetiks_crm_entities (account_id, entity_type, external_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_kinetiks_crm_entities_account_source_type
  ON kinetiks_crm_entities (account_id, source, entity_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION _kt_crm_entities_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_entities_touch_updated_at ON kinetiks_crm_entities;
CREATE TRIGGER crm_entities_touch_updated_at
  BEFORE UPDATE ON kinetiks_crm_entities
  FOR EACH ROW EXECUTE FUNCTION _kt_crm_entities_touch_updated_at();

-- RLS: read-own only. Writes via service role (the Nango webhook handler).
ALTER TABLE kinetiks_crm_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own crm_entities" ON kinetiks_crm_entities;
CREATE POLICY "Users read own crm_entities"
  ON kinetiks_crm_entities
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- No client INSERT/UPDATE/DELETE policy. Default-deny applies.

COMMENT ON TABLE kinetiks_crm_entities IS
  'Raw CRM entity store (initially HubSpot deals/contacts/companies/owners/pipelines via Nango). Read-own RLS, service-role writes. PII-safe payload: emails/phones/addresses are hashed or stripped before insert. team_scope_id is v2 placeholder.';

-- ── 3. kinetiks_sync_logs ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS kinetiks_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id text,                                            -- v2 placeholder

  source text NOT NULL,                                          -- 'ga4', 'gsc', 'stripe', 'meta-ads', 'google-ads', 'hubspot'
  sync_name text NOT NULL,                                       -- Nango sync name, e.g. 'ga4-daily-metrics'
  nango_connection_id text,                                      -- correlation to Nango

  status text NOT NULL CHECK (status IN ('succeeded', 'partial', 'failed', 'skipped')),
  records_added integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_deleted integer NOT NULL DEFAULT 0,
  duration_ms integer,

  -- Failure details (when status != 'succeeded'). Ids only, no PII.
  error_class text,
  error_message text,

  -- Correlation
  webhook_id text,                                               -- Nango's webhook delivery id, if present
  payload_sha256 text,                                           -- sha256 of the webhook body for replay detection

  arrived_at timestamptz NOT NULL DEFAULT now(),                 -- our receipt time
  provider_completed_at timestamptz,                             -- Nango's reported sync completion

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kinetiks_sync_logs_account_source_arrived
  ON kinetiks_sync_logs (account_id, source, arrived_at DESC);

CREATE INDEX IF NOT EXISTS idx_kinetiks_sync_logs_status_arrived
  ON kinetiks_sync_logs (status, arrived_at DESC)
  WHERE status <> 'succeeded';

CREATE INDEX IF NOT EXISTS idx_kinetiks_sync_logs_dedup
  ON kinetiks_sync_logs (payload_sha256, arrived_at DESC)
  WHERE payload_sha256 IS NOT NULL;

-- RLS
ALTER TABLE kinetiks_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sync_logs" ON kinetiks_sync_logs;
CREATE POLICY "Users read own sync_logs"
  ON kinetiks_sync_logs
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- No client INSERT/UPDATE/DELETE policy. Default-deny.

COMMENT ON TABLE kinetiks_sync_logs IS
  'Per-webhook arrival log for Nango syncs. Read-own RLS, service-role writes. Used by the Analytics SourcesPanel to surface integration health. payload_sha256 enables replay detection by the webhook handler.';
