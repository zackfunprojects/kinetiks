-- ═══════════════════════════════════════════════════════════════
-- Harvest (hv_*) tables - outbound engine
-- ═══════════════════════════════════════════════════════════════

-- ── DOMAINS ────────────────────────────────────────────────────
CREATE TABLE hv_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  registrar TEXT,
  dns_status JSONB DEFAULT '{}',
  health_score INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  google_postmaster_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_domains_kinetiks ON hv_domains(kinetiks_id);

-- ── MAILBOXES ──────────────────────────────────────────────────
CREATE TABLE hv_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES hv_domains(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  warmup_status TEXT NOT NULL DEFAULT 'not_started',
  warmup_day INTEGER DEFAULT 0,
  warmup_daily_target INTEGER DEFAULT 5,
  daily_limit INTEGER DEFAULT 40,
  daily_sent_today INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  pause_reason TEXT,
  last_health_check TIMESTAMPTZ,
  smtp_config JSONB DEFAULT '{}',
  signature_html TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_mailboxes_kinetiks ON hv_mailboxes(kinetiks_id);
CREATE INDEX idx_hv_mailboxes_active ON hv_mailboxes(kinetiks_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_hv_mailboxes_warmup ON hv_mailboxes(kinetiks_id, warmup_status);

-- ── ORGANIZATIONS ──────────────────────────────────────────────
CREATE TABLE hv_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  employee_count_range TEXT,
  funding_stage TEXT,
  annual_revenue_range TEXT,
  headquarters_city TEXT,
  headquarters_state TEXT,
  headquarters_country TEXT,
  tech_stack JSONB DEFAULT '[]',
  signals JSONB DEFAULT '[]',
  enrichment_data JSONB DEFAULT '{}',
  enrichment_sources TEXT[] DEFAULT '{}',
  last_enriched_at TIMESTAMPTZ,
  health_score INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_orgs_kinetiks ON hv_organizations(kinetiks_id);
CREATE INDEX idx_hv_orgs_domain ON hv_organizations(kinetiks_id, domain);
CREATE INDEX idx_hv_orgs_industry ON hv_organizations(kinetiks_id, industry);
CREATE INDEX idx_hv_orgs_signals ON hv_organizations USING GIN(signals);
CREATE INDEX idx_hv_orgs_tags ON hv_organizations USING GIN(tags);

-- ── CONTACTS ───────────────────────────────────────────────────
CREATE TABLE hv_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  title TEXT,
  seniority TEXT,
  department TEXT,
  role_type TEXT DEFAULT 'primary',
  source TEXT NOT NULL DEFAULT 'manual',
  verification_grade TEXT,
  verification_details JSONB DEFAULT '{}',
  last_verified_at TIMESTAMPTZ,
  lead_score INTEGER DEFAULT 0,
  fit_score INTEGER DEFAULT 0,
  intent_score INTEGER DEFAULT 0,
  engagement_score INTEGER DEFAULT 0,
  enrichment_data JSONB DEFAULT '{}',
  enrichment_sources TEXT[] DEFAULT '{}',
  last_enriched_at TIMESTAMPTZ,
  suppressed BOOLEAN DEFAULT FALSE,
  suppression_reason TEXT,
  suppressed_at TIMESTAMPTZ,
  timezone TEXT,
  location_city TEXT,
  location_state TEXT,
  location_country TEXT,
  is_eu BOOLEAN DEFAULT FALSE,
  mutual_connections JSONB DEFAULT '[]',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_contacts_kinetiks ON hv_contacts(kinetiks_id);
CREATE INDEX idx_hv_contacts_org ON hv_contacts(kinetiks_id, org_id);
CREATE INDEX idx_hv_contacts_email ON hv_contacts(kinetiks_id, email);
CREATE INDEX idx_hv_contacts_linkedin ON hv_contacts(kinetiks_id, linkedin_url);
CREATE INDEX idx_hv_contacts_lead_score ON hv_contacts(kinetiks_id, lead_score DESC);
CREATE INDEX idx_hv_contacts_suppressed ON hv_contacts(kinetiks_id, suppressed) WHERE suppressed = TRUE;
CREATE INDEX idx_hv_contacts_verification ON hv_contacts(kinetiks_id, verification_grade);
CREATE INDEX idx_hv_contacts_source ON hv_contacts(kinetiks_id, source);
CREATE INDEX idx_hv_contacts_tags ON hv_contacts USING GIN(tags);

-- ── SEQUENCES ──────────────────────────────────────────────────
CREATE TABLE hv_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_sequences_kinetiks ON hv_sequences(kinetiks_id);

-- ── CAMPAIGNS ──────────────────────────────────────────────────
CREATE TABLE hv_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  prospect_filter JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  stats JSONB DEFAULT '{}',
  playbook_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_campaigns_kinetiks ON hv_campaigns(kinetiks_id);
CREATE INDEX idx_hv_campaigns_status ON hv_campaigns(kinetiks_id, status);

-- ── DEALS ──────────────────────────────────────────────────────
CREATE TABLE hv_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES hv_contacts(id) ON DELETE SET NULL,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'prospecting',
  value INTEGER,
  currency TEXT DEFAULT 'USD',
  win_reason_category TEXT,
  win_reason_detail TEXT,
  loss_reason_category TEXT,
  loss_reason_detail TEXT,
  lost_to_competitor TEXT,
  attribution_campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  attribution_sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  attribution_channel TEXT,
  attribution_first_touch_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX idx_hv_deals_kinetiks ON hv_deals(kinetiks_id);
CREATE INDEX idx_hv_deals_stage ON hv_deals(kinetiks_id, stage);
CREATE INDEX idx_hv_deals_contact ON hv_deals(kinetiks_id, contact_id);
CREATE INDEX idx_hv_deals_org ON hv_deals(kinetiks_id, org_id);

-- ── EMAILS ─────────────────────────────────────────────────────
CREATE TABLE hv_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES hv_contacts(id) ON DELETE CASCADE,
  cc_contact_id UUID REFERENCES hv_contacts(id) ON DELETE SET NULL,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  step_number INTEGER,
  variant_id TEXT,
  mailbox_id UUID REFERENCES hv_mailboxes(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  body_plain TEXT,
  research_brief JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  sentinel_verdict TEXT,
  sentinel_flags JSONB DEFAULT '[]',
  sentinel_quality_score INTEGER,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  reply_classification TEXT,
  reply_body TEXT,
  reply_sentiment TEXT,
  thread_id TEXT,
  in_reply_to_id UUID REFERENCES hv_emails(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_emails_kinetiks ON hv_emails(kinetiks_id);
CREATE INDEX idx_hv_emails_contact ON hv_emails(kinetiks_id, contact_id);
CREATE INDEX idx_hv_emails_campaign ON hv_emails(kinetiks_id, campaign_id);
CREATE INDEX idx_hv_emails_status ON hv_emails(kinetiks_id, status);
CREATE INDEX idx_hv_emails_scheduled ON hv_emails(kinetiks_id, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_hv_emails_reply_class ON hv_emails(kinetiks_id, reply_classification) WHERE reply_classification IS NOT NULL;
CREATE INDEX idx_hv_emails_thread ON hv_emails(thread_id);

-- ── CALLS ──────────────────────────────────────────────────────
CREATE TABLE hv_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES hv_contacts(id) ON DELETE CASCADE,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  step_number INTEGER,
  phone_from TEXT NOT NULL,
  phone_to TEXT NOT NULL,
  twilio_call_sid TEXT,
  call_type TEXT NOT NULL DEFAULT 'follow_up',
  status TEXT NOT NULL DEFAULT 'scheduled',
  duration_seconds INTEGER DEFAULT 0,
  script JSONB DEFAULT '{}',
  sentinel_verdict TEXT,
  sentinel_flags JSONB DEFAULT '[]',
  transcript TEXT,
  key_moments JSONB DEFAULT '[]',
  outcome TEXT,
  elevenlabs_agent_id TEXT,
  elevenlabs_conversation_id TEXT,
  voice_id TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_calls_kinetiks ON hv_calls(kinetiks_id);
CREATE INDEX idx_hv_calls_contact ON hv_calls(kinetiks_id, contact_id);
CREATE INDEX idx_hv_calls_status ON hv_calls(kinetiks_id, status);
CREATE INDEX idx_hv_calls_scheduled ON hv_calls(kinetiks_id, scheduled_at) WHERE status = 'scheduled';

-- ── ACTIVITIES (unified timeline) ──────────────────────────────
CREATE TABLE hv_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES hv_contacts(id) ON DELETE CASCADE,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES hv_deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  source_app TEXT DEFAULT 'harvest',
  source_operator TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_activities_kinetiks ON hv_activities(kinetiks_id);
CREATE INDEX idx_hv_activities_contact ON hv_activities(kinetiks_id, contact_id);
CREATE INDEX idx_hv_activities_org ON hv_activities(kinetiks_id, org_id);
CREATE INDEX idx_hv_activities_deal ON hv_activities(kinetiks_id, deal_id);
CREATE INDEX idx_hv_activities_type ON hv_activities(kinetiks_id, type);
CREATE INDEX idx_hv_activities_created ON hv_activities(kinetiks_id, created_at DESC);

-- ── CONFIDENCE (driving modes) ─────────────────────────────────
CREATE TABLE hv_confidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  operator TEXT NOT NULL,
  function_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'human',
  total_decisions INTEGER DEFAULT 0,
  user_approved_unchanged INTEGER DEFAULT 0,
  user_edited INTEGER DEFAULT 0,
  user_rejected INTEGER DEFAULT 0,
  agreement_rate NUMERIC(5,2) DEFAULT 0,
  outcome_score NUMERIC(5,2) DEFAULT 0,
  outcomes_positive INTEGER DEFAULT 0,
  outcomes_negative INTEGER DEFAULT 0,
  min_decisions_for_approvals INTEGER DEFAULT 10,
  min_decisions_for_autopilot INTEGER DEFAULT 50,
  min_agreement_for_autopilot NUMERIC(5,2) DEFAULT 90.00,
  unlock_eligible BOOLEAN DEFAULT FALSE,
  last_calculated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kinetiks_id, operator, function_name)
);

CREATE INDEX idx_hv_confidence_kinetiks ON hv_confidence(kinetiks_id);
CREATE INDEX idx_hv_confidence_mode ON hv_confidence(kinetiks_id, operator, mode);

-- ── SUPPRESSIONS (immutable - no delete) ───────────────────────
CREATE TABLE hv_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  domain TEXT,
  type TEXT NOT NULL,
  reason TEXT,
  source_app TEXT DEFAULT 'harvest',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_suppressions_email ON hv_suppressions(kinetiks_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_hv_suppressions_phone ON hv_suppressions(kinetiks_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_hv_suppressions_domain ON hv_suppressions(kinetiks_id, domain) WHERE domain IS NOT NULL;

-- ── ANALYTICS ──────────────────────────────────────────────────
CREATE TABLE hv_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  metrics JSONB NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_analytics_kinetiks ON hv_analytics(kinetiks_id);
CREATE INDEX idx_hv_analytics_campaign ON hv_analytics(kinetiks_id, campaign_id);
CREATE INDEX idx_hv_analytics_type ON hv_analytics(kinetiks_id, report_type);

-- ── TRACKING EVENTS ────────────────────────────────────────────
CREATE TABLE hv_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES hv_emails(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES hv_contacts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  click_url TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_tracking_email ON hv_tracking_events(email_id);
CREATE INDEX idx_hv_tracking_contact ON hv_tracking_events(kinetiks_id, contact_id);
CREATE INDEX idx_hv_tracking_type ON hv_tracking_events(email_id, event_type);

-- ── USAGE METERING ─────────────────────────────────────────────
CREATE TABLE hv_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  quantity NUMERIC(10,4) DEFAULT 1,
  unit_cost_cents INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,
  reference_id UUID,
  period_month TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_usage_kinetiks ON hv_usage(kinetiks_id);
CREATE INDEX idx_hv_usage_period ON hv_usage(kinetiks_id, period_month);
CREATE INDEX idx_hv_usage_resource ON hv_usage(kinetiks_id, resource, period_month);

-- ── APPROVALS ──────────────────────────────────────────────────
CREATE TABLE hv_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  app TEXT NOT NULL DEFAULT 'harvest',
  operator TEXT NOT NULL,
  function_name TEXT NOT NULL,
  type TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  reference_id UUID,
  reference_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_data JSONB DEFAULT '{}',
  slack_message_ts TEXT,
  webhook_delivered BOOLEAN DEFAULT FALSE,
  webhook_delivered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_approvals_kinetiks ON hv_approvals(kinetiks_id);
CREATE INDEX idx_hv_approvals_pending ON hv_approvals(kinetiks_id, status) WHERE status = 'pending';
CREATE INDEX idx_hv_approvals_operator ON hv_approvals(kinetiks_id, operator, function_name);
CREATE INDEX idx_hv_approvals_reference ON hv_approvals(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_hv_approvals_expires ON hv_approvals(expires_at) WHERE status = 'pending';

-- ── WEBHOOK CONFIGS ────────────────────────────────────────────
CREATE TABLE hv_webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_delivered_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_webhook_configs_kinetiks ON hv_webhook_configs(kinetiks_id);
CREATE INDEX idx_hv_webhook_configs_active ON hv_webhook_configs(kinetiks_id, is_active) WHERE is_active = TRUE;

-- ── WEBHOOK EVENTS (inbound from SES, Twilio, etc.) ───────────
CREATE TABLE hv_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_webhooks_unprocessed ON hv_webhook_events(source, processed) WHERE processed = FALSE;


-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

-- Helper: user's kinetiks account IDs
-- Pattern: kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())

-- hv_organizations
ALTER TABLE hv_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_orgs_user" ON hv_organizations FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_orgs_service" ON hv_organizations FOR ALL
  USING (auth.role() = 'service_role');

-- hv_contacts
ALTER TABLE hv_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_contacts_user" ON hv_contacts FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_contacts_service" ON hv_contacts FOR ALL
  USING (auth.role() = 'service_role');

-- hv_deals
ALTER TABLE hv_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_deals_user" ON hv_deals FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_deals_service" ON hv_deals FOR ALL
  USING (auth.role() = 'service_role');

-- hv_campaigns
ALTER TABLE hv_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_campaigns_user" ON hv_campaigns FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_campaigns_service" ON hv_campaigns FOR ALL
  USING (auth.role() = 'service_role');

-- hv_sequences
ALTER TABLE hv_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_sequences_user" ON hv_sequences FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_sequences_service" ON hv_sequences FOR ALL
  USING (auth.role() = 'service_role');

-- hv_emails
ALTER TABLE hv_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_emails_user" ON hv_emails FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_emails_service" ON hv_emails FOR ALL
  USING (auth.role() = 'service_role');

-- hv_calls
ALTER TABLE hv_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_calls_user" ON hv_calls FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_calls_service" ON hv_calls FOR ALL
  USING (auth.role() = 'service_role');

-- hv_activities
ALTER TABLE hv_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_activities_user" ON hv_activities FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_activities_service" ON hv_activities FOR ALL
  USING (auth.role() = 'service_role');

-- hv_mailboxes
ALTER TABLE hv_mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_mailboxes_user" ON hv_mailboxes FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_mailboxes_service" ON hv_mailboxes FOR ALL
  USING (auth.role() = 'service_role');

-- hv_domains
ALTER TABLE hv_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_domains_user" ON hv_domains FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_domains_service" ON hv_domains FOR ALL
  USING (auth.role() = 'service_role');

-- hv_confidence
ALTER TABLE hv_confidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_confidence_user" ON hv_confidence FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_confidence_service" ON hv_confidence FOR ALL
  USING (auth.role() = 'service_role');

-- hv_suppressions (SELECT + INSERT only - no DELETE, no UPDATE)
ALTER TABLE hv_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_suppressions_read" ON hv_suppressions FOR SELECT
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_suppressions_insert" ON hv_suppressions FOR INSERT
  WITH CHECK (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_suppressions_service" ON hv_suppressions FOR ALL
  USING (auth.role() = 'service_role');

-- hv_analytics
ALTER TABLE hv_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_analytics_user" ON hv_analytics FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_analytics_service" ON hv_analytics FOR ALL
  USING (auth.role() = 'service_role');

-- hv_tracking_events
ALTER TABLE hv_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_tracking_user" ON hv_tracking_events FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_tracking_service" ON hv_tracking_events FOR ALL
  USING (auth.role() = 'service_role');

-- hv_usage
ALTER TABLE hv_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_usage_user" ON hv_usage FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_usage_service" ON hv_usage FOR ALL
  USING (auth.role() = 'service_role');

-- hv_approvals
ALTER TABLE hv_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_approvals_user" ON hv_approvals FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_approvals_service" ON hv_approvals FOR ALL
  USING (auth.role() = 'service_role');

-- hv_webhook_configs
ALTER TABLE hv_webhook_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_webhook_configs_user" ON hv_webhook_configs FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_webhook_configs_service" ON hv_webhook_configs FOR ALL
  USING (auth.role() = 'service_role');

-- hv_webhook_events (internal only, service role access)
ALTER TABLE hv_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_webhook_events_service" ON hv_webhook_events FOR ALL
  USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Suppression check (used by Postmaster before sending)
CREATE OR REPLACE FUNCTION hv_check_suppression(
  p_kinetiks_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  IF p_email IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM hv_suppressions WHERE kinetiks_id = p_kinetiks_id AND email = p_email) THEN
      RETURN TRUE;
    END IF;
    IF EXISTS (SELECT 1 FROM hv_suppressions WHERE kinetiks_id = p_kinetiks_id AND domain = split_part(p_email, '@', 2)) THEN
      RETURN TRUE;
    END IF;
  END IF;
  IF p_phone IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM hv_suppressions WHERE kinetiks_id = p_kinetiks_id AND phone = p_phone) THEN
      RETURN TRUE;
    END IF;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lead score recalculation
CREATE OR REPLACE FUNCTION hv_recalculate_lead_score(p_contact_id UUID) RETURNS VOID AS $$
DECLARE
  v_fit INTEGER;
  v_intent INTEGER;
  v_engagement INTEGER;
BEGIN
  SELECT fit_score INTO v_fit FROM hv_contacts WHERE id = p_contact_id;

  SELECT LEAST(100, COALESCE(jsonb_array_length(signals), 0) * 15) INTO v_intent
  FROM hv_organizations o
  JOIN hv_contacts c ON c.org_id = o.id
  WHERE c.id = p_contact_id;

  SELECT LEAST(100, COUNT(*) * 10) INTO v_engagement
  FROM hv_activities
  WHERE contact_id = p_contact_id
    AND type IN ('email_opened', 'email_clicked', 'email_received', 'linkedin_connect_accepted', 'linkedin_message_received', 'call_completed')
    AND created_at > NOW() - INTERVAL '30 days';

  UPDATE hv_contacts SET
    fit_score = COALESCE(v_fit, 0),
    intent_score = COALESCE(v_intent, 0),
    engagement_score = COALESCE(v_engagement, 0),
    lead_score = (COALESCE(v_fit, 0) * 0.40 + COALESCE(v_intent, 0) * 0.35 + COALESCE(v_engagement, 0) * 0.25)::INTEGER,
    updated_at = NOW()
  WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
