-- Phase 1: Add system identity fields to kinetiks_accounts
-- system_name: User-chosen name for their GTM system (Kit, Archer, etc.)
-- kinetiks_connected: Whether the user has completed full Kinetiks setup

ALTER TABLE kinetiks_accounts
  ADD COLUMN IF NOT EXISTS system_name text,
  ADD COLUMN IF NOT EXISTS kinetiks_connected boolean DEFAULT false;

COMMENT ON COLUMN kinetiks_accounts.system_name IS 'User-chosen name for their GTM system (Kit, Archer, etc.)';
COMMENT ON COLUMN kinetiks_accounts.kinetiks_connected IS 'Whether the user has completed full Kinetiks setup (named system, connected email/Slack)';
