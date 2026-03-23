-- Composite index for rate-limit queries on the Learning Ledger.
-- Covers the pattern: WHERE account_id = ? AND event_type = ? AND created_at >= ?
CREATE INDEX IF NOT EXISTS idx_kinetiks_ledger_rate_limit
  ON kinetiks_ledger (account_id, event_type, created_at DESC);
