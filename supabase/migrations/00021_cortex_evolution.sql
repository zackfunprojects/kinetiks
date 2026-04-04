-- Phase 3: Cortex Evolution - Goals, Budgets, System Identity

-- Goals
CREATE TABLE kinetiks_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('kpi_target', 'okr')),
  metric_key text,
  target_value numeric,
  target_period text CHECK (target_period IN ('weekly', 'monthly', 'quarterly', 'annual')),
  direction text CHECK (direction IN ('above', 'below', 'exact')),
  current_value numeric DEFAULT 0,
  contributing_apps text[] DEFAULT '{}',
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  progress_status text DEFAULT 'on_track' CHECK (progress_status IN ('on_track', 'behind', 'ahead', 'at_risk', 'critical')),
  parent_goal_id uuid REFERENCES kinetiks_goals,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals" ON kinetiks_goals
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_goals_account_status ON kinetiks_goals(account_id, status);

-- Goal snapshots (time-series for tracking)
CREATE TABLE kinetiks_goal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES kinetiks_goals ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  value numeric NOT NULL,
  snapshot_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_goal_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own snapshots" ON kinetiks_goal_snapshots
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_goal_snapshots_goal ON kinetiks_goal_snapshots(goal_id, snapshot_at);

-- Budgets
CREATE TABLE kinetiks_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  total_budget numeric NOT NULL,
  currency text DEFAULT 'USD',
  period text CHECK (period IN ('weekly', 'monthly', 'quarterly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  approval_status text DEFAULT 'draft' CHECK (approval_status IN ('draft', 'proposed', 'approved', 'active', 'closed')),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budgets" ON kinetiks_budgets
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

-- Budget allocations
CREATE TABLE kinetiks_budget_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid REFERENCES kinetiks_budgets ON DELETE CASCADE NOT NULL,
  category text NOT NULL,
  app text,
  allocated_amount numeric NOT NULL,
  spent_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_budget_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own allocations" ON kinetiks_budget_allocations
  FOR ALL USING (budget_id IN (
    SELECT id FROM kinetiks_budgets WHERE account_id IN (
      SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
    )
  ));

-- System identity
CREATE TABLE kinetiks_system_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  email_provider text,
  email_address text,
  email_credentials jsonb,
  slack_workspace_id text,
  slack_bot_user_id text,
  slack_channels text[] DEFAULT '{}',
  calendar_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kinetiks_system_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own identity" ON kinetiks_system_identity
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));
