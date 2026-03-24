-- ============================================================
-- Sentinel: Fourth Cortex Operator
-- Editorial quality, brand safety, compliance, contact fatigue,
-- and escalation routing tables.
-- ============================================================

-- Sentinel reviews - every external output review record
CREATE TABLE kinetiks_sentinel_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) NOT NULL,
  source_app text NOT NULL,
  source_operator text,
  content_type text NOT NULL,
  content_hash text NOT NULL,
  content text NOT NULL,
  quality_score numeric(5,2),
  verdict text NOT NULL DEFAULT 'held' CHECK (verdict IN ('approved', 'flagged', 'held')),
  flags jsonb DEFAULT '[]',
  fatigue_check_result jsonb DEFAULT '{}',
  compliance_check_result jsonb DEFAULT '{}',
  contact_email text,
  contact_linkedin text,
  org_domain text,
  metadata jsonb DEFAULT '{}',
  reviewed_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolution text CHECK (resolution IN ('sent', 'revised', 'rejected', 'overridden', NULL)),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sentinel_reviews_account ON kinetiks_sentinel_reviews(account_id);
CREATE INDEX idx_sentinel_reviews_verdict ON kinetiks_sentinel_reviews(account_id, verdict);
CREATE INDEX idx_sentinel_reviews_source ON kinetiks_sentinel_reviews(account_id, source_app);
CREATE INDEX idx_sentinel_reviews_contact ON kinetiks_sentinel_reviews(contact_email) WHERE contact_email IS NOT NULL;
CREATE INDEX idx_sentinel_reviews_content_hash ON kinetiks_sentinel_reviews(account_id, content_hash);

ALTER TABLE kinetiks_sentinel_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sentinel reviews"
  ON kinetiks_sentinel_reviews FOR SELECT
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own sentinel reviews"
  ON kinetiks_sentinel_reviews FOR UPDATE
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to sentinel reviews"
  ON kinetiks_sentinel_reviews FOR ALL
  USING (auth.role() = 'service_role');


-- Unified touchpoint ledger - every external contact across all apps
CREATE TABLE kinetiks_touchpoint_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) NOT NULL,
  contact_email text,
  contact_linkedin text,
  org_domain text,
  app text NOT NULL,
  channel text NOT NULL,
  action_type text NOT NULL,
  sentiment text DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentinel_review_id uuid REFERENCES kinetiks_sentinel_reviews(id),
  timestamp timestamptz DEFAULT now()
);

CREATE INDEX idx_touchpoint_account ON kinetiks_touchpoint_ledger(account_id);
CREATE INDEX idx_touchpoint_contact_email ON kinetiks_touchpoint_ledger(contact_email) WHERE contact_email IS NOT NULL;
CREATE INDEX idx_touchpoint_contact_linkedin ON kinetiks_touchpoint_ledger(contact_linkedin) WHERE contact_linkedin IS NOT NULL;
CREATE INDEX idx_touchpoint_org ON kinetiks_touchpoint_ledger(org_domain) WHERE org_domain IS NOT NULL;
CREATE INDEX idx_touchpoint_recent ON kinetiks_touchpoint_ledger(account_id, timestamp DESC);
CREATE INDEX idx_touchpoint_contact_time ON kinetiks_touchpoint_ledger(contact_email, timestamp DESC) WHERE contact_email IS NOT NULL;

ALTER TABLE kinetiks_touchpoint_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own touchpoints"
  ON kinetiks_touchpoint_ledger FOR SELECT
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to touchpoints"
  ON kinetiks_touchpoint_ledger FOR ALL
  USING (auth.role() = 'service_role');


-- Fatigue rules - configurable per-account pacing limits
CREATE TABLE kinetiks_fatigue_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) NOT NULL,
  rule_name text NOT NULL,
  limit_value integer NOT NULL,
  period text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('contact', 'org')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, rule_name)
);

CREATE INDEX idx_fatigue_rules_account ON kinetiks_fatigue_rules(account_id);

ALTER TABLE kinetiks_fatigue_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own fatigue rules"
  ON kinetiks_fatigue_rules FOR ALL
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to fatigue rules"
  ON kinetiks_fatigue_rules FOR ALL
  USING (auth.role() = 'service_role');


-- Sentinel overrides - tracks user decisions on held/flagged reviews
CREATE TABLE kinetiks_sentinel_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) NOT NULL,
  review_id uuid REFERENCES kinetiks_sentinel_reviews(id) NOT NULL,
  override_type text NOT NULL CHECK (override_type IN ('released', 'tightened')),
  user_action text NOT NULL CHECK (user_action IN ('sent_unchanged', 'edited', 'rejected')),
  edit_diff text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_overrides_account ON kinetiks_sentinel_overrides(account_id);
CREATE INDEX idx_overrides_review ON kinetiks_sentinel_overrides(review_id);

ALTER TABLE kinetiks_sentinel_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own overrides"
  ON kinetiks_sentinel_overrides FOR ALL
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to overrides"
  ON kinetiks_sentinel_overrides FOR ALL
  USING (auth.role() = 'service_role');


-- Escalations - unified escalation queue across all apps
CREATE TABLE kinetiks_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'standard', 'low')),
  source_app text NOT NULL,
  source_operator text,
  sentinel_review_id uuid REFERENCES kinetiks_sentinel_reviews(id),
  context jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  delivery_channel text DEFAULT 'slack_channel' CHECK (delivery_channel IN ('slack_dm', 'slack_channel', 'digest', 'email')),
  created_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX idx_escalations_account ON kinetiks_escalations(account_id);
CREATE INDEX idx_escalations_status ON kinetiks_escalations(account_id, status);
CREATE INDEX idx_escalations_severity ON kinetiks_escalations(account_id, severity);
CREATE INDEX idx_escalations_review ON kinetiks_escalations(sentinel_review_id) WHERE sentinel_review_id IS NOT NULL;
CREATE UNIQUE INDEX ux_escalations_review ON kinetiks_escalations(sentinel_review_id) WHERE sentinel_review_id IS NOT NULL;

ALTER TABLE kinetiks_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own escalations"
  ON kinetiks_escalations FOR SELECT
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own escalations"
  ON kinetiks_escalations FOR UPDATE
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to escalations"
  ON kinetiks_escalations FOR ALL
  USING (auth.role() = 'service_role');
