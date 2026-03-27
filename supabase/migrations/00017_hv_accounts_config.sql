-- Harvest account-level configuration
-- Stores per-account settings like outreach goal, sales motion preferences, etc.
-- Separate from kinetiks_accounts because this is Harvest-specific.

CREATE TABLE IF NOT EXISTS hv_accounts_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  outreach_goal jsonb NOT NULL DEFAULT '{}',
  sender_profile jsonb,
  onboarding_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kinetiks_id)
);

-- RLS: users can only read/write their own config
ALTER TABLE hv_accounts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own config"
  ON hv_accounts_config FOR SELECT
  USING (kinetiks_id = auth.uid());

CREATE POLICY "Users can insert own config"
  ON hv_accounts_config FOR INSERT
  WITH CHECK (kinetiks_id = auth.uid());

CREATE POLICY "Users can update own config"
  ON hv_accounts_config FOR UPDATE
  USING (kinetiks_id = auth.uid());

-- Service role bypass for API routes
CREATE POLICY "Service role full access on hv_accounts_config"
  ON hv_accounts_config FOR ALL
  USING (auth.role() = 'service_role');
