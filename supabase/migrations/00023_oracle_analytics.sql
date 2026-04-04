-- Phase 5: Oracle + Analytics Engine

-- Analytics metrics (time-series)
CREATE TABLE kinetiks_analytics_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric NOT NULL,
  metric_period text NOT NULL,
  period_start timestamptz NOT NULL,
  dimensions jsonb DEFAULT '{}',
  recorded_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_analytics_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own metrics" ON kinetiks_analytics_metrics
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_metrics_account_key ON kinetiks_analytics_metrics(account_id, metric_key, period_start);
CREATE INDEX idx_metrics_source_app ON kinetiks_analytics_metrics(account_id, source_app, recorded_at);

-- Oracle insights
CREATE TABLE kinetiks_oracle_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  insight_type text NOT NULL,
  severity text DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'opportunity')),
  title text NOT NULL,
  body text NOT NULL,
  supporting_data jsonb NOT NULL DEFAULT '{}',
  recommendation text,
  source_apps text[] DEFAULT '{}',
  related_goals uuid[],
  confidence numeric(5,2),
  delivered boolean DEFAULT false,
  delivered_at timestamptz,
  dismissed boolean DEFAULT false,
  acted_on boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_oracle_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own insights" ON kinetiks_oracle_insights
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_insights_account ON kinetiks_oracle_insights(account_id, created_at);

-- Attribution touchpoints
CREATE TABLE kinetiks_attribution_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  contact_id text,
  deal_id text,
  source_app text NOT NULL,
  action_type text NOT NULL,
  detail text,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_attribution_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own touchpoints" ON kinetiks_attribution_touchpoints
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_touchpoints_account ON kinetiks_attribution_touchpoints(account_id, timestamp);
CREATE INDEX idx_touchpoints_deal ON kinetiks_attribution_touchpoints(account_id, deal_id);
