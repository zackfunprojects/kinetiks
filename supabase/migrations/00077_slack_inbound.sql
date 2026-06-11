-- ============================================================
-- 00077_slack_inbound.sql  (Phase D3 — Slack inbound surface)
--
-- 1. Slack ↔ Chat thread sync (comms spec §3.5). Threads gained
--    `slack_thread_ts` in 00002; replying and routing also need the
--    channel id, and the (account, channel, thread_ts) triple must
--    map to exactly ONE Kinetiks thread — enforced with a partial
--    unique index so concurrent first-replies cannot mint duplicate
--    threads (the losing insert retries as a lookup).
--
-- 2. kinetiks_inbound_events — inbound event claims. Slack retries
--    webhook deliveries (same event_id, x-slack-retry-num header);
--    processing must be exactly-once per event. A worker INSERTs its
--    claim first; the UNIQUE(event_key) makes the duplicate retry
--    lose with 23505 and skip. The table is source-generic on
--    purpose: D4's Gmail polling and meeting-prep dedup claim
--    through the same mechanism (source = 'slack' | 'gmail' |
--    'calendar'). Service-role-only bookkeeping: RLS is enabled with
--    NO user policies (default deny — documented decision, not an
--    omission). Not part of the trust architecture, so no
--    team_scope_id. Rows are purged after 7 days by
--    ratelimit-cleanup (claims only need to outlive each source's
--    retry/dedup horizon).
--
-- 3. Expression index for the team_id → account resolution every
--    inbound event performs (connections metadata jsonb).
-- ============================================================

-- 1. Thread sync coordinates.
ALTER TABLE kinetiks_marcus_threads
  ADD COLUMN IF NOT EXISTS slack_channel_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_marcus_threads_slack_coords
  ON kinetiks_marcus_threads (account_id, slack_channel_id, slack_thread_ts)
  WHERE slack_channel_id IS NOT NULL AND slack_thread_ts IS NOT NULL;

-- 2. Inbound event claims.
CREATE TABLE kinetiks_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  -- Which inbound surface claimed it.
  source text NOT NULL CHECK (source IN ('slack', 'gmail', 'calendar')),
  -- Slack: "<team_id>:<event_id>". Gmail: "gmail:<account>:<message_id>".
  -- Calendar prep: "gcal_prep:<account>:<event_id>:<start>".
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kinetiks_inbound_events ENABLE ROW LEVEL SECURITY;
-- Deliberately NO user policies: this is service-role plumbing.
-- Default-deny for authenticated users is the intended posture.

CREATE INDEX idx_kinetiks_inbound_events_created
  ON kinetiks_inbound_events (created_at);

-- 3. team_id → account resolution.
CREATE INDEX IF NOT EXISTS idx_kinetiks_connections_slack_team
  ON kinetiks_connections ((metadata->>'team_id'))
  WHERE provider = 'slack';
