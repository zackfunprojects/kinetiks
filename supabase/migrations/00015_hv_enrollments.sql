-- ═══════════════════════════════════════════════════════════════
-- Harvest enrollments - sequence execution tracking
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE hv_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES hv_contacts(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES hv_sequences(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'bounced', 'replied', 'unsubscribed')),
  next_step_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, sequence_id)  -- prevent double enrollment
);

CREATE INDEX idx_hv_enrollments_active ON hv_enrollments (status, next_step_at)
  WHERE status = 'active';
CREATE INDEX idx_hv_enrollments_account ON hv_enrollments (kinetiks_id);
CREATE INDEX idx_hv_enrollments_sequence ON hv_enrollments (kinetiks_id, sequence_id);
CREATE INDEX idx_hv_enrollments_campaign ON hv_enrollments (kinetiks_id, campaign_id);

-- RLS
ALTER TABLE hv_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_enrollments_user" ON hv_enrollments FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_enrollments_service" ON hv_enrollments FOR ALL
  USING (auth.role() = 'service_role');
