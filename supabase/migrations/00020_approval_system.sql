-- Phase 2: Approval System
-- Confidence-based approval pipeline with trust architecture

-- Approval queue and history
CREATE TABLE kinetiks_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,
  source_operator text,
  action_category text NOT NULL,
  approval_type text NOT NULL CHECK (approval_type IN ('quick', 'review', 'strategic')),
  title text NOT NULL,
  description text,
  preview jsonb NOT NULL DEFAULT '{}',
  deep_link text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'expired', 'auto_approved', 'flagged'
  )),
  confidence_score numeric(5,2),
  confidence_breakdown jsonb,
  auto_approved boolean NOT NULL DEFAULT false,
  user_edits jsonb,
  rejection_reason text,
  rejection_classification text,
  edit_classification jsonb,
  brand_gate_result jsonb,
  quality_gate_result jsonb,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  acted_at timestamptz
);

ALTER TABLE kinetiks_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own approvals" ON kinetiks_approvals
  FOR SELECT USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));
-- Insert/update/delete handled by service role (API routes use admin client)

CREATE INDEX idx_approvals_account_status ON kinetiks_approvals(account_id, status);
CREATE INDEX idx_approvals_account_category ON kinetiks_approvals(account_id, action_category);
CREATE INDEX idx_approvals_expires ON kinetiks_approvals(expires_at) WHERE status = 'pending';

-- Enable Realtime for live approval updates
ALTER PUBLICATION supabase_realtime ADD TABLE kinetiks_approvals;

-- Autonomy thresholds per action category
CREATE TABLE kinetiks_approval_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  action_category text NOT NULL,
  auto_approve_threshold numeric(5,2) DEFAULT 100,
  override_rule text CHECK (override_rule IN ('always_approve', 'always_ask', 'confidence_based')),
  consecutive_approvals integer DEFAULT 0,
  total_approvals integer DEFAULT 0,
  total_rejections integer DEFAULT 0,
  approval_rate numeric(5,2) DEFAULT 0,
  edit_rate numeric(5,2) DEFAULT 0,
  last_rejection_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, action_category)
);

ALTER TABLE kinetiks_approval_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own thresholds" ON kinetiks_approval_thresholds
  FOR SELECT USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE kinetiks_approval_thresholds;
