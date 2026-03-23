-- Phase 4: Connection sync log table
-- Tracks each data extraction attempt for auditing and debugging.

CREATE TABLE kinetiks_connection_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES kinetiks_connections(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES kinetiks_accounts(id) NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  records_processed integer NOT NULL DEFAULT 0,
  proposals_generated integer NOT NULL DEFAULT 0,
  error text,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sync_logs_connection ON kinetiks_connection_sync_logs(connection_id, created_at DESC);
CREATE INDEX idx_sync_logs_account ON kinetiks_connection_sync_logs(account_id, created_at DESC);

-- RLS
ALTER TABLE kinetiks_connection_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sync logs"
  ON kinetiks_connection_sync_logs FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
    )
  );

-- Service role inserts sync logs (no user-facing insert policy needed)
CREATE POLICY "Service role manages sync logs"
  ON kinetiks_connection_sync_logs FOR ALL
  USING (auth.role() = 'service_role');
