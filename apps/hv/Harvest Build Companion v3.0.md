# HARVEST BUILD COMPANION

## Technical Architecture, Schema, Prompts, and Build Guide

Version 3.0 | March 2026 | Author: Zack Holland

Read alongside: Harvest Product Spec v3.0, Cross-App Intelligence Spec, Sentinel Spec, Kinetiks ID Product Spec, Agent Architecture v2, **Agent-Native Architecture Spec**, **KNOWLEDGE_INTEGRATION.md**

**This document is for Claude Code.** It contains everything needed to build hv.kinetiks.ai - database schema with full SQL, prompt architecture for AI Operators with knowledge system integration, Sentinel content review pipeline, integration specifications for external services, API-first patterns from the Agent-Native Architecture spec, and a 24-day build guide with copy-paste prompts for each phase.

**Agent-Native Architecture compliance:** Every API route in Harvest follows the API-first mandate. The UI never writes directly to the database. Every mutation goes through an API route. Every API route returns structured JSON with the standard envelope (`{success, data, error, details, meta}`). Auth middleware supports three methods: session cookies, kntk_ API keys, and internal service secrets. Rate limiting uses atomic RPC with per-minute and per-day windows. All outbound content (emails, call scripts, LinkedIn messages) passes through Sentinel review before delivery. Approvals are channel-agnostic (dashboard, Slack, webhook, API polling). Operators load marketing methodology dynamically via the knowledge system. This is not optional - these patterns are enforced across the entire ecosystem.

---

# PART 1: DATABASE SCHEMA

All tables use the `hv_` prefix. One Supabase project shared with the Kinetiks ecosystem. RLS policies scope every table to the authenticated user's `kinetiks_id`.

## 1.1 Core Tables

```sql
-- ═══════════════════════════════════════════════════════════════
-- ORGANIZATIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  employee_count_range TEXT, -- '1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'
  funding_stage TEXT, -- 'pre-seed', 'seed', 'series-a', 'series-b', 'series-c+', 'public', 'bootstrapped'
  annual_revenue_range TEXT,
  headquarters_city TEXT,
  headquarters_state TEXT,
  headquarters_country TEXT,
  tech_stack JSONB DEFAULT '[]', -- ["Salesforce", "AWS", "React", ...]
  signals JSONB DEFAULT '[]', -- [{type: "funding", detail: "Series B $20M", source: "crunchbase", detected_at: "..."}]
  enrichment_data JSONB DEFAULT '{}', -- raw enrichment payloads keyed by source
  enrichment_sources TEXT[] DEFAULT '{}', -- ['pdl', 'apollo', 'builtwith']
  last_enriched_at TIMESTAMPTZ,
  health_score INTEGER DEFAULT 0, -- 0-100, aggregated from contact engagement
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

-- ═══════════════════════════════════════════════════════════════
-- CONTACTS
-- ═══════════════════════════════════════════════════════════════
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
  seniority TEXT, -- 'c-suite', 'vp', 'director', 'manager', 'individual-contributor', 'other'
  department TEXT, -- 'marketing', 'sales', 'engineering', 'product', 'finance', 'hr', 'operations', 'other'
  role_type TEXT DEFAULT 'primary', -- 'primary' (decision maker) or 'cc' (champion/influencer) per Bloomify pairing
  source TEXT NOT NULL DEFAULT 'manual', -- 'scout', 'import', 'manual', 'referral', 'bcc', 'inbound'
  
  -- Verification
  verification_grade TEXT, -- 'A', 'B', 'C', 'D' (only A/B enter campaigns)
  verification_details JSONB DEFAULT '{}', -- {syntax: true, mx: true, smtp: "valid", risk: "low", checked_at: "..."}
  last_verified_at TIMESTAMPTZ,
  
  -- Scoring
  lead_score INTEGER DEFAULT 0, -- 0-100 composite
  fit_score INTEGER DEFAULT 0, -- 0-100 ICP match
  intent_score INTEGER DEFAULT 0, -- 0-100 buying signals
  engagement_score INTEGER DEFAULT 0, -- 0-100 interaction history
  
  -- Enrichment
  enrichment_data JSONB DEFAULT '{}',
  enrichment_sources TEXT[] DEFAULT '{}',
  last_enriched_at TIMESTAMPTZ,
  
  -- Suppression
  suppressed BOOLEAN DEFAULT FALSE,
  suppression_reason TEXT, -- 'email_unsub', 'phone_dnc', 'gdpr', 'manual', 'bounce', 'domain'
  suppressed_at TIMESTAMPTZ,
  
  -- Meta
  timezone TEXT, -- IANA timezone, e.g. 'America/New_York'
  location_city TEXT,
  location_state TEXT,
  location_country TEXT,
  is_eu BOOLEAN DEFAULT FALSE, -- for GDPR handling
  mutual_connections JSONB DEFAULT '[]', -- [{name, linkedin_url, relationship}]
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

-- ═══════════════════════════════════════════════════════════════
-- DEALS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES hv_contacts(id) ON DELETE SET NULL,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL, -- e.g. "Dataflow Inc. - Enterprise Plan"
  stage TEXT NOT NULL DEFAULT 'prospecting',
  -- Stages: prospecting, contacted, engaged, meeting_set, qualified, proposal, negotiation, won, lost
  value INTEGER, -- deal value in cents
  currency TEXT DEFAULT 'USD',
  
  -- Win/Loss (highest-value intelligence for Synapse)
  win_reason_category TEXT, -- 'feature', 'price', 'relationship', 'timing', 'competitor_weakness', 'other'
  win_reason_detail TEXT,
  loss_reason_category TEXT, -- 'price', 'feature_gap', 'competitor', 'timing', 'no_budget', 'no_response', 'other'
  loss_reason_detail TEXT,
  lost_to_competitor TEXT, -- competitor name if lost to competitor
  
  -- Attribution
  attribution_campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  attribution_sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  attribution_channel TEXT, -- 'email', 'linkedin', 'phone', 'inbound', 'referral'
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

-- ═══════════════════════════════════════════════════════════════
-- CAMPAIGNS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  prospect_filter JSONB DEFAULT '{}',
  -- Filter shape: {industries: [], seniorities: [], employee_ranges: [], min_lead_score: 50, signals: [], tags: []}
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
  
  -- Stats (updated by Analyst, cached for dashboard)
  stats JSONB DEFAULT '{}',
  -- Stats shape: {total_prospects: 0, emails_sent: 0, opens: 0, replies: 0, positive_replies: 0,
  --   meetings: 0, calls_made: 0, calls_connected: 0, linkedin_sent: 0, pipeline_value: 0, closed_value: 0}
  
  playbook_type TEXT, -- 'competitive_displacement', 'funding_trigger', 'job_change', 'inbound_followup', 'event', 're_engagement', 'referral', 'custom'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_campaigns_kinetiks ON hv_campaigns(kinetiks_id);
CREATE INDEX idx_hv_campaigns_status ON hv_campaigns(kinetiks_id, status);

-- ═══════════════════════════════════════════════════════════════
-- SEQUENCES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  -- Steps shape: [
  --   {
  --     step_number: 1,
  --     channel: "linkedin_view", -- "email", "linkedin_view", "linkedin_engage", "linkedin_connect", "linkedin_dm", "phone_call", "phone_voicemail"
  --     delay_days: 0, -- days after previous step
  --     delay_hours: 0, -- hours after previous step (for intra-day timing)
  --     template_id: null, -- reference to a saved template, or null for AI-generated
  --     variants: [ -- for A/B testing
  --       {variant_id: "a", subject: "...", body: "...", weight: 50},
  --       {variant_id: "b", subject: "...", body: "...", weight: 50}
  --     ],
  --     exit_on: ["reply", "meeting_booked", "unsubscribe"], -- conditions that remove prospect from sequence
  --     send_window: {start_hour: 8, end_hour: 17, timezone: "prospect"}, -- "prospect" = use contact timezone
  --     call_script_id: null -- for phone steps, reference to Composer-generated script
  --   }
  -- ]
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
  stats JSONB DEFAULT '{}',
  -- Stats shape per step: {step_1: {sent: 0, opened: 0, replied: 0, positive: 0}, ...}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_sequences_kinetiks ON hv_sequences(kinetiks_id);

-- ═══════════════════════════════════════════════════════════════
-- EMAILS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES hv_contacts(id) ON DELETE CASCADE,
  cc_contact_id UUID REFERENCES hv_contacts(id) ON DELETE SET NULL, -- Bloomify CC mode
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  step_number INTEGER,
  variant_id TEXT, -- 'a' or 'b' for A/B testing
  mailbox_id UUID REFERENCES hv_mailboxes(id) ON DELETE SET NULL,
  
  -- Content
  subject TEXT NOT NULL,
  body TEXT NOT NULL, -- HTML body
  body_plain TEXT, -- plain text version
  
  -- Research (stored for learning)
  research_brief JSONB DEFAULT '{}',
  -- Shape: {company: {...}, prospect: {...}, tech_stack: [...], signals: [...], crm_history: [...]}
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'sentinel_review', 'approved', 'scheduled', 'sent', 'opened', 'clicked', 'replied', 'bounced'
  sentinel_verdict TEXT, -- 'approved', 'flagged', 'held'
  sentinel_flags JSONB DEFAULT '[]', -- [{category: "tone", detail: "...", severity: "low"}]
  sentinel_quality_score INTEGER,
  
  -- Timing
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  
  -- Reply handling
  reply_classification TEXT, -- 'interested', 'objection', 'not_now', 'not_interested', 'wrong_person', 'ooo', 'question', 'meeting_request', 'unsubscribe'
  reply_body TEXT,
  reply_sentiment TEXT, -- 'positive', 'neutral', 'negative'
  
  -- Threading
  thread_id TEXT, -- email thread ID for conversation grouping
  in_reply_to_id UUID REFERENCES hv_emails(id), -- parent email if this is a reply
  
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

-- ═══════════════════════════════════════════════════════════════
-- CALLS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES hv_contacts(id) ON DELETE CASCADE,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE SET NULL,
  step_number INTEGER,
  
  -- Telephony
  phone_from TEXT NOT NULL, -- Twilio number
  phone_to TEXT NOT NULL,
  twilio_call_sid TEXT, -- Twilio's call identifier
  
  -- Call details
  call_type TEXT NOT NULL DEFAULT 'follow_up', -- 'follow_up', 'qualification', 're_engagement', 'manual'
  status TEXT NOT NULL DEFAULT 'scheduled',
  -- 'scheduled', 'dialing', 'ringing', 'connected', 'voicemail', 'failed', 'completed', 'transferred', 'no_answer'
  duration_seconds INTEGER DEFAULT 0,
  
  -- Script
  script JSONB DEFAULT '{}',
  -- Shape: {opening: "...", value_prop: "...", objection_handlers: {...}, cta: "...", voicemail: "..."}
  
  -- Sentinel
  sentinel_verdict TEXT,
  sentinel_flags JSONB DEFAULT '[]',
  
  -- Intelligence
  transcript TEXT, -- full transcript
  key_moments JSONB DEFAULT '[]',
  -- Shape: [{timestamp_seconds: 45, type: "interest_signal", detail: "asked about pricing"},
  --         {timestamp_seconds: 120, type: "objection", detail: "concerned about migration"},
  --         {timestamp_seconds: 180, type: "competitor_mention", detail: "currently using Competitor X"}]
  outcome TEXT, -- 'meeting_booked', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'voicemail_left', 'transferred_to_human'
  
  -- ElevenLabs
  elevenlabs_agent_id TEXT,
  elevenlabs_conversation_id TEXT,
  voice_id TEXT, -- user's cloned voice ID
  
  -- Timing
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

-- ═══════════════════════════════════════════════════════════════
-- ACTIVITIES (unified timeline)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES hv_contacts(id) ON DELETE CASCADE,
  org_id UUID REFERENCES hv_organizations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES hv_deals(id) ON DELETE SET NULL,
  
  type TEXT NOT NULL,
  -- Types: 'email_sent', 'email_received', 'email_opened', 'email_clicked', 'email_bounced',
  --   'linkedin_view', 'linkedin_connect_sent', 'linkedin_connect_accepted', 'linkedin_message_sent',
  --   'linkedin_message_received', 'linkedin_engage', 'call_completed', 'call_voicemail',
  --   'call_transferred', 'meeting_booked', 'meeting_completed', 'note', 'stage_change',
  --   'deal_created', 'deal_won', 'deal_lost', 'contact_imported', 'contact_enriched',
  --   'contact_verified', 'suppression_added', 'bcc_logged'
  
  content JSONB DEFAULT '{}',
  -- Shape varies by type. Examples:
  -- email_sent: {email_id: "...", subject: "...", cc: true/false}
  -- call_completed: {call_id: "...", duration: 120, outcome: "meeting_booked"}
  -- stage_change: {deal_id: "...", from: "contacted", to: "engaged"}
  -- note: {text: "Had a great call, they're interested in the security feature"}
  
  source_app TEXT DEFAULT 'harvest', -- for cross-app activities logged via Synapse
  source_operator TEXT, -- 'scout', 'composer', 'concierge', 'navigator', 'keeper', 'analyst', 'user'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_activities_kinetiks ON hv_activities(kinetiks_id);
CREATE INDEX idx_hv_activities_contact ON hv_activities(kinetiks_id, contact_id);
CREATE INDEX idx_hv_activities_org ON hv_activities(kinetiks_id, org_id);
CREATE INDEX idx_hv_activities_deal ON hv_activities(kinetiks_id, deal_id);
CREATE INDEX idx_hv_activities_type ON hv_activities(kinetiks_id, type);
CREATE INDEX idx_hv_activities_created ON hv_activities(kinetiks_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- MAILBOXES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES hv_domains(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google', -- 'google', 'microsoft'
  
  -- Warmup
  warmup_status TEXT NOT NULL DEFAULT 'not_started', -- 'not_started', 'warming', 'warm', 'paused'
  warmup_day INTEGER DEFAULT 0, -- day of warmup (0 = not started, 1-21 = warming)
  warmup_daily_target INTEGER DEFAULT 5, -- how many emails to send today during warmup
  
  -- Limits and health
  daily_limit INTEGER DEFAULT 40, -- max emails per day when warm
  daily_sent_today INTEGER DEFAULT 0, -- resets at midnight in mailbox timezone
  reputation_score INTEGER DEFAULT 100, -- 0-100, degrades on bounces/complaints
  
  is_active BOOLEAN DEFAULT TRUE,
  pause_reason TEXT, -- 'reputation', 'warmup_failed', 'manual', 'complaint'
  last_health_check TIMESTAMPTZ,
  
  -- SMTP credentials (encrypted - use Supabase vault or env vars)
  smtp_config JSONB DEFAULT '{}', -- {host, port, username} - password in vault
  
  signature_html TEXT, -- email signature with physical address for CAN-SPAM
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_mailboxes_kinetiks ON hv_mailboxes(kinetiks_id);
CREATE INDEX idx_hv_mailboxes_active ON hv_mailboxes(kinetiks_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_hv_mailboxes_warmup ON hv_mailboxes(kinetiks_id, warmup_status);

-- ═══════════════════════════════════════════════════════════════
-- DOMAINS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  registrar TEXT, -- 'namecheap', 'cloudflare', 'godaddy', 'other'
  
  dns_status JSONB DEFAULT '{}',
  -- Shape: {
  --   spf: {status: "valid", record: "v=spf1 include:...", checked_at: "..."},
  --   dkim: {status: "valid", selector: "...", checked_at: "..."},
  --   dmarc: {status: "valid", record: "v=DMARC1; ...", checked_at: "..."}
  -- }
  
  health_score INTEGER DEFAULT 0, -- 0-100
  is_primary BOOLEAN DEFAULT FALSE, -- user's main domain (never send from this)
  google_postmaster_data JSONB DEFAULT '{}', -- data from Google Postmaster Tools API
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_domains_kinetiks ON hv_domains(kinetiks_id);

-- ═══════════════════════════════════════════════════════════════
-- CONFIDENCE (driving modes)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_confidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  operator TEXT NOT NULL, -- 'postmaster', 'scout', 'composer', 'concierge', 'navigator', 'keeper', 'analyst'
  function_name TEXT NOT NULL, -- e.g. 'first_touch_email', 'icp_matching', 'ooo_handling', 'voice_calls'
  
  mode TEXT NOT NULL DEFAULT 'human', -- 'human', 'approvals', 'autopilot'
  
  -- Scoring dimensions
  total_decisions INTEGER DEFAULT 0,
  user_approved_unchanged INTEGER DEFAULT 0,
  user_edited INTEGER DEFAULT 0,
  user_rejected INTEGER DEFAULT 0,
  agreement_rate NUMERIC(5,2) DEFAULT 0, -- percentage 0.00-100.00
  
  -- Outcome tracking
  outcome_score NUMERIC(5,2) DEFAULT 0, -- composite outcome quality
  outcomes_positive INTEGER DEFAULT 0, -- replies, meetings, deals from this function
  outcomes_negative INTEGER DEFAULT 0, -- bounces, complaints, unsubscribes
  
  -- Unlock
  min_decisions_for_approvals INTEGER DEFAULT 10,
  min_decisions_for_autopilot INTEGER DEFAULT 50,
  min_agreement_for_autopilot NUMERIC(5,2) DEFAULT 90.00,
  unlock_eligible BOOLEAN DEFAULT FALSE,
  
  last_calculated TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(kinetiks_id, operator, function_name)
);

CREATE INDEX idx_hv_confidence_kinetiks ON hv_confidence(kinetiks_id);
CREATE INDEX idx_hv_confidence_mode ON hv_confidence(kinetiks_id, operator, mode);

-- ═══════════════════════════════════════════════════════════════
-- SUPPRESSIONS (sacred - no delete endpoint)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  domain TEXT, -- for domain-level suppression
  type TEXT NOT NULL, -- 'email_unsub', 'phone_dnc', 'gdpr', 'domain', 'manual', 'bounce'
  reason TEXT,
  source_app TEXT DEFAULT 'harvest', -- which app triggered the suppression
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- NO updated_at. NO delete. Suppressions are permanent.
);

CREATE INDEX idx_hv_suppressions_email ON hv_suppressions(kinetiks_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_hv_suppressions_phone ON hv_suppressions(kinetiks_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_hv_suppressions_domain ON hv_suppressions(kinetiks_id, domain) WHERE domain IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- ANALYTICS (pre-computed by Analyst)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, -- 'campaign', 'sequence', 'channel', 'time', 'attribution', 'pattern'
  campaign_id UUID REFERENCES hv_campaigns(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES hv_sequences(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- 'day', 'week', 'month', 'all_time'
  period_start DATE,
  period_end DATE,
  
  metrics JSONB NOT NULL DEFAULT '{}',
  -- Campaign metrics: {sends, opens, open_rate, replies, reply_rate, positive_replies, positive_rate,
  --   meetings, meeting_rate, calls, call_connect_rate, linkedin_sent, linkedin_replies,
  --   pipeline_value, closed_value, cost_enrichment, cost_infrastructure, roi}
  -- Channel metrics: {email: {sends, replies, meetings, ...}, linkedin: {...}, phone: {...}}
  -- Time metrics: {best_send_hour: 9, best_send_day: "tuesday", avg_response_time_hours: 4.2}
  -- Pattern: {type: "messaging", insight: "Security-focused subject lines 2.3x open rate", confidence: 0.92, sample_size: 150}
  
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_analytics_kinetiks ON hv_analytics(kinetiks_id);
CREATE INDEX idx_hv_analytics_campaign ON hv_analytics(kinetiks_id, campaign_id);
CREATE INDEX idx_hv_analytics_type ON hv_analytics(kinetiks_id, report_type);

-- ═══════════════════════════════════════════════════════════════
-- EMAIL TRACKING (opens and clicks)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES hv_emails(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES hv_contacts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'open', 'click'
  click_url TEXT, -- original destination URL (only for clicks)
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_tracking_email ON hv_tracking_events(email_id);
CREATE INDEX idx_hv_tracking_contact ON hv_tracking_events(kinetiks_id, contact_id);
CREATE INDEX idx_hv_tracking_type ON hv_tracking_events(email_id, event_type);

-- ═══════════════════════════════════════════════════════════════
-- USAGE METERING (tracks consumption of paid resources)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  -- Resources: 'pdl_lookup', 'apollo_lookup', 'zerobounce_verify', 'builtwith_lookup',
  --   'elevenlabs_minutes', 'twilio_call_minutes', 'twilio_phone_number', 'ses_email_send',
  --   'claude_composer_tokens', 'claude_concierge_tokens', 'claude_research_tokens',
  --   'heyreach_linkedin_action'
  quantity NUMERIC(10,4) DEFAULT 1, -- 1 for lookups, fractional for minutes/tokens
  unit_cost_cents INTEGER DEFAULT 0, -- cost in cents per unit
  total_cost_cents INTEGER DEFAULT 0, -- quantity * unit_cost
  reference_id UUID, -- the email_id, call_id, or contact_id this usage relates to
  period_month TEXT NOT NULL, -- '2026-03' for monthly aggregation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_usage_kinetiks ON hv_usage(kinetiks_id);
CREATE INDEX idx_hv_usage_period ON hv_usage(kinetiks_id, period_month);
CREATE INDEX idx_hv_usage_resource ON hv_usage(kinetiks_id, resource, period_month);

-- ═══════════════════════════════════════════════════════════════
-- WEBHOOK EVENTS (inbound events from SES, Twilio, LinkedIn)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'ses', 'twilio', 'heyreach', 'google_calendar'
  event_type TEXT NOT NULL, -- 'bounce', 'complaint', 'delivery', 'call_status', 'connection_accepted', etc.
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_webhooks_unprocessed ON hv_webhook_events(source, processed) WHERE processed = FALSE;

-- ═══════════════════════════════════════════════════════════════
-- APPROVALS (channel-agnostic approval protocol - Agent-Native Architecture)
-- Every proposed action goes through this table. Dashboard, Slack,
-- webhook, and API polling all read from and resolve against this table.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  
  -- What is being approved
  app TEXT NOT NULL DEFAULT 'harvest',
  operator TEXT NOT NULL, -- 'composer', 'scout', 'concierge', 'navigator', 'keeper', 'postmaster'
  function_name TEXT NOT NULL, -- 'first_touch_email', 'prospect_list', 'reply_draft', 'call_script', 'pipeline_change', etc.
  type TEXT NOT NULL, -- 'email_draft', 'prospect_list', 'reply_draft', 'call_script', 'pipeline_change', 'sequence_launch'
  
  -- Full context (self-contained - agent can decide without additional API calls)
  context JSONB NOT NULL DEFAULT '{}',
  -- Shape varies by type. Email draft example:
  -- {
  --   contact: {name, title, company, lead_score},
  --   draft: {subject, body, cc},
  --   research_brief: {...},
  --   sentinel_verdict: "approved",
  --   sentinel_quality_score: 82,
  --   sentinel_flags: [],
  --   reasoning: "Why Composer chose this angle"
  -- }
  
  -- Reference to the underlying record
  reference_id UUID, -- email_id, campaign_id, deal_id, etc.
  reference_type TEXT, -- 'email', 'campaign', 'prospect_list', 'call', 'deal'
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'edited', 'rejected', 'expired', 'auto_approved'
  
  -- Resolution
  resolved_by TEXT, -- 'dashboard', 'slack', 'webhook', 'api', 'autopilot'
  resolved_at TIMESTAMPTZ,
  resolution_data JSONB DEFAULT '{}', -- edits if edited, reason if rejected
  
  -- Delivery tracking
  slack_message_ts TEXT, -- Slack message timestamp for threading
  webhook_delivered BOOLEAN DEFAULT FALSE,
  webhook_delivered_at TIMESTAMPTZ,
  
  -- Expiration
  expires_at TIMESTAMPTZ, -- approval expires after 24h by default
  
  -- Priority
  priority TEXT NOT NULL DEFAULT 'standard', -- 'low', 'standard', 'high', 'urgent'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_approvals_kinetiks ON hv_approvals(kinetiks_id);
CREATE INDEX idx_hv_approvals_pending ON hv_approvals(kinetiks_id, status) WHERE status = 'pending';
CREATE INDEX idx_hv_approvals_operator ON hv_approvals(kinetiks_id, operator, function_name);
CREATE INDEX idx_hv_approvals_reference ON hv_approvals(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_hv_approvals_expires ON hv_approvals(expires_at) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════
-- WEBHOOK CONFIGS (user-configured webhook delivery - Agent-Native Architecture)
-- Users (or agents) configure webhook URLs for approval delivery
-- and event subscriptions. Enables agent users to receive approvals
-- via webhook instead of (or in addition to) Slack/dashboard.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE hv_webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  
  url TEXT NOT NULL, -- webhook delivery URL
  events TEXT[] NOT NULL DEFAULT '{}',
  -- Subscribable events:
  -- 'approval.created', 'approval.expired',
  -- 'escalation.created',
  -- 'campaign.completed', 'campaign.paused',
  -- 'deal.won', 'deal.lost', 'deal.stage_changed',
  -- 'meeting.booked',
  -- 'reply.received', 'reply.classified',
  -- 'prospect.added', 'prospect.signal_detected',
  -- 'mailbox.health_alert', 'mailbox.paused',
  -- 'daily_brief.generated'
  
  secret TEXT NOT NULL, -- HMAC-SHA256 signing secret
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Delivery tracking
  last_delivered_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  -- Auto-disable after 10 consecutive failures
  -- Re-enable via API or settings UI
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_webhook_configs_kinetiks ON hv_webhook_configs(kinetiks_id);
CREATE INDEX idx_hv_webhook_configs_active ON hv_webhook_configs(kinetiks_id, is_active) WHERE is_active = TRUE;
```

## 1.2 RLS Policies

```sql
-- Apply to ALL hv_ tables. Example for hv_contacts (repeat pattern for every table):
ALTER TABLE hv_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own contacts"
  ON hv_contacts FOR ALL
  USING (kinetiks_id = auth.uid())
  WITH CHECK (kinetiks_id = auth.uid());

-- Special: hv_suppressions has no DELETE policy
ALTER TABLE hv_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read and insert suppressions"
  ON hv_suppressions FOR SELECT USING (kinetiks_id = auth.uid());
  
CREATE POLICY "Users can insert suppressions"
  ON hv_suppressions FOR INSERT WITH CHECK (kinetiks_id = auth.uid());
  
-- NO UPDATE or DELETE policy on suppressions. They are permanent.

-- hv_approvals: standard RLS
ALTER TABLE hv_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own approvals"
  ON hv_approvals FOR ALL
  USING (kinetiks_id = auth.uid())
  WITH CHECK (kinetiks_id = auth.uid());

-- hv_webhook_configs: standard RLS
ALTER TABLE hv_webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own webhook configs"
  ON hv_webhook_configs FOR ALL
  USING (kinetiks_id = auth.uid())
  WITH CHECK (kinetiks_id = auth.uid());
```

## 1.3 Supabase Functions

```sql
-- Check suppression before any outreach (called by Postmaster/Navigator)
CREATE OR REPLACE FUNCTION hv_check_suppression(
  p_kinetiks_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check email suppression
  IF p_email IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM hv_suppressions WHERE kinetiks_id = p_kinetiks_id AND email = p_email) THEN
      RETURN TRUE;
    END IF;
    -- Check domain suppression
    IF EXISTS (SELECT 1 FROM hv_suppressions WHERE kinetiks_id = p_kinetiks_id AND domain = split_part(p_email, '@', 2)) THEN
      RETURN TRUE;
    END IF;
  END IF;
  -- Check phone suppression
  IF p_phone IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM hv_suppressions WHERE kinetiks_id = p_kinetiks_id AND phone = p_phone) THEN
      RETURN TRUE;
    END IF;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate lead score (called after enrichment, signal detection, or engagement)
CREATE OR REPLACE FUNCTION hv_recalculate_lead_score(p_contact_id UUID) RETURNS VOID AS $$
DECLARE
  v_fit INTEGER;
  v_intent INTEGER;
  v_engagement INTEGER;
BEGIN
  -- Fit: calculated from ICP match (done in application layer, stored in fit_score)
  SELECT fit_score INTO v_fit FROM hv_contacts WHERE id = p_contact_id;
  
  -- Intent: count active signals on the org
  SELECT LEAST(100, COALESCE(jsonb_array_length(signals), 0) * 15) INTO v_intent
  FROM hv_organizations o
  JOIN hv_contacts c ON c.org_id = o.id
  WHERE c.id = p_contact_id;
  
  -- Engagement: from activities in last 30 days
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
```

---

# PART 1B: API-FIRST PATTERNS (AGENT-NATIVE ARCHITECTURE)

**This section implements the "build now" requirements from the Agent-Native Architecture Spec.** Every pattern here is non-negotiable - these are architectural rules that every API route in Harvest must follow.

## 1B.1 Standard API Response Envelope

Every API route returns this shape. No exceptions. No HTML responses. No redirects from mutation endpoints. Uses `NextResponse` from Next.js.

```typescript
// apps/id/src/lib/utils/api-response.ts (shared pattern - copy to apps/hv/)
import { NextResponse } from "next/server";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;  // structured error details (validation errors, Supabase errors, etc.)
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
  };
}

export function apiSuccess<T>(data: T, meta?: ApiResponse['meta']): NextResponse {
  return NextResponse.json({ success: true, data, meta } satisfies ApiResponse<T>);
}

export function apiError(message: string, status: number = 400, details?: unknown): NextResponse {
  return NextResponse.json(
    { success: false, error: message, ...(details ? { details } : {}) } satisfies ApiResponse,
    { status }
  );
}

export function apiPaginated<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  } satisfies ApiResponse<T[]>);
}
```

**Always include `details` on errors.** Generic messages like "Failed to save" are useless for debugging. Include `error.message` from Supabase/Claude:
```typescript
if (error) return apiError("Failed to create contact", 500, error.message);
```

## 1B.2 Unified Auth Middleware (Three Methods)

Every API route uses this middleware. It resolves three auth methods - session cookies (human users), kntk_ API keys (agent users), and internal service secrets (Edge Functions/CRONs) - to the same `AuthenticatedContext`. Downstream logic is identical regardless of auth method.

The actual implementation lives in `apps/id/src/lib/auth/`. Harvest imports and uses the same pattern.

### Auth Resolution (resolveAuth)

Checks auth methods in priority order. Returns `AuthenticatedContext` or `null`.

```typescript
// apps/id/src/lib/auth/resolve-auth.ts - the underlying resolver
import { timingSafeEqual } from "crypto";
import type { AuthenticatedContext, ApiKeyPermission } from "@kinetiks/types";

export async function resolveAuth(request: Request): Promise<AuthenticatedContext | null> {
  const authHeader = request.headers.get("authorization");

  // 1. Check for Kinetiks API key (format: kntk_ + 40 base64url chars)
  if (authHeader?.startsWith("Bearer kntk_")) {
    const apiKey = authHeader.slice(7); // Remove "Bearer "
    return await resolveApiKey(apiKey);
  }

  // 2. Check for internal service secret (Edge Functions / CRONs)
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const expectedBearer = `Bearer ${internalSecret}`;
  if (
    internalSecret && authHeader &&
    authHeader.length === expectedBearer.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedBearer))
  ) {
    return {
      account_id: "__internal__",
      user_id: "__internal__",
      auth_method: "internal",
    };
  }

  // 3. Fall back to Supabase session cookie (human user in browser)
  return resolveSession();
}
```

**Internal auth returns `account_id: "__internal__"`.** Routes that accept internal auth must read the real account_id from the request body. This is how Edge Functions call Harvest APIs without a user session.

### Auth Enforcement (requireAuth)

Wraps `resolveAuth()` and adds permission checking, scope enforcement, rate limiting, and internal auth gating.

```typescript
// apps/id/src/lib/auth/require-auth.ts
interface RequireAuthOptions {
  /** Minimum permission level required. Only checked for API key auth. */
  permissions?: ApiKeyPermission; // 'read-only' | 'read-write' | 'admin'
  /** App scope(s) this endpoint serves. Harvest routes use 'hv'. */
  allowedScopes?: string | string[];
  /** Skip rate limiting for this request. */
  skipRateLimit?: boolean;
  /** Allow internal service auth. Defaults to false. */
  allowInternal?: boolean;
}

// Permission hierarchy (numeric levels)
const PERMISSION_LEVEL: Record<ApiKeyPermission, number> = {
  "read-only": 1,
  "read-write": 2,
  admin: 3,
};

type AuthResult =
  | { auth: AuthenticatedContext; error: null }
  | { auth: null; error: NextResponse };

export async function requireAuth(
  request: Request,
  options?: RequireAuthOptions
): Promise<AuthResult> {
  const auth = await resolveAuth(request);
  if (!auth) return { auth: null, error: apiError("Unauthorized", 401) };

  // Reject internal auth unless route explicitly allows it
  if (auth.auth_method === "internal" && !options?.allowInternal) {
    return { auth: null, error: apiError("This endpoint does not accept internal service auth", 403) };
  }

  // Check permission level for API key auth
  if (options?.permissions && auth.auth_method === "api_key" && auth.permissions) {
    const required = PERMISSION_LEVEL[options.permissions];
    const actual = PERMISSION_LEVEL[auth.permissions];
    if (actual < required) {
      return { auth: null, error: apiError(`Insufficient permissions. Required: ${options.permissions}`, 403) };
    }
  }

  // Check app scope for API key auth
  if (options?.allowedScopes && auth.auth_method === "api_key" && auth.scope?.length) {
    const allowed = Array.isArray(options.allowedScopes) ? options.allowedScopes : [options.allowedScopes];
    if (!auth.scope.some((s) => allowed.includes(s))) {
      return { auth: null, error: apiError(`API key scope does not include: ${allowed.join(", ")}`, 403) };
    }
  }

  // Rate limit check for API key auth (atomic, dual window)
  if (auth.auth_method === "api_key" && auth.key_id && auth.rate_limit_per_minute && auth.rate_limit_per_day && !options?.skipRateLimit) {
    const rateResult = await checkRateLimit(auth.key_id, auth.rate_limit_per_minute, auth.rate_limit_per_day);
    if (!rateResult.allowed) {
      const response = NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
      response.headers.set("Retry-After", "60");
      response.headers.set("X-RateLimit-Limit-Minute", String(auth.rate_limit_per_minute));
      response.headers.set("X-RateLimit-Remaining-Minute", String(rateResult.remaining.minute));
      response.headers.set("X-RateLimit-Limit-Day", String(auth.rate_limit_per_day));
      response.headers.set("X-RateLimit-Remaining-Day", String(rateResult.remaining.day));
      return { auth: null, error: response };
    }
  }

  return { auth, error: null };
}
```

### AuthenticatedContext Type

```typescript
// From @kinetiks/types
interface AuthenticatedContext {
  account_id: string;                    // Kinetiks account UUID (or "__internal__" for service auth)
  user_id: string;                       // Supabase auth user UUID (or "__internal__")
  auth_method: "session" | "api_key" | "internal";
  key_id?: string;                       // API key UUID (only for api_key auth)
  permissions?: ApiKeyPermission;        // Only for api_key auth
  scope?: string[];                      // App scopes (only for api_key auth)
  rate_limit_per_minute?: number;        // Only for api_key auth
  rate_limit_per_day?: number;           // Only for api_key auth
}
```

### Using Auth in Harvest API Routes

```typescript
// Pattern for EVERY API route in apps/hv/src/app/api/
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

export async function GET(req: Request) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;

  // auth.account_id is the Kinetiks account UUID
  const { data, error: dbError } = await supabase
    .from('hv_contacts')
    .select('*')
    .eq('kinetiks_id', auth.account_id);

  if (dbError) return apiError(dbError.message, 500, dbError);
  return apiSuccess(data);
}

export async function POST(req: Request) {
  const { auth, error } = await requireAuth(req, {
    permissions: "read-write",
    allowedScopes: "hv",
  });
  if (error) return error;

  const body = await req.json();
  // ... validate, execute, return apiSuccess(result)
}

// For routes called by Edge Functions (CRONs, Sentinel, etc.)
export async function POST(req: Request) {
  const { auth, error } = await requireAuth(req, {
    allowInternal: true,
    allowedScopes: "hv",
  });
  if (error) return error;

  // For internal auth, read the real account_id from the request body
  const body = await req.json();
  const accountId = auth.auth_method === "internal" ? body.account_id : auth.account_id;
  // ... use accountId for queries
}
```

## 1B.3 Rate Limiting

Per-API-key rate limiting is built into `requireAuth()`. Uses an atomic SQL RPC (`increment_rate_limit`) that does upsert + increment in one operation - no TOCTOU race condition. Dual windows: per-minute AND per-day.

**The `increment_rate_limit` RPC already exists in the shared Supabase project.** Do NOT create a separate rate limiting table. Harvest uses the same RPC via `checkRateLimit()`.

```typescript
// apps/id/src/lib/auth/rate-limit.ts (shared implementation)
import type { RateLimitResult } from "@kinetiks/types";

export async function checkRateLimit(
  keyId: string,
  limitPerMinute: number,
  limitPerDay: number
): Promise<RateLimitResult> {
  const now = new Date();
  const minuteStart = new Date(now); minuteStart.setSeconds(0, 0);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);

  // Atomically increment both counters in parallel
  const [minuteResult, dayResult] = await Promise.all([
    admin.rpc("increment_rate_limit", {
      p_key_id: keyId,
      p_window_start: minuteStart.toISOString(),
      p_window_type: "minute",
    }),
    admin.rpc("increment_rate_limit", {
      p_key_id: keyId,
      p_window_start: dayStart.toISOString(),
      p_window_type: "day",
    }),
  ]);

  // Fail open on RPC error (allow request, log error)
  if (minuteResult.error || dayResult.error) {
    console.error("Rate limit RPC error:", minuteResult.error?.message, dayResult.error?.message);
    return { allowed: true, remaining: { minute: limitPerMinute, day: limitPerDay }, reset: { ... } };
  }

  const minuteCount = minuteResult.data as number;
  const dayCount = dayResult.data as number;

  // Post-increment comparison: count > limit (not >=) because the current request is already counted
  if (minuteCount > limitPerMinute || dayCount > limitPerDay) {
    return { allowed: false, remaining: { minute: Math.max(0, limitPerMinute - minuteCount), day: Math.max(0, limitPerDay - dayCount) }, ... };
  }

  return { allowed: true, remaining: { minute: limitPerMinute - minuteCount, day: limitPerDay - dayCount }, ... };
}
```

```typescript
// @kinetiks/types
interface RateLimitResult {
  allowed: boolean;
  remaining: { minute: number; day: number };
  reset: { minute: string; day: string }; // ISO timestamps
}
```

**Rate limit headers on 429 responses** (set by `requireAuth`):
```
X-RateLimit-Limit-Minute: 60
X-RateLimit-Remaining-Minute: 0
X-RateLimit-Limit-Day: 10000
X-RateLimit-Remaining-Day: 9500
Retry-After: 60
```

**Key behaviors:**
- Fails open on RPC error (allows request, logs error) - never blocks users due to infrastructure issues
- Post-increment comparison (`count > limit`, not `>=`) - the current request is already counted
- Both per-minute and per-day windows are checked atomically
- No separate cleanup CRON needed - the `increment_rate_limit` RPC handles window expiration via upsert

## 1B.4 Channel-Agnostic Approval Protocol

The approval system is the critical bridge between the Agent-Native Architecture and Harvest's driving modes. Every proposed action in Approvals mode creates an hv_approvals record. That record is delivered to whichever channels the user has configured. Resolution comes back through any channel - the system doesn't care which.

```typescript
// apps/hv/src/lib/approvals/create.ts
export async function createApproval(params: {
  kinetiks_id: string;
  operator: string;
  function_name: string;
  type: string;
  context: Record<string, any>;
  reference_id?: string;
  reference_type?: string;
  priority?: 'low' | 'standard' | 'high' | 'urgent';
}): Promise<{ approval_id: string }> {
  // 1. Create the approval record
  const { data: approval } = await supabase
    .from('hv_approvals')
    .insert({
      kinetiks_id: params.kinetiks_id,
      operator: params.operator,
      function_name: params.function_name,
      type: params.type,
      context: params.context,
      reference_id: params.reference_id,
      reference_type: params.reference_type,
      priority: params.priority || 'standard',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
    })
    .select('id')
    .single();
  
  // 2. Deliver to all configured channels (fire-and-forget, don't block)
  deliverApproval(params.kinetiks_id, approval!.id).catch(console.error);
  
  return { approval_id: approval!.id };
}

async function deliverApproval(kinetiks_id: string, approval_id: string) {
  const approval = await supabase.from('hv_approvals').select('*').eq('id', approval_id).single();
  
  // Deliver to Slack (if connected)
  const slackToken = await getSlackToken(kinetiks_id);
  if (slackToken) {
    const messageTs = await sendSlackApproval(slackToken, approval.data!);
    await supabase.from('hv_approvals')
      .update({ slack_message_ts: messageTs })
      .eq('id', approval_id);
  }
  
  // Deliver to webhooks (if configured)
  const webhooks = await supabase
    .from('hv_webhook_configs')
    .select('*')
    .eq('kinetiks_id', kinetiks_id)
    .eq('is_active', true)
    .contains('events', ['approval.created']);
  
  for (const webhook of webhooks.data || []) {
    await deliverWebhook(webhook, {
      event: 'approval.created',
      timestamp: new Date().toISOString(),
      kinetiks_id,
      data: {
        approval_id,
        ...approval.data!,
        resolve_url: `${process.env.APP_URL}/api/approvals/${approval_id}/resolve`,
      },
    });
  }
}
```

```typescript
// apps/hv/src/lib/approvals/resolve.ts
export async function resolveApproval(params: {
  approval_id: string;
  kinetiks_id: string;
  decision: 'approve' | 'edit' | 'reject';
  edits?: Record<string, any>;
  reason?: string;
  resolved_by: 'dashboard' | 'slack' | 'webhook' | 'api' | 'autopilot';
}): Promise<ApiResponse> {
  // 1. Verify the approval exists and is pending
  const { data: approval } = await supabase
    .from('hv_approvals')
    .select('*')
    .eq('id', params.approval_id)
    .eq('kinetiks_id', params.kinetiks_id)
    .eq('status', 'pending')
    .single();
  
  if (!approval) return { success: false, error: 'Approval not found or already resolved' };
  
  // 2. Update the approval record
  await supabase.from('hv_approvals').update({
    status: params.decision === 'approve' ? 'approved' : params.decision === 'edit' ? 'edited' : 'rejected',
    resolved_by: params.resolved_by,
    resolved_at: new Date().toISOString(),
    resolution_data: { edits: params.edits, reason: params.reason },
  }).eq('id', params.approval_id);
  
  // 3. Update confidence scoring
  await updateConfidence(approval, params.decision);
  
  // 4. Execute the downstream action
  if (params.decision === 'approve' || params.decision === 'edit') {
    await executeApprovedAction(approval, params.edits);
  }
  
  // 5. Notify webhooks
  await notifyWebhooks(params.kinetiks_id, `approval.${params.decision}d`, { approval_id: params.approval_id });
  
  return { success: true, data: { approval_id: params.approval_id, status: params.decision } };
}
```

### Approval API Endpoints

```typescript
// apps/hv/src/app/api/approvals/route.ts
// GET /api/approvals - list approvals with filters
export async function GET(req: Request) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending'; // 'pending', 'resolved', 'all'
  const operator = url.searchParams.get('operator'); // optional filter
  const page = parseInt(url.searchParams.get('page') || '1');
  const per_page = parseInt(url.searchParams.get('per_page') || '20');
  
  let query = supabase
    .from('hv_approvals')
    .select('*', { count: 'exact' })
    .eq('kinetiks_id', auth.account_id)
    .order('created_at', { ascending: false })
    .range((page - 1) * per_page, page * per_page - 1);
  
  if (status !== 'all') query = query.eq('status', status);
  if (operator) query = query.eq('operator', operator);
  
  const { data, count, error } = await query;
  if (error) return apiError(error.message, 500);
  
  return apiSuccess(data, {
    page,
    per_page,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / per_page),
  });
}

// apps/hv/src/app/api/approvals/[id]/route.ts
// GET /api/approvals/:id - single approval with full context
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  
  const { data, error } = await supabase
    .from('hv_approvals')
    .select('*')
    .eq('id', params.id)
    .eq('kinetiks_id', auth.account_id)
    .single();
  
  if (error || !data) return apiError('Approval not found', 404);
  return apiSuccess(data);
}

// apps/hv/src/app/api/approvals/[id]/resolve/route.ts
// POST /api/approvals/:id/resolve - resolve an approval
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  // Permission check is now handled by requireAuth({ permissions: "read-write" })
  // No need for manual permission check in the route body
  
  const body = await req.json();
  const result = await resolveApproval({
    approval_id: params.id,
    kinetiks_id: auth.account_id,
    decision: body.decision, // 'approve' | 'edit' | 'reject'
    edits: body.edits,
    reason: body.reason,
    resolved_by: auth.auth_method === 'api_key' ? 'api' : 'dashboard',
  });
  
  if (!result.success) return apiError(result.error!, 400);
  return apiSuccess(result.data);
}

// apps/hv/src/app/api/approvals/summary/route.ts
// GET /api/approvals/summary - convenience endpoint for MCP/agents
export async function GET(req: Request) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  
  const { data } = await supabase
    .from('hv_approvals')
    .select('type, priority, operator')
    .eq('kinetiks_id', auth.account_id)
    .eq('status', 'pending');
  
  // Group by type and priority
  const summary = {
    total_pending: data?.length || 0,
    by_type: groupBy(data || [], 'type'),
    by_priority: groupBy(data || [], 'priority'),
    by_operator: groupBy(data || [], 'operator'),
    high_value_count: (data || []).filter(a => a.priority === 'high' || a.priority === 'urgent').length,
  };
  
  return apiSuccess(summary);
}
```

## 1B.5 Webhook Delivery Infrastructure

```typescript
// apps/hv/src/lib/webhooks/deliver.ts
import { createHmac } from 'crypto';

export async function deliverWebhook(
  config: WebhookConfig,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', config.secret).update(body).digest('hex');
  
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kinetiks-Signature': signature,
          'X-Kinetiks-Event': payload.event,
          'X-Kinetiks-Delivery': crypto.randomUUID(),
        },
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });
      
      if (response.ok) {
        // Reset failure counter on success
        await supabase.from('hv_webhook_configs')
          .update({ last_delivered_at: new Date().toISOString(), consecutive_failures: 0 })
          .eq('id', config.id);
        return;
      }
      
      // Non-2xx response - retry with backoff
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
      }
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  // All retries failed - increment failure counter
  const { data: updated } = await supabase.from('hv_webhook_configs')
    .update({ consecutive_failures: config.consecutive_failures + 1 })
    .eq('id', config.id)
    .select('consecutive_failures')
    .single();
  
  // Auto-disable after 10 consecutive failures
  if (updated && updated.consecutive_failures >= 10) {
    await supabase.from('hv_webhook_configs')
      .update({ is_active: false })
      .eq('id', config.id);
  }
}

// Webhook payload envelope (consistent across all events)
export interface WebhookPayload {
  event: string;
  timestamp: string;
  kinetiks_id: string;
  data: Record<string, any>;
}

// Helper: notify all active webhooks for an event
export async function notifyWebhooks(
  kinetiks_id: string,
  event: string,
  data: Record<string, any>
): Promise<void> {
  const { data: configs } = await supabase
    .from('hv_webhook_configs')
    .select('*')
    .eq('kinetiks_id', kinetiks_id)
    .eq('is_active', true);
  
  const matching = (configs || []).filter(c => c.events.includes(event));
  
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    kinetiks_id,
    data,
  };
  
  // Deliver to all matching webhooks in parallel (fire-and-forget)
  await Promise.allSettled(matching.map(c => deliverWebhook(c, payload)));
}
```

## 1B.6 Convenience Aggregation Endpoints

LLMs and agents work best with pre-composed context. These endpoints aggregate commonly-needed data into single responses.

```typescript
// apps/hv/src/app/api/harvest/daily-brief/route.ts
// GET /api/harvest/daily-brief
export async function GET(req: Request) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  
  const today = new Date().toISOString().slice(0, 10);
  const kid = auth.account_id;
  
  const [pipeline, approvals, todayActivity, campaigns, wins] = await Promise.all([
    // Pipeline summary
    supabase.from('hv_deals').select('stage, value').eq('kinetiks_id', kid)
      .not('stage', 'in', '("won","lost")'),
    // Pending approvals count
    supabase.from('hv_approvals').select('type, priority', { count: 'exact' })
      .eq('kinetiks_id', kid).eq('status', 'pending'),
    // Today's activity
    supabase.from('hv_activities').select('type').eq('kinetiks_id', kid)
      .gte('created_at', `${today}T00:00:00Z`),
    // Active campaigns
    supabase.from('hv_campaigns').select('name, stats').eq('kinetiks_id', kid)
      .eq('status', 'active'),
    // Recent wins (last 7 days)
    supabase.from('hv_deals').select('name, value, closed_at, win_reason_category')
      .eq('kinetiks_id', kid).eq('stage', 'won')
      .gte('closed_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);
  
  // Aggregate activity counts
  const activityCounts: Record<string, number> = {};
  for (const a of todayActivity.data || []) {
    activityCounts[a.type] = (activityCounts[a.type] || 0) + 1;
  }
  
  return apiSuccess({
    date: today,
    pipeline: {
      total_deals: pipeline.data?.length || 0,
      total_value: (pipeline.data || []).reduce((s, d) => s + (d.value || 0), 0),
      by_stage: groupBy(pipeline.data || [], 'stage'),
    },
    approvals: {
      pending_count: approvals.count || 0,
      by_type: groupBy(approvals.data || [], 'type'),
      high_priority: (approvals.data || []).filter(a => a.priority === 'high' || a.priority === 'urgent').length,
    },
    today_activity: activityCounts,
    active_campaigns: (campaigns.data || []).map(c => ({ name: c.name, ...c.stats })),
    recent_wins: wins.data || [],
  });
}

// apps/hv/src/app/api/harvest/prospect/[id]/full/route.ts
// GET /api/harvest/prospect/:id/full - everything about a prospect in one call
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  
  const kid = auth.account_id;
  
  const [contact, org, activities, emails, calls, deals] = await Promise.all([
    supabase.from('hv_contacts').select('*').eq('id', params.id).eq('kinetiks_id', kid).single(),
    // Org (if contact has one)
    supabase.from('hv_contacts').select('org_id').eq('id', params.id).single()
      .then(r => r.data?.org_id
        ? supabase.from('hv_organizations').select('*').eq('id', r.data.org_id).single()
        : { data: null }),
    supabase.from('hv_activities').select('*').eq('contact_id', params.id).eq('kinetiks_id', kid)
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('hv_emails').select('*').eq('contact_id', params.id).eq('kinetiks_id', kid)
      .order('created_at', { ascending: false }),
    supabase.from('hv_calls').select('*').eq('contact_id', params.id).eq('kinetiks_id', kid)
      .order('created_at', { ascending: false }),
    supabase.from('hv_deals').select('*').eq('contact_id', params.id).eq('kinetiks_id', kid),
  ]);
  
  if (!contact.data) return apiError('Contact not found', 404);
  
  return apiSuccess({
    contact: contact.data,
    organization: org.data,
    activities: activities.data,
    emails: emails.data,
    calls: calls.data,
    deals: deals.data,
  });
}
```

## 1B.7 Webhook Configuration API

```typescript
// apps/hv/src/app/api/settings/webhooks/route.ts
// GET /api/settings/webhooks - list webhook configs
export async function GET(req: Request) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  
  const { data } = await supabase.from('hv_webhook_configs').select('*')
    .eq('kinetiks_id', auth.account_id);
  
  return apiSuccess(data);
}

// POST /api/settings/webhooks - create webhook config
export async function POST(req: Request) {
  const { auth, error } = await requireAuth(req, { allowedScopes: "hv" });
  if (error) return error;
  // Permission check is now handled by requireAuth({ permissions: "read-write" })
  // No need for manual permission check in the route body
  
  const body = await req.json();
  const { data, error } = await supabase.from('hv_webhook_configs').insert({
    kinetiks_id: auth.account_id,
    url: body.url,
    events: body.events,
    secret: body.secret || crypto.randomUUID(), // auto-generate if not provided
    is_active: true,
  }).select('*').single();
  
  if (error) return apiError(error.message, 400);
  return apiSuccess(data);
}
```

---

# PART 1C: KNOWLEDGE INTEGRATION SYSTEM

Every Harvest operator loads marketing methodology dynamically from `@kinetiks/ai` via `loadKnowledge()`. This gives operators deep marketing expertise without bloating every system prompt. 13 modules, 35+ markdown files, automatic scoring and token budgeting.

**Full integration guide:** `docs/KNOWLEDGE_INTEGRATION.md`

## 1C.1 How to Wire Knowledge Into Operators

```typescript
import { loadKnowledge } from "@kinetiks/ai";

// 1. Load knowledge relevant to what the operator is doing
const knowledge = await loadKnowledge({
  operator: "composer",         // operator name from the registry
  intent: "write_cold_email",   // task intent - determines which modules load
  tokenBudget: 2500,            // stay within budget (1500-2500 range)
  forceModules: ["email"],      // guarantee specific module loads
  excludeModules: ["social"],   // prevent irrelevant modules from consuming budget
});

// 2. Inject into the system prompt
const systemPrompt = `${OPERATOR_PERSONA}
${contextStructureLayers}

## Marketing Methodology
${knowledge.content}`;
```

**Rules:**
- Token budget: 1500-2500 tokens (leave room for Context Structure and conversation history)
- Always wrap in try/catch - knowledge loading is non-blocking, never fail the main operation
- `knowledge.content` may be empty string on failure - handle gracefully
- `knowledge.modulesLoaded`, `knowledge.filesLoaded`, `knowledge.tokensUsed` available for debugging

## 1C.2 Harvest Operator Mappings

Each operator loads different knowledge based on the task:

**Composer (writes outbound emails):**
```typescript
// Cold first-touch email
loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 2500 })
// Loads: email/cold-outreach + email/subject-lines + copywriting/frameworks + persona-messaging/mapping + persona-messaging/personalization-depth

// Follow-up emails
loadKnowledge({ operator: "composer", intent: "write_follow_up", tokenBudget: 2000 })
// Loads: email/cold-outreach (follow-up section) + objection-handling/stage-framework + objection-handling/proof-escalation

// Voice call scripts
loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 2000, forceModules: ["objection-handling"] })
// Loads: objection-handling/stage-framework + persona-messaging/personalization-depth
```

**Concierge (classifies and responds to replies):**
```typescript
// Objection handling
loadKnowledge({ operator: "composer", intent: "write_follow_up", tokenBudget: 2000, forceModules: ["objection-handling"] })
// Loads: objection-handling/stage-framework + objection-handling/proof-escalation

// General reply response
loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 1500, excludeModules: ["seo", "social"] })
// Loads: email/cold-outreach + copywriting/frameworks
```

**Keeper (manages sequences and CRM):**
```typescript
loadKnowledge({ operator: "keeper", intent: "build_email_sequence", tokenBudget: 2000 })
// Loads: email/sequence-patterns + email/deliverability + campaign-orchestration/touchpoint-design
```

**Scout (finds and qualifies prospects):**
```typescript
loadKnowledge({ operator: "scout", intent: "audience_research", tokenBudget: 1500 })
// Loads: persona-messaging/personalization-depth (trigger events, signal-to-message mapping)
```

**Navigator (scores deals):**
```typescript
loadKnowledge({ operator: "navigator", intent: "strategic_advice", tokenBudget: 1500 })
// Loads: objection-handling/stage-framework (deal stage definitions, progression signals)
```

**Analyst (performance analysis):**
```typescript
loadKnowledge({ operator: "analyst", intent: "performance_analysis", tokenBudget: 2000, forceModules: ["attribution"] })
// Loads: attribution/model + attribution/reporting
```

## 1C.3 Relevant Module Reference

| Module | Key Files | Harvest Consumers |
|--------|-----------|-------------------|
| email | cold-outreach, subject-lines, sequence-patterns, deliverability | Composer, Keeper, Postmaster |
| copywriting | frameworks, headlines, cta-patterns | Composer |
| persona-messaging | mapping, personalization-depth | Composer, Scout |
| objection-handling | stage-framework, proof-escalation | Composer, Concierge, Navigator |
| campaign-orchestration | channel-sequencing, touchpoint-design | Keeper, Analyst |
| attribution | model, reporting | Analyst |
| content-quality | audit-rubric, voice-drift | Sentinel (for Harvest content review) |

## 1C.4 Token Budget Guidelines

Total system prompt budget: ~8000-12000 tokens. Allocation:
- Static persona + rules: ~1500 tokens
- Context Structure layers: ~3000-5000 tokens (varies by intent)
- **Knowledge: ~1500-2500 tokens** (this is your budget)
- Conversation history: ~1000-2000 tokens
- Other: ~500 tokens

Don't exceed 2500 tokens for knowledge. Use `forceModules` to prioritize critical modules and `excludeModules` to drop irrelevant ones.

---

# PART 2: PROMPT ARCHITECTURE

## 2.1 Composer Prompts

### System Prompt - First Touch Email

```
You are Composer, the outreach copywriting agent for Harvest. You write cold outreach emails on behalf of the user. Your goal is to write emails that get replies - not meetings, replies.

VOICE PROFILE (from Context Structure - Voice layer):
{voice_layer_json}

This is how the user writes. Match their tone, vocabulary, sentence length, formality level, and personality. If they are casual, be casual. If they are sharp and direct, be sharp and direct. Never default to generic professional tone.

PRODUCTS (from Context Structure - Products layer):
{products_layer_json}

These are the user's actual products, features, differentiators, and value propositions. Use specific features and real differentiators, not generic descriptions. Never say "our solution" - name the product.

CUSTOMER PAIN POINTS (from Context Structure - Customers layer):
{customers_layer_json}

These are real pain points from real customer data. Address the ones most relevant to this specific prospect.

COMPETITIVE POSITIONING (from Context Structure - Competitive layer):
{competitive_layer_json}

If the prospect uses a competitor, position against them using these specific differentiators. Never disparage - differentiate.

NARRATIVE (from Context Structure - Narrative layer):
{narrative_layer_json}

The user's story and positioning. Use when the "why this matters" framing strengthens the email.

MARKETING METHODOLOGY (loaded dynamically via knowledge system):
{knowledge_content}

Apply these frameworks and best practices when crafting the email. These are distilled from proven cold outreach patterns.
```

**Knowledge loading for this prompt:**
```typescript
const knowledge = await loadKnowledge({
  operator: "composer",
  intent: "write_cold_email",
  tokenBudget: 2500,
});
// Inject knowledge.content into the {knowledge_content} placeholder
```

### User Prompt - First Touch Email

```
Write a first-touch cold email for this prospect.

PROSPECT RESEARCH BRIEF:
Name: {first_name} {last_name}
Title: {title} at {company_name}
Company: {company_description_from_crawl}
Industry: {industry}
Company size: {employee_count}
Tech stack: {tech_stack}
Recent news: {recent_news_from_crawl}
LinkedIn activity: {recent_linkedin_posts_summary}
Mutual connections: {mutual_connections}
Signal that triggered outreach: {trigger_signal}
Competitor detected: {competitor_if_any}
CRM history: {previous_interactions_if_any}

RULES:
- 3-5 sentences maximum. Every sentence must earn its place.
- Open with something specific about the prospect or their company. Never open with "I hope this email finds you well" or "My name is."
- Connect their situation to ONE specific value proposition from the Products layer.
- End with a question, not a meeting request. The goal is a reply.
- Subject line: 4-8 words, specific and curiosity-driven. Never clickbait.
- Do NOT use "I" as the first word.
- Do NOT use em dashes. Use regular dashes (-) only.
- Write in the user's voice from the Voice Profile. If unsure, err toward concise and direct.

{if cc_mode}
CC MODE: This email goes to {primary_name} ({primary_title}) with {cc_name} ({cc_title}) on CC. Write the email so the CC looks good for surfacing this to the primary. Acknowledge both recipients naturally. The CC is the champion - make them look smart for connecting this.
{/if}

Return JSON:
{
  "subject": "...",
  "body": "...",
  "body_plain": "...",
  "reasoning": "Why I chose this angle and this opening hook"
}
```

### User Prompt - Follow-Up Email

```
Write follow-up #{step_number} for this prospect.

PREVIOUS EMAILS IN SEQUENCE:
{previous_emails_with_subjects_and_bodies}

PROSPECT STATUS:
- Emails sent: {count}
- Opens: {open_count}
- Last opened: {last_open_date_or_never}
- Replies: {reply_count}

NEW CONTEXT SINCE LAST EMAIL (if any):
{new_company_news}
{new_linkedin_activity}
{new_signals}

RULES:
- Add NEW value with each follow-up. Never "just following up."
- Reference a different angle, pain point, or value prop than previous emails.
- If the prospect opened previous emails but did not reply, they are interested but not convinced. Increase specificity.
- If the prospect never opened, try a completely different subject line approach.
- Shorter than the first touch. 2-4 sentences.
- If this is the final email in the sequence (breakup), be gracious. Leave the door open. No guilt.
- Do NOT repeat the opening hook from any previous email.
- Do NOT use em dashes.

{if content_available}
DARK MADDER CONTENT AVAILABLE FOR THIS PROSPECT:
{relevant_content_pieces_with_urls}
Consider sharing a relevant piece as the value-add for this follow-up.
{/if}

Return JSON:
{
  "subject": "...",
  "body": "...",
  "body_plain": "...",
  "reasoning": "Why this angle is different from previous emails"
}
```

### User Prompt - Voice Call Script

```
Write a conversational phone script for an AI voice agent calling this prospect.

CALL TYPE: {follow_up | qualification | re_engagement}
PROSPECT CONTEXT:
{same research brief as email}

PREVIOUS OUTREACH HISTORY:
{emails_sent_and_their_status}

RULES:
- Opening MUST include AI disclosure: "Hi {first_name}, this is {user_name}'s AI assistant calling on their behalf."
- Natural, warm, conversational. Not a telemarketing script.
- Maximum 2 minutes expected call duration.
- Include branching for common responses (interested, not interested, asking questions, wrong time).
- Include a voicemail script if they don't answer (30 seconds max).
- CTA: book a meeting or offer a callback time.
- Escalation trigger phrases: mentions of legal, pricing specifics, anger/frustration, "speak to a real person."

Return JSON:
{
  "opening": "...",
  "value_prop": "...",
  "branches": {
    "interested": "...",
    "not_interested": "...",
    "question": "...",
    "busy": "...",
    "who_are_you": "..."
  },
  "objection_handlers": {
    "price": "...",
    "timing": "...",
    "competitor": "...",
    "not_relevant": "..."
  },
  "cta": "...",
  "voicemail": "...",
  "escalation_triggers": ["pricing specifics", "legal mention", "angry tone", "speak to real person"]
}
```

### Post-Generation Sentinel Review (MANDATORY)

Every email draft, call script, and LinkedIn message generated by Composer MUST pass through Sentinel before delivery or user approval. This is the pre-delivery quality gate.

```typescript
// apps/hv/src/lib/sentinel/review.ts - Harvest's Sentinel client
const SENTINEL_URL = `${process.env.KINETIKS_ID_API_URL}/api/sentinel/review`;

export async function reviewContent(params: {
  account_id: string;
  content: string;
  content_type: SentinelContentType; // 'cold_email' | 'follow_up_email' | 'linkedin_dm' | 'voice_call_script' | etc.
  contact_email?: string;
  org_domain?: string;
}): Promise<SentinelReviewResult> {
  const response = await fetch(SENTINEL_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_id: params.account_id,
      source_app: "harvest",
      source_operator: "composer",
      content_type: params.content_type,
      content: params.content,
      contact_email: params.contact_email,
      org_domain: params.org_domain,
    }),
  });

  return await response.json();
}
```

**Sentinel returns:**
```typescript
interface SentinelReviewResult {
  review_id: string;
  verdict: "approved" | "flagged" | "held";
  quality_score: number;      // 0-100 composite from 7 editorial dimensions
  flags: SentinelFlag[];      // [{category, severity, detail, suggested_action}]
  fatigue: { ok: boolean; reason?: string };
  compliance: { ok: boolean; issues?: string[] };
}
```

**How to wire into the email pipeline:**
1. Composer generates draft
2. Call `reviewContent()` with `content_type: 'cold_email'`
3. Store `sentinel_verdict`, `sentinel_flags`, `sentinel_quality_score` on `hv_emails`
4. If `approved`: mark email ready for scheduling/approval
5. If `flagged`: present to user in approval queue WITH the flags highlighted
6. If `held`: block send, require explicit user override via `/api/sentinel/override`

**Content types relevant to Harvest:**
- `cold_email` - first-touch outbound emails
- `follow_up_email` - sequence follow-ups
- `auto_reply` - Concierge auto-responses
- `linkedin_connect` - LinkedIn connection request notes
- `linkedin_dm` - LinkedIn direct messages
- `voice_call_script` - AI call scripts
- `voicemail_script` - voicemail messages

**Sentinel fallback:** If the AI editorial call fails, Sentinel returns a conservative score of 50 with a "manual review recommended" flag. The email pipeline should route these to the approval queue rather than blocking entirely.

---

## 2.2 Concierge Prompts

### Classification Prompt

```
Classify this email reply into exactly one category.

ORIGINAL OUTREACH:
Subject: {original_subject}
Body: {original_body}

REPLY:
From: {reply_from}
Body: {reply_body}

CATEGORIES:
1. interested - wants to learn more, open to a conversation or meeting
2. objection - specific concern (price, timing, fit, competitor, feature gap)
3. not_now - interested but bad timing, explicitly mentions a future timeframe
4. not_interested - clear no, does not want to be contacted
5. wrong_person - they are not the right contact, may refer someone else
6. ooo - out of office auto-reply
7. question - asking for specific information before committing
8. meeting_request - explicitly asking to meet, proposing times, requesting a calendar link
9. unsubscribe - requesting removal from emails, "stop emailing me", "remove me"

Return JSON:
{
  "classification": "one of the 9 categories",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "extracted_data": {
    "return_date": "ISO date if OOO",
    "referred_person": {"name": "...", "email": "...", "title": "..."} if wrong_person and referral given,
    "objection_type": "price|timing|fit|competitor|feature_gap" if objection,
    "competitor_mentioned": "name" if competitor mentioned,
    "proposed_times": [] if meeting_request with times,
    "question_topic": "..." if question,
    "sentiment": "positive|neutral|negative"
  }
}
```

### Response Generation Prompt (per classification)

**Knowledge loading for Concierge:**
```typescript
// For objection replies
const knowledge = await loadKnowledge({
  operator: "composer", intent: "write_follow_up", tokenBudget: 2000,
  forceModules: ["objection-handling"],
});

// For general replies (interested, question, etc.)
const knowledge = await loadKnowledge({
  operator: "composer", intent: "write_cold_email", tokenBudget: 1500,
  excludeModules: ["seo", "social"],
});
```

**Post-generation:** All Concierge auto-replies MUST pass through Sentinel review (same pattern as Composer). Use `content_type: 'auto_reply'`.

**Intelligence extraction:** When Concierge classifies objections, competitor mentions, or buying signals, these should flow back to the Kinetiks ID via Proposals through the Harvest Synapse. See Part 5, Day 23 for Synapse promote logic.

```
You are Concierge, the reply management agent for Harvest. You respond to prospect replies in the user's voice.

VOICE PROFILE: {voice_layer_json}
PRODUCTS: {products_layer_json}
COMPETITIVE: {competitive_layer_json}

MARKETING METHODOLOGY:
{knowledge_content}

CLASSIFICATION: {classification}
CONFIDENCE: {confidence}
ORIGINAL THREAD: {full_thread}

{if classification == "objection"}
OBJECTION TYPE: {objection_type}
Handle this objection using the Competitive and Products layers. Be empathetic, specific, and honest. If the objection is valid (a real feature gap), acknowledge it and redirect to strengths. Never lie about capabilities.
{/if}

{if classification == "interested"}
Move toward a meeting. Offer specific times or a calendar link. Be efficient - they said yes, don't oversell.
{/if}

{if classification == "question"}
Answer accurately using the Products layer. Be specific and helpful. End with a soft CTA toward a meeting.
{/if}

{if classification == "not_now"}
Acknowledge gracefully. Confirm the timeframe. Set a reminder for re-engagement. Leave the door open.
{/if}

{if classification == "not_interested"}
Thank them. Be gracious. No guilt. Remove from sequence. This protects the brand.
{/if}

RULES:
- Match the user's Voice Profile exactly.
- Keep replies shorter than the original outreach. They are in a conversation now, not reading a pitch.
- Never use em dashes.
- If confidence < 0.7, add "escalate": true to the response.

Return JSON:
{
  "response_body": "...",
  "response_plain": "...",
  "escalate": false,
  "escalation_reason": null,
  "actions": [
    {"type": "book_meeting", "calendar_link": "..."},
    {"type": "schedule_re_engagement", "date": "..."},
    {"type": "add_to_scout", "person": {...}},
    {"type": "remove_from_sequence"},
    {"type": "add_suppression", "reason": "..."}
  ]
}
```

---

# PART 3: ELEVENLABS + TWILIO VOICE CALLING

## 3.1 Architecture Overview

```
[Navigator schedules call]
        |
        v
[Sentinel pre-approves script]
        |
        v
[Twilio creates outbound call] --> [Prospect's phone rings]
        |                                    |
        v                                    v
[Twilio Media Stream websocket]     [Prospect answers]
        |                                    |
        v                                    v
[ElevenLabs Conversational AI] <----> [Audio bidirectional stream]
        |
        v
[Real-time transcript] --> [Sentinel monitors] --> [Human transfer if needed]
        |
        v
[Call ends] --> [Transcript saved to hv_calls] --> [Analyst extracts key moments]
```

## 3.2 ElevenLabs Setup

Use ElevenLabs Conversational AI API (not the basic TTS API). This provides:
- Real-time conversational AI agent
- Custom voice (cloned from user's samples)
- Websocket-based audio streaming
- Tool use during conversation (for calendar booking, CRM lookups)

### Voice Cloning

During Kinetiks ID onboarding (Cartographer), the user provides voice samples for the Voice layer. These same samples are used to create a custom ElevenLabs voice clone.

```typescript
// apps/hv/src/lib/voice/elevenlabs.ts
import { ElevenLabsClient } from 'elevenlabs';

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

export async function createVoiceClone(kineticsId: string, audioSamples: Buffer[]): Promise<string> {
  const voice = await client.voices.add({
    name: `harvest-${kineticsId}`,
    files: audioSamples,
    description: 'Cloned voice for Harvest outbound calls',
  });
  return voice.voice_id;
}
```

### Conversational Agent Configuration

```typescript
// apps/hv/src/lib/voice/agent-config.ts
export function buildAgentConfig(script: CallScript, contextStructure: ContextStructure) {
  return {
    agent: {
      prompt: {
        prompt: buildCallSystemPrompt(script, contextStructure),
      },
      first_message: script.opening,
      language: 'en',
    },
    conversation_config: {
      // Turn detection - when the prospect stops talking
      turn: {
        mode: 'server_vad', // server-side voice activity detection
        silence_duration_ms: 700, // wait 700ms of silence before responding
      },
      // TTS (text-to-speech) settings
      tts: {
        voice_id: script.voice_id, // user's cloned voice
        model_id: 'eleven_turbo_v2_5',
        optimize_streaming_latency: 3,
      },
    },
  };
}

function buildCallSystemPrompt(script: CallScript, cs: ContextStructure): string {
  return `You are making a phone call on behalf of ${cs.org.company_name}. 
You sound exactly like the user - warm, natural, conversational.

IMPORTANT RULES:
- Your first words MUST be the AI disclosure: "${script.opening}"
- Keep responses conversational and brief. This is a phone call, not a monologue.
- Maximum 2 sentences per response.
- If the prospect asks about specific pricing, says anything about lawyers or legal, sounds angry, or asks to speak to a real person, say: "Let me connect you with ${cs.org.contact_name} directly - one moment" and trigger the transfer tool.

PRODUCTS: ${JSON.stringify(cs.products)}
VALUE PROPOSITION: ${script.value_prop}
OBJECTION HANDLERS: ${JSON.stringify(script.objection_handlers)}
CALL-TO-ACTION: ${script.cta}

If the call goes to voicemail, leave this message: "${script.voicemail}"`;
}
```

## 3.3 Twilio Integration

### Outbound Call Flow

```typescript
// apps/hv/src/lib/voice/twilio.ts
import twilio from 'twilio';

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function initiateCall(params: {
  from: string;       // Twilio number
  to: string;         // Prospect's number
  callId: string;     // hv_calls record ID
  agentConfig: any;   // ElevenLabs agent config
}): Promise<string> {
  const call = await twilioClient.calls.create({
    from: params.from,
    to: params.to,
    url: `${process.env.APP_URL}/api/voice/twiml/${params.callId}`,
    statusCallback: `${process.env.APP_URL}/api/voice/status/${params.callId}`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    machineDetection: 'DetectMessageEnd', // detect voicemail
  });
  
  return call.sid;
}
```

### TwiML Endpoint (connects Twilio audio to ElevenLabs)

```typescript
// apps/hv/src/app/api/voice/twiml/[callId]/route.ts
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { callId: string } }) {
  const formData = await req.formData();
  const answeredBy = formData.get('AnsweredBy');
  
  // If voicemail detected, play the voicemail script
  if (answeredBy === 'machine_end_beep') {
    const call = await getCallRecord(params.callId);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
       <Response>
         <Play>${call.voicemail_audio_url}</Play>
         <Hangup/>
       </Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }
  
  // Human answered - connect to ElevenLabs via websocket stream
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>
     <Response>
       <Connect>
         <Stream url="wss://${process.env.APP_URL}/api/voice/stream/${params.callId}" />
       </Connect>
     </Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  );
}
```

### Websocket Bridge (Twilio <-> ElevenLabs)

```typescript
// apps/hv/src/app/api/voice/stream/[callId]/route.ts
// This is the critical piece - bridges Twilio's audio stream to ElevenLabs Conversational AI

export async function GET(req: Request, { params }: { params: { callId: string } }) {
  // Upgrade to websocket
  // Twilio sends audio chunks (mulaw 8kHz)
  // ElevenLabs expects PCM 16kHz
  // Need audio format conversion in both directions
  
  // 1. Open websocket to ElevenLabs Conversational AI
  // 2. On Twilio audio chunk: convert mulaw->PCM, forward to ElevenLabs
  // 3. On ElevenLabs audio response: convert PCM->mulaw, forward to Twilio
  // 4. On ElevenLabs transcript event: forward to Sentinel for real-time monitoring
  // 5. On escalation trigger: initiate warm transfer via Twilio conference
  
  // Implementation uses the ElevenLabs websocket API:
  // wss://api.elevenlabs.io/v1/convai/conversation
  // With the agent config built in agent-config.ts
}
```

### Warm Transfer (escalation to human)

```typescript
// apps/hv/src/lib/voice/transfer.ts
export async function warmTransfer(callSid: string, userPhoneNumber: string, contextSummary: string) {
  // 1. Put current call into a conference
  await twilioClient.calls(callSid).update({
    twiml: `<Response>
      <Say>Connecting you now, one moment.</Say>
      <Dial>
        <Conference>${callSid}-transfer</Conference>
      </Dial>
    </Response>`,
  });
  
  // 2. Call the user and connect them to the same conference
  await twilioClient.calls.create({
    from: process.env.TWILIO_TRANSFER_NUMBER,
    to: userPhoneNumber,
    twiml: `<Response>
      <Say>Incoming transfer from Harvest. ${contextSummary}</Say>
      <Dial>
        <Conference>${callSid}-transfer</Conference>
      </Dial>
    </Response>`,
  });
  
  // 3. Disconnect the AI agent from the conference
  // The user and prospect are now on a direct call
}
```

## 3.4 Real-Time Sentinel Monitoring

```typescript
// During the ElevenLabs websocket stream, transcript events are forwarded to Sentinel
export async function monitorTranscript(
  callId: string,
  transcriptChunk: string,
  escalationTriggers: string[]
): Promise<{ action: 'continue' | 'transfer' | 'flag' }> {
  // Check for escalation trigger phrases
  const lowerChunk = transcriptChunk.toLowerCase();
  for (const trigger of escalationTriggers) {
    if (lowerChunk.includes(trigger.toLowerCase())) {
      return { action: 'transfer' };
    }
  }
  
  // Sentinel brand safety check on accumulated transcript
  // This runs every ~5 seconds, not on every chunk
  // Uses a lightweight Claude Haiku call for speed
  const sentinelResult = await sentinelRealtimeCheck(callId, transcriptChunk);
  if (sentinelResult.hold) {
    return { action: 'transfer' };
  }
  
  return { action: 'continue' };
}
```

---

# PART 4: EXTERNAL SERVICE INTEGRATION

## 4.1 Enrichment Waterfall

```typescript
// apps/hv/src/lib/enrichment/waterfall.ts

export interface EnrichmentResult {
  contact: Partial<Contact>;
  organization: Partial<Organization>;
  source: string;
  cost_credits: number;
}

export async function enrichContact(
  email: string,
  domain: string,
  kineticsId: string
): Promise<EnrichmentResult> {
  // 1. Check cache - don't re-enrich within 30 days
  const cached = await getCachedEnrichment(email, domain, kineticsId);
  if (cached && daysSince(cached.last_enriched_at) < 30) {
    return cached;
  }
  
  // 2. PDL first (cheapest, ~$0.01/record)
  const pdlResult = await enrichViaPDL(email, domain);
  if (pdlResult.confidence > 0.8 && pdlResult.contact.email) {
    return { ...pdlResult, source: 'pdl', cost_credits: 1 };
  }
  
  // 3. Apollo fallback (~$0.03/record)
  const apolloResult = await enrichViaApollo(email, domain);
  if (apolloResult.contact.email) {
    // Merge PDL partial data with Apollo
    return {
      contact: { ...pdlResult.contact, ...apolloResult.contact },
      organization: { ...pdlResult.organization, ...apolloResult.organization },
      source: 'apollo+pdl',
      cost_credits: 4,
    };
  }
  
  // 4. Return best available (even partial)
  return { ...pdlResult, source: 'pdl_partial', cost_credits: 1 };
}

// Tech stack enrichment (separate waterfall)
export async function enrichTechStack(domain: string): Promise<string[]> {
  // BuiltWith API
  const result = await fetch(`https://api.builtwith.com/v21/api.json?KEY=${process.env.BUILTWITH_KEY}&LOOKUP=${domain}`);
  // Parse and return technology names
}
```

## 4.2 Email Verification Waterfall

```typescript
// apps/hv/src/lib/verification/verify.ts

export type VerificationGrade = 'A' | 'B' | 'C' | 'D';

export interface VerificationResult {
  grade: VerificationGrade;
  details: {
    syntax: boolean;
    mx: boolean;
    smtp: 'valid' | 'invalid' | 'catch_all' | 'unknown';
    risk: 'low' | 'medium' | 'high';
    disposable: boolean;
    role_based: boolean; // info@, sales@, etc.
  };
}

export async function verifyEmail(email: string): Promise<VerificationResult> {
  // Step 1: Syntax check (free, instant)
  if (!isValidEmailSyntax(email)) {
    return { grade: 'D', details: { syntax: false, mx: false, smtp: 'invalid', risk: 'high', disposable: false, role_based: false } };
  }
  
  // Step 2: MX record lookup (free, fast)
  const hasMX = await checkMXRecord(email.split('@')[1]);
  if (!hasMX) {
    return { grade: 'D', details: { syntax: true, mx: false, smtp: 'invalid', risk: 'high', disposable: false, role_based: false } };
  }
  
  // Step 3: ZeroBounce API (~$0.01/verification)
  const zbResult = await zeroBounceVerify(email);
  
  // Step 4: Grade assignment
  const details = {
    syntax: true,
    mx: true,
    smtp: zbResult.status, // 'valid', 'invalid', 'catch_all', 'unknown'
    risk: zbResult.sub_status === 'possible_trap' ? 'high' : zbResult.free_email ? 'medium' : 'low',
    disposable: zbResult.disposable,
    role_based: zbResult.role_based || isRoleEmail(email),
  };
  
  let grade: VerificationGrade = 'D';
  if (details.smtp === 'valid' && details.risk === 'low' && !details.disposable && !details.role_based) grade = 'A';
  else if (details.smtp === 'valid' && !details.disposable) grade = 'B';
  else if (details.smtp === 'catch_all') grade = 'C'; // catch-all requires manual review
  
  return { grade, details };
}
```

## 4.3 LinkedIn Integration (via third-party)

Decision: **Use Heyreach API** for v1. Browser automation is too fragile for launch. Heyreach provides:
- Profile view, connection request, message send, InMail
- Rate limiting built in
- Anti-detection measures
- Webhook callbacks for connection accepts and replies

If Heyreach is not available or too expensive, fall back to **PhantomBuster**.

```typescript
// apps/hv/src/lib/linkedin/client.ts

export async function linkedinAction(params: {
  type: 'view' | 'connect' | 'message' | 'engage';
  linkedinUrl: string;
  message?: string; // for connect/message
  kineticsId: string;
}): Promise<{ success: boolean; error?: string }> {
  // Check daily rate limits
  const todayActions = await getDailyLinkedInActions(params.kineticsId, params.type);
  const limits = { view: 80, connect: 25, message: 25, engage: 30 };
  if (todayActions >= limits[params.type]) {
    return { success: false, error: `Daily ${params.type} limit reached (${limits[params.type]})` };
  }
  
  // Execute via third-party API
  const result = await heyreachClient.execute({
    action: params.type,
    profile_url: params.linkedinUrl,
    message: params.message,
  });
  
  // Log activity
  await logActivity(params.kineticsId, `linkedin_${params.type}`, { linkedinUrl: params.linkedinUrl });
  
  return result;
}
```

## 4.4 Email Sending (via Amazon SES)

```typescript
// apps/hv/src/lib/email/sender.ts
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: process.env.AWS_REGION });

export async function sendEmail(params: {
  mailbox: Mailbox;
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
  bodyPlain: string;
  unsubscribeUrl: string;
  physicalAddress: string;
}): Promise<{ messageId: string }> {
  // 1. Pre-send checks
  if (await checkSuppression(params.to)) throw new Error('Contact is suppressed');
  if (!params.mailbox.is_active) throw new Error('Mailbox is paused');
  if (params.mailbox.daily_sent_today >= params.mailbox.daily_limit) throw new Error('Daily limit reached');
  
  // 2. Add compliance elements
  const htmlWithCompliance = addComplianceFooter(params.bodyHtml, params.unsubscribeUrl, params.physicalAddress);
  
  // 3. Send via SES
  const command = new SendEmailCommand({
    FromEmailAddress: `${params.mailbox.display_name} <${params.mailbox.email}>`,
    Destination: {
      ToAddresses: [params.to],
      CcAddresses: params.cc ? [params.cc] : undefined,
    },
    Content: {
      Simple: {
        Subject: { Data: params.subject },
        Body: {
          Html: { Data: htmlWithCompliance },
          Text: { Data: params.bodyPlain },
        },
      },
    },
    ListManagementOptions: {
      ContactListName: 'harvest-unsubscribes',
    },
    // List-Unsubscribe header for one-click unsubscribe (RFC 8058)
    Headers: [
      { Name: 'List-Unsubscribe', Value: `<${params.unsubscribeUrl}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ],
  });
  
  const result = await ses.send(command);
  
  // 4. Increment daily count
  await incrementMailboxDailyCount(params.mailbox.id);
  
  return { messageId: result.MessageId! };
}
```

## 4.5 Email Open and Click Tracking

```typescript
// apps/hv/src/lib/email/tracking.ts

// ── Preparing emails for tracking ──
// Call this BEFORE sending. It injects the tracking pixel and wraps links.

export function prepareForTracking(params: {
  emailId: string;
  htmlBody: string;
  kineticsId: string;
}): string {
  let html = params.htmlBody;
  
  // 1. Wrap all links for click tracking
  // Replace every <a href="..."> with a redirect through our tracking endpoint
  html = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      // Don't wrap the unsubscribe link - it must go direct for compliance
      if (url.includes('/unsubscribe/')) return match;
      const trackingUrl = `${process.env.APP_URL}/api/track/click/${params.emailId}?url=${encodeURIComponent(url)}`;
      return `href="${trackingUrl}"`;
    }
  );
  
  // 2. Inject tracking pixel for open detection (1x1 transparent PNG)
  const pixel = `<img src="${process.env.APP_URL}/api/track/open/${params.emailId}" width="1" height="1" style="display:none;" alt="" />`;
  // Insert before closing </body> tag, or append if no body tag
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${pixel}</body>`);
  } else {
    html += pixel;
  }
  
  return html;
}
```

```typescript
// apps/hv/src/app/api/track/open/[emailId]/route.ts
// Returns a 1x1 transparent PNG and logs the open event

const TRANSPARENT_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export async function GET(req: Request, { params }: { params: { emailId: string } }) {
  // Log the open event (fire-and-forget, don't block the pixel response)
  logTrackingEvent(params.emailId, 'open', req).catch(console.error);
  
  return new Response(TRANSPARENT_PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}

async function logTrackingEvent(emailId: string, type: 'open' | 'click', req: Request, clickUrl?: string) {
  const email = await supabase.from('hv_emails').select('id, kinetiks_id, contact_id').eq('id', emailId).single();
  if (!email.data) return;
  
  // Insert tracking event
  await supabase.from('hv_tracking_events').insert({
    kinetiks_id: email.data.kinetiks_id,
    email_id: emailId,
    contact_id: email.data.contact_id,
    event_type: type,
    click_url: clickUrl,
    ip_address: req.headers.get('x-forwarded-for'),
    user_agent: req.headers.get('user-agent'),
  });
  
  // Update email record (first open/click only)
  if (type === 'open') {
    await supabase.from('hv_emails').update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', emailId).is('opened_at', null);
    await supabase.from('hv_activities').insert({
      kinetiks_id: email.data.kinetiks_id,
      contact_id: email.data.contact_id,
      type: 'email_opened',
      content: { email_id: emailId },
    });
  } else if (type === 'click') {
    await supabase.from('hv_emails').update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', emailId).is('clicked_at', null);
    await supabase.from('hv_activities').insert({
      kinetiks_id: email.data.kinetiks_id,
      contact_id: email.data.contact_id,
      type: 'email_clicked',
      content: { email_id: emailId, url: clickUrl },
    });
  }
  
  // Recalculate lead score (engagement changed)
  await supabase.rpc('hv_recalculate_lead_score', { p_contact_id: email.data.contact_id });
}
```

```typescript
// apps/hv/src/app/api/track/click/[emailId]/route.ts
// Logs the click event and redirects to the original URL

export async function GET(req: Request, { params }: { params: { emailId: string } }) {
  const url = new URL(req.url);
  const destinationUrl = url.searchParams.get('url');
  
  if (!destinationUrl) {
    return new Response('Missing URL', { status: 400 });
  }
  
  // Log the click (fire-and-forget)
  logTrackingEvent(params.emailId, 'click', req, destinationUrl).catch(console.error);
  
  // Redirect to the original URL
  return Response.redirect(destinationUrl, 302);
}
```

## 4.6 Webhook Receivers

```typescript
// apps/hv/src/app/api/webhooks/ses/route.ts
// Receives SES bounce, complaint, and delivery notifications via SNS

export async function POST(req: Request) {
  const body = await req.json();
  
  // SNS sends a SubscriptionConfirmation first - must confirm
  if (body.Type === 'SubscriptionConfirmation') {
    await fetch(body.SubscribeURL);
    return new Response('OK');
  }
  
  const message = JSON.parse(body.Message);
  
  // Store raw event for processing
  await supabase.from('hv_webhook_events').insert({
    source: 'ses',
    event_type: message.notificationType?.toLowerCase() || 'unknown',
    payload: message,
  });
  
  // Process immediately for critical events
  if (message.notificationType === 'Bounce') {
    const bounceType = message.bounce.bounceType; // 'Permanent' or 'Transient'
    for (const recipient of message.bounce.bouncedRecipients) {
      if (bounceType === 'Permanent') {
        // Hard bounce - suppress permanently
        await supabase.from('hv_suppressions').insert({
          kinetiks_id: await getKineticsIdFromMailbox(message.mail.source),
          email: recipient.emailAddress,
          type: 'bounce',
          reason: `Hard bounce: ${recipient.diagnosticCode || bounceType}`,
        });
        // Update contact
        await supabase.from('hv_contacts')
          .update({ suppressed: true, suppression_reason: 'bounce', suppressed_at: new Date().toISOString() })
          .eq('email', recipient.emailAddress);
      }
      // Update email record
      await supabase.from('hv_emails')
        .update({ status: 'bounced', bounced_at: new Date().toISOString() })
        .eq('id', findEmailByMessageId(message.mail.messageId));
    }
  }
  
  if (message.notificationType === 'Complaint') {
    for (const recipient of message.complaint.complainedRecipients) {
      // Spam complaint - suppress permanently
      await supabase.from('hv_suppressions').insert({
        kinetiks_id: await getKineticsIdFromMailbox(message.mail.source),
        email: recipient.emailAddress,
        type: 'email_unsub',
        reason: 'Spam complaint via SES',
      });
      // Pause the mailbox temporarily - complaint signals reputation risk
      await flagMailboxForReview(message.mail.source);
    }
  }
  
  return new Response('OK');
}
```

```typescript
// apps/hv/src/app/api/webhooks/twilio/status/route.ts
// Receives Twilio call status updates

export async function POST(req: Request) {
  const formData = await req.formData();
  const callSid = formData.get('CallSid') as string;
  const callStatus = formData.get('CallStatus') as string; // 'initiated', 'ringing', 'answered', 'completed', 'busy', 'no-answer', 'failed'
  const duration = formData.get('CallDuration') as string;
  
  // Store raw event
  await supabase.from('hv_webhook_events').insert({
    source: 'twilio',
    event_type: `call_${callStatus}`,
    payload: Object.fromEntries(formData.entries()),
  });
  
  // Update call record
  const statusMap: Record<string, string> = {
    'initiated': 'dialing',
    'ringing': 'ringing',
    'in-progress': 'connected',
    'completed': 'completed',
    'busy': 'no_answer',
    'no-answer': 'no_answer',
    'failed': 'failed',
  };
  
  const updates: any = { status: statusMap[callStatus] || callStatus };
  if (callStatus === 'in-progress') updates.started_at = new Date().toISOString();
  if (callStatus === 'completed') {
    updates.ended_at = new Date().toISOString();
    updates.duration_seconds = parseInt(duration || '0');
  }
  
  await supabase.from('hv_calls')
    .update(updates)
    .eq('twilio_call_sid', callSid);
  
  return new Response('OK');
}
```

```typescript
// apps/hv/src/app/api/webhooks/heyreach/route.ts
// Receives LinkedIn action results from Heyreach

export async function POST(req: Request) {
  const body = await req.json();
  
  await supabase.from('hv_webhook_events').insert({
    source: 'heyreach',
    event_type: body.event_type, // 'connection_accepted', 'message_received', 'message_sent'
    payload: body,
  });
  
  if (body.event_type === 'connection_accepted') {
    // Find the contact by LinkedIn URL and log the activity
    const contact = await supabase.from('hv_contacts')
      .select('id, kinetiks_id')
      .eq('linkedin_url', body.profile_url)
      .single();
    if (contact.data) {
      await supabase.from('hv_activities').insert({
        kinetiks_id: contact.data.kinetiks_id,
        contact_id: contact.data.id,
        type: 'linkedin_connect_accepted',
        content: { profile_url: body.profile_url },
      });
      await supabase.rpc('hv_recalculate_lead_score', { p_contact_id: contact.data.id });
    }
  }
  
  if (body.event_type === 'message_received') {
    // LinkedIn reply - route to Concierge for classification
    // Similar to email reply handling but for LinkedIn channel
    const contact = await supabase.from('hv_contacts')
      .select('id, kinetiks_id')
      .eq('linkedin_url', body.profile_url)
      .single();
    if (contact.data) {
      await supabase.from('hv_activities').insert({
        kinetiks_id: contact.data.kinetiks_id,
        contact_id: contact.data.id,
        type: 'linkedin_message_received',
        content: { message: body.message_text, profile_url: body.profile_url },
      });
      // Trigger Concierge classification (reuse the same classification engine)
      await classifyLinkedInReply(contact.data, body.message_text);
    }
  }
  
  return new Response('OK');
}
```

## 4.7 Usage Metering

```typescript
// apps/hv/src/lib/metering/usage.ts
// Track every paid resource consumption for billing

export async function trackUsage(params: {
  kineticsId: string;
  resource: string;
  quantity?: number;
  referenceId?: string;
}): Promise<void> {
  const costs: Record<string, number> = {
    'pdl_lookup': 1,           // $0.01
    'apollo_lookup': 3,        // $0.03
    'zerobounce_verify': 1,    // $0.01
    'builtwith_lookup': 5,     // $0.05
    'elevenlabs_minutes': 15,  // $0.15 per minute
    'twilio_call_minutes': 2,  // $0.02 per minute
    'twilio_phone_number': 100,// $1.00 per month
    'ses_email_send': 0,       // ~$0.0001 - effectively free, track volume only
    'claude_composer_tokens': 0, // included in Anthropic API cost, track for awareness
    'claude_concierge_tokens': 0,
    'claude_research_tokens': 0,
    'heyreach_linkedin_action': 2, // $0.02 per action
  };
  
  const quantity = params.quantity || 1;
  const unitCost = costs[params.resource] || 0;
  
  await supabase.from('hv_usage').insert({
    kinetiks_id: params.kineticsId,
    resource: params.resource,
    quantity,
    unit_cost_cents: unitCost,
    total_cost_cents: Math.round(quantity * unitCost),
    reference_id: params.referenceId,
    period_month: new Date().toISOString().slice(0, 7), // '2026-03'
  });
}

// Monthly usage summary (for billing page at id.kinetiks.ai)
export async function getUsageSummary(kineticsId: string, month: string): Promise<UsageSummary> {
  const { data } = await supabase
    .from('hv_usage')
    .select('resource, quantity, total_cost_cents')
    .eq('kinetiks_id', kineticsId)
    .eq('period_month', month);
  
  const summary: Record<string, { count: number; cost_cents: number }> = {};
  for (const row of data || []) {
    if (!summary[row.resource]) summary[row.resource] = { count: 0, cost_cents: 0 };
    summary[row.resource].count += Number(row.quantity);
    summary[row.resource].cost_cents += row.total_cost_cents;
  }
  
  return {
    month,
    resources: summary,
    total_cost_cents: Object.values(summary).reduce((sum, r) => sum + r.cost_cents, 0),
  };
}
```

## 4.8 Calendar Integration (Google Calendar)

```typescript
// apps/hv/src/lib/calendar/google.ts
import { google } from 'googleapis';

export async function getAvailableSlots(
  kineticsId: string,
  prospectTimezone: string,
  daysAhead: number = 5,
  slotDurationMinutes: number = 30
): Promise<TimeSlot[]> {
  const auth = await getOAuthClient(kineticsId);
  const calendar = google.calendar({ version: 'v3', auth });
  
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  // Get busy times
  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: 'primary' }],
    },
  });
  
  const busySlots = freeBusy.data.calendars?.primary?.busy || [];
  
  // Generate available slots during business hours in prospect's timezone
  // Business hours: 9am-5pm in prospect timezone
  const available = generateSlots(now, end, prospectTimezone, slotDurationMinutes, busySlots);
  
  return available.slice(0, 5); // Return top 5 options
}

export async function bookMeeting(params: {
  kineticsId: string;
  prospectEmail: string;
  prospectName: string;
  startTime: string;
  durationMinutes: number;
  subject: string;
}): Promise<{ eventId: string; meetingLink: string }> {
  const auth = await getOAuthClient(params.kineticsId);
  const calendar = google.calendar({ version: 'v3', auth });
  
  const event = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary: params.subject,
      start: { dateTime: params.startTime },
      end: { dateTime: addMinutes(params.startTime, params.durationMinutes) },
      attendees: [{ email: params.prospectEmail, displayName: params.prospectName }],
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID() },
      },
    },
  });
  
  return {
    eventId: event.data.id!,
    meetingLink: event.data.hangoutLink || event.data.htmlLink!,
  };
}
```

## 4.9 Slack Integration

```typescript
// apps/hv/src/lib/slack/client.ts

// Required OAuth scopes:
// chat:write, chat:write.public, commands, incoming-webhook, users:read

export async function sendApproval(params: {
  channel: string; // #harvest-approvals
  type: 'email_draft' | 'prospect_list' | 'reply_draft' | 'call_script' | 'pipeline_change';
  context: any;
  sentinelVerdict?: string;
}): Promise<string> {
  const blocks = buildApprovalBlocks(params);
  
  const result = await slackClient.chat.postMessage({
    channel: params.channel,
    text: `Harvest approval: ${params.type}`,
    blocks,
  });
  
  return result.ts!; // message timestamp for threading
}

function buildApprovalBlocks(params: any): any[] {
  // Slack Block Kit interactive message
  // Varies by type - example for email_draft:
  if (params.type === 'email_draft') {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*New email draft for ${params.context.contactName} at ${params.context.companyName}*\n${params.sentinelVerdict === 'flagged' ? ':warning: Sentinel flagged this draft' : ':white_check_mark: Sentinel approved'}`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Subject:* ${params.context.subject}\n\n${params.context.bodyPreview}` },
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'approve_email', value: params.context.emailId },
          { type: 'button', text: { type: 'plain_text', text: 'Edit' }, action_id: 'edit_email', value: params.context.emailId },
          { type: 'button', text: { type: 'plain_text', text: 'Reject' }, style: 'danger', action_id: 'reject_email', value: params.context.emailId },
        ],
      },
    ];
  }
  // ... other types
}

// Slash command handler
// Register commands: /harvest status, /harvest approve [id], /harvest pause [campaign], /harvest prospect [company]
export async function handleSlashCommand(command: string, args: string, userId: string): Promise<string> {
  switch (command) {
    case 'status':
      return await buildStatusResponse(userId);
    case 'approve':
      return await approveAction(args, userId);
    case 'pause':
      return await pauseCampaign(args, userId);
    case 'prospect':
      return await quickAddProspect(args, userId);
    default:
      return 'Unknown command. Available: status, approve, pause, prospect';
  }
}
```

---

# PART 5: 24-DAY BUILD GUIDE

**Prerequisite:** apps/id/ built through Phase 7 (Synapse template). Dark Madder migration complete. Bloomify codebase accessible at /path/to/bloomify/. Knowledge system deployed in `packages/ai/src/knowledge/`. Sentinel operational at `id.kinetiks.ai/api/sentinel/review`. Auth infrastructure (`require-auth.ts`, `resolve-auth.ts`, `rate-limit.ts`, `api-keys.ts`) deployed.

**Working principle:** Plan first, test after. Each day's prompt starts by reading relevant docs, then builds, then tests.

## Day 1-2: Scaffold + Auth + Schema

### Claude Code Prompt - Day 1

```
Read docs/CLAUDE.md, docs/Harvest_Build_Companion.md (Part 1: Database Schema, Part 1B: API-First Patterns, Part 1C: Knowledge Integration), docs/KNOWLEDGE_INTEGRATION.md, docs/Kinetiks_Agent_Native_Architecture.md, and apps/dm/ for reference on how the DM app is structured.

Create apps/hv/ following the same Next.js structure as apps/dm/:
1. Initialize Next.js app with TypeScript, Tailwind, App Router
2. Configure for hv.kinetiks.ai subdomain in Vercel
3. Import @kinetiks/ui, @kinetiks/supabase, @kinetiks/types, @kinetiks/ai from shared packages
4. Set up the THREE-METHOD auth middleware from Part 1B.2. Copy `requireAuth`, `resolveAuth`, `checkRateLimit`, and `api-keys` from apps/id/src/lib/auth/ into apps/hv/src/lib/auth/. EVERY API route uses `requireAuth()` with `allowedScopes: "hv"`.
5. Set up the API response helpers from Part 1B.1 (apiSuccess, apiError, apiPaginated). EVERY API route returns the standard envelope: {success, data, error, details, meta}.
6. Verify the knowledge system works: `loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 2000 })` should return non-empty content.
7. Import the floating pill component from @kinetiks/ui
8. Create the navigation shell with these routes:
   - / (dashboard)
   - /prospects
   - /campaigns
   - /compose
   - /inbox
   - /calls
   - /pipeline
   - /contacts
   - /analytics
   - /infra
   - /settings
8. Each route gets a placeholder page component

CRITICAL ARCHITECTURAL RULE (from Agent-Native Architecture):
- The UI NEVER writes directly to the database
- Every mutation goes through a Next.js API route
- Every API route uses requireAuth() for auth (NOT authenticateRequest - that's the old pattern)
- Every API route returns apiSuccess() or apiError() with the standard envelope
- React components call fetch() to API routes, never supabase directly

Do NOT build any features yet. Just the scaffold, navigation, auth middleware, API response helpers, and knowledge system verification.
```

### Claude Code Prompt - Day 2

```
Read docs/Harvest_Build_Companion.md Part 1 (full SQL schema) and Part 1B (API-First Patterns).

1. Run all SQL from Part 1 against the Supabase project. This creates:
   - hv_organizations, hv_contacts, hv_deals, hv_campaigns, hv_sequences, hv_emails, hv_calls, hv_activities, hv_mailboxes, hv_domains, hv_confidence, hv_suppressions, hv_analytics, hv_tracking_events, hv_webhook_events
   - hv_approvals (Agent-Native: channel-agnostic approval protocol)
   - hv_webhook_configs (Agent-Native: user-configured webhook delivery)
   - All indexes
   - All RLS policies (including: no DELETE on suppressions, standard CRUD on approvals and webhook configs)
   - The hv_check_suppression and hv_recalculate_lead_score functions

2. Verify the shared infrastructure exists in the Supabase project:
   - `increment_rate_limit` RPC must exist (deployed by id.kinetiks.ai)
   - `kinetiks_api_keys` table must exist
   - If either is missing, run the relevant migration from apps/id/supabase/migrations/

3. Generate TypeScript types from the schema in packages/types/src/harvest.ts
   Export all types: Contact, Organization, Deal, Campaign, Sequence, Email, Call, Activity, Mailbox, Domain, Confidence, Suppression, Analytics, TrackingEvent, WebhookEvent, Approval, WebhookConfig
   Also export the ApiResponse<T> type and AuthResult type from Part 1B

4. Create apps/hv/src/lib/supabase/queries.ts with basic CRUD helpers for each table
   IMPORTANT: These helpers are called by API routes, not by React components directly

5. Create the approval infrastructure from Part 1B.4:
   - apps/hv/src/lib/approvals/create.ts (createApproval + deliverApproval)
   - apps/hv/src/lib/approvals/resolve.ts (resolveApproval)
   - Approval API routes: /api/approvals (GET list), /api/approvals/[id] (GET single), /api/approvals/[id]/resolve (POST), /api/approvals/summary (GET)

6. Create the webhook infrastructure from Part 1B.5:
   - apps/hv/src/lib/webhooks/deliver.ts (HMAC-signed delivery with retry)
   - apps/hv/src/lib/webhooks/notify.ts (notifyWebhooks helper)
   - Webhook config API: /api/settings/webhooks (GET list, POST create)

7. Create convenience endpoints from Part 1B.6:
   - /api/harvest/daily-brief (GET)
   - /api/harvest/prospect/[id]/full (GET)

8. Test: verify all tables exist, RLS works (can only read own data), suppression function works, approval create/resolve cycle works, API key auth works alongside session auth
```

## Day 3-4: Scout + Enrichment

### Claude Code Prompt - Day 3

```
Read docs/Harvest_Build_Companion.md Part 4.1 (Enrichment Waterfall) and Part 4.2 (Email Verification).

Port Bloomify's PDL integration:
1. Copy /path/to/bloomify/utils/pdl.js to apps/hv/src/lib/enrichment/pdl.ts
2. Convert to TypeScript
3. Replace Chrome Storage API key reads with process.env.PDL_API_KEY
4. Adapt the response mapping to populate hv_contacts and hv_organizations fields

Build the enrichment waterfall in apps/hv/src/lib/enrichment/waterfall.ts:
1. PDL first (cheapest)
2. Apollo fallback (implement apps/hv/src/lib/enrichment/apollo.ts)
3. Cache check - don't re-enrich within 30 days
4. Return unified EnrichmentResult

Build email verification in apps/hv/src/lib/verification/verify.ts:
1. Syntax check
2. MX record lookup (use dns.promises.resolveMx)
3. ZeroBounce API integration
4. Grade assignment: A (valid, low risk), B (valid, some risk), C (catch-all), D (invalid)

Build tech stack enrichment in apps/hv/src/lib/enrichment/techstack.ts:
1. BuiltWith API integration
2. Parse response into string array of technology names

Test: enrich a known company domain. Verify contact data, org data, verification grade, and tech stack all populate correctly.
```

### Claude Code Prompt - Day 4

```
Read docs/Harvest_Build_Companion.md Part 1 (hv_contacts schema, lead scoring function).

Port Bloomify's pairing algorithm:
1. Copy /path/to/bloomify/utils/pairing.js to apps/hv/src/lib/enrichment/pairing.ts
2. Convert to TypeScript
3. Replace Chrome Storage profile reads with Context Structure Customers layer reads (via @kinetiks/supabase)
4. The algorithm should: given an organization, identify the best primary (decision maker) and CC (champion) contacts based on role/seniority preferences from the Customers layer

Build Scout's prospect search UI at /prospects:
1. Search bar with filters: industry, employee count range, seniority, department, location, tags, min lead score
2. Filter values default from Context Structure Customers layer (ICP definition)
3. Results table: name, title, company, lead score, verification grade, signals, last activity
4. Bulk actions: add to campaign, enrich, verify, tag
5. Prospect detail view: full enrichment data, activity timeline, org info, paired contacts

Build the lead scoring engine:
1. Fit score: compare contact/org attributes against ICP in Context Structure (industry match, size match, role match, seniority match)
2. Intent score: count and weight active signals on the org
3. Engagement score: count recent activities
4. Composite: fit * 0.4 + intent * 0.35 + engagement * 0.25
5. Wire up the hv_recalculate_lead_score function to trigger after enrichment and activity creation

Test: import a CSV of test contacts. Verify they enrich, verify, score, and display correctly. Verify pairing algorithm identifies correct primary/CC.
```

## Day 5-6: Verification + Signal Monitoring

### Claude Code Prompt - Day 5

```
Build Scout's signal monitoring system.

1. Create apps/hv/src/lib/signals/monitor.ts
2. Implement signal detection for:
   - Funding events: Crunchbase API (or web scrape Crunchbase news)
   - Job postings: Indeed/LinkedIn Jobs API
   - Tech stack changes: BuiltWith change detection (periodic re-check)
   - Company news: web search via Claude API with web search tool
3. Each detected signal creates an entry in the org's signals JSONB array:
   {type, detail, source, detected_at, relevance_score}
4. After signal detection, recalculate lead scores for all contacts at the org

Build a CRON job (Supabase pg_cron or Edge Function scheduled):
- Daily: check for funding events on all tracked orgs
- Daily: check for relevant job postings on all tracked orgs
- Weekly: re-check tech stacks for changes

Build the signal feed UI on the /prospects page:
- "Signals" tab showing recent signals across all prospects
- Each signal shows: company, signal type, detail, date, affected contacts
- Click to view org detail or add contacts to campaign
```

### Claude Code Prompt - Day 6

```
Build Scout's import pipeline:

1. CSV import endpoint at /api/scout/import
2. File upload UI on /prospects page
3. Parse CSV: auto-detect columns (name, email, company, title, phone, linkedin)
4. For each row:
   a. Check suppression (reject if suppressed)
   b. Check for duplicates (match by email)
   c. Create or update contact record
   d. Trigger enrichment waterfall
   e. Trigger email verification
   f. Calculate lead score
5. Show import summary: X imported, Y duplicates skipped, Z suppressed, W failed verification
6. Route through Archivist (if available) or run cleaning locally:
   - Normalize names (capitalization)
   - Normalize emails (lowercase)
   - Normalize phone numbers (E.164 format)
   - Detect and skip obviously fake data

Test: import a CSV of 50 test contacts. Verify dedup, enrichment, verification, and scoring all run correctly.
```

## Day 7-8: Composer + Email Generation

### Claude Code Prompt - Day 7

```
Read docs/Harvest_Build_Companion.md Part 1C (Knowledge Integration) and Part 2.1 (Composer Prompts).

Port Bloomify's Claude integration:
1. Copy /path/to/bloomify/utils/claude.js to apps/hv/src/lib/ai/composer.ts
2. Convert to TypeScript
3. Replace with @kinetiks/ai shared Claude client (askClaude, loadKnowledge)
4. Replace Chrome Storage voice profile with Context Structure reads
5. Wire knowledge loading into compose-email.ts: call loadKnowledge() before each generation call per Part 1C.2 mappings

Build the research layer in apps/hv/src/lib/ai/research.ts:
1. Company research: use Claude API with web search tool to crawl the prospect's company website. Extract: company description, recent news, blog posts, product updates.
2. Prospect research: fetch LinkedIn profile summary (from enrichment data, not live scrape)
3. Tech stack: from BuiltWith enrichment
4. CRM history: query hv_activities and hv_emails for this contact
5. Signal context: from hv_organizations.signals
6. Return a structured ResearchBrief object

Build the Composer email generation in apps/hv/src/lib/ai/compose-email.ts:
1. Implement the system prompt from Part 2.1, injecting Context Structure layers AND knowledge content
2. Implement the first-touch user prompt
3. Implement the follow-up user prompt (with follow-up knowledge: write_follow_up intent)
4. Implement CC mode (Bloomify CC logic)
5. Each generation returns: subject, body, body_plain, reasoning
6. Context Structure injection: pull Voice, Products, Customers, Narrative, Competitive layers. Truncate each to ~500 tokens max to fit context window.

Build the Sentinel review client in apps/hv/src/lib/sentinel/review.ts:
1. Calls POST {KINETIKS_ID_API_URL}/api/sentinel/review with INTERNAL_SERVICE_SECRET auth
2. Pass content_type ('cold_email', 'follow_up_email', 'auto_reply', etc.)
3. Returns verdict, quality_score, flags
4. After each email generation, call reviewContent() and store results on hv_emails

Test: generate a first-touch email for a test prospect. Verify it uses the voice profile, references real product features, includes a specific opening hook from research, AND passes through Sentinel review with a quality score.
```

### Claude Code Prompt - Day 8

```
Build the Compose UI at /compose:

1. Single-email composer:
   - Prospect selector (search contacts)
   - "Generate draft" button that calls Composer
   - Draft editor (rich text) with the AI draft pre-populated
   - CC toggle (enables Bloomify CC mode, shows CC contact selector)
   - Research brief panel (sidebar showing what Composer found)
   - Sentinel verdict badge (approved/flagged/held) with expandable flags detail
   - If flagged/held: show each flag with severity and suggested action. User must acknowledge flags before sending.
   - Send button (creates hv_email record, queues for sending) - DISABLED unless sentinel_verdict is 'approved' or user has explicitly overridden flags

2. Batch composer:
   - Select campaign or prospect list
   - Generate drafts for all prospects in batch
   - Review queue: scroll through drafts, approve/edit/reject each
   - Batch approve button for trusted drafts

3. Port Bloomify's Gmail compose URL logic:
   - Copy /path/to/bloomify/utils/gmail.js to apps/hv/src/lib/email/gmail-compose.ts
   - "Open in Gmail" button that generates the compose URL with To, CC, Subject, Body pre-filled
   - This is the fallback for users who want to send from their own Gmail rather than through Harvest's infrastructure

Build playbook templates in apps/hv/src/lib/ai/playbooks.ts:
- Define 7 playbook types: competitive_displacement, funding_trigger, job_change, inbound_followup, event, re_engagement, referral
- Each playbook has: a sequence template (steps, channels, delays) and prompt modifiers (additional context injected into Composer prompts)

Test: compose an email using each playbook type. Verify CC mode works. Verify Gmail compose URL opens correctly.
```

## Day 9-10: Postmaster + Compliance

### Claude Code Prompt - Day 9

```
Read docs/Harvest_Build_Companion.md Part 4.4 (Email Sending via SES).

Build Postmaster infrastructure:

1. Domain management UI at /infra:
   - Add domain form
   - DNS record generator (SPF, DKIM, DMARC records displayed for user to add)
   - DNS validation checker (verify records are correctly configured)
   - Domain health dashboard (health score, last check, issues)

2. Mailbox management:
   - Add mailbox form (email, display name, SMTP config)
   - Mailbox health cards (reputation score, daily sent/limit, warmup status)
   - Pause/resume controls

3. Email signature builder:
   - Template with user's name, title, company from Org layer
   - Physical address field (required for CAN-SPAM)
   - Auto-include unsubscribe link

4. Build the email sender in apps/hv/src/lib/email/sender.ts:
   - SES integration per Part 4.4
   - Pre-send suppression check (MUST pass before any send)
   - Pre-send Sentinel check (MANDATORY): verify sentinel_verdict === 'approved' before calling SES. If the email has not been through Sentinel, send it there first. Never send an unreviewed email.
   - List-Unsubscribe and List-Unsubscribe-Post headers
   - Physical address in footer
   - Compliance footer with unsubscribe link
   - Daily send limit enforcement

5. Build email open/click tracking per Part 4.5:
   - apps/hv/src/lib/email/tracking.ts: prepareForTracking() wraps links and injects pixel
   - /api/track/open/[emailId] endpoint: returns 1x1 PNG, logs open event
   - /api/track/click/[emailId] endpoint: logs click, redirects to destination
   - Both endpoints update hv_emails status and create hv_activities
   - Both trigger lead score recalculation

6. Build usage metering per Part 4.7:
   - apps/hv/src/lib/metering/usage.ts: trackUsage() logs every paid API call
   - Integrate into enrichment waterfall (PDL, Apollo, BuiltWith, ZeroBounce)
   - Integrate into email sender (SES sends)
   - Usage summary endpoint for billing page at id.kinetiks.ai
```

### Claude Code Prompt - Day 10

```
Build Postmaster warmup engine and rotation:

1. Warmup engine in apps/hv/src/lib/email/warmup.ts:
   - Day 1-3: 5 emails/day
   - Day 4-7: 10 emails/day
   - Day 8-14: 20 emails/day
   - Day 15-21: 30 emails/day
   - Day 22+: full daily limit (40)
   - Warmup emails sent to a warmup service (integrate Warmup Inbox API or similar)
   - Track inbox placement rate per mailbox
   - Auto-pause warmup if placement rate drops below 80%

2. Rotation algorithm in apps/hv/src/lib/email/rotation.ts:
   - Input: list of active, warm mailboxes
   - Selection: reputation-weighted random (higher reputation = higher probability)
   - Constraint: never exceed daily limit per mailbox
   - Constraint: respect prospect timezone (send during 8am-6pm in prospect's timezone)
   - Return: selected mailbox for this email

3. Build the suppression system:
   - Unsubscribe endpoint: /api/unsubscribe/[token]
   - One-click unsubscribe (RFC 8058 handler)
   - On unsubscribe: immediately add to hv_suppressions, update hv_contacts.suppressed, remove from all active sequences
   - GDPR data export endpoint: /api/gdpr/export/[token]
   - GDPR deletion endpoint: /api/gdpr/delete/[token] - purges all data, creates permanent suppression

4. Deliverability testing:
   - Pre-send content check using Claude Haiku: flag spam trigger words, excessive links, misleading subject lines
   - Google Postmaster Tools API integration for domain reputation data

5. Build reputation monitoring CRON:
   - Hourly: check bounce rates per mailbox (from SES bounce notifications via SNS webhook)
   - Auto-pause mailbox if bounce rate exceeds 5%
   - Send Slack alert on pause

6. Build webhook receivers per Part 4.6:
   - /api/webhooks/ses: handle SES bounce, complaint, and delivery notifications via SNS
     - Hard bounce: add to hv_suppressions immediately, update contact, update email record
     - Complaint: add to hv_suppressions, flag mailbox for review
     - Delivery: update email status to 'sent'
   - /api/webhooks/twilio/status: handle call status updates
     - Update hv_calls record with status, start/end times, duration
   - /api/webhooks/heyreach: handle LinkedIn action results
     - Connection accepted: log activity, recalculate lead score
     - Message received: log activity, route to Concierge for classification
   - All webhooks write raw payload to hv_webhook_events for debugging

7. Wire usage metering into voice/LinkedIn:
   - ElevenLabs: track minutes per call
   - Twilio: track call minutes
   - Heyreach: track per-action

Test: send a test email through the full pipeline. Verify suppression check, compliance footer, unsubscribe link, rotation selection, daily limit, open tracking pixel, click tracking redirect, and webhook processing for bounces.
```

## Day 11-12: Navigator + Sequences

### Claude Code Prompt - Day 11

```
Build Navigator's sequence engine:

1. Sequence builder UI at /campaigns/new:
   - Visual step builder (drag-and-drop or add-step interface)
   - Each step: channel selector (email, linkedin_view, linkedin_engage, linkedin_connect, linkedin_dm, phone_call, phone_voicemail), delay config (days + hours after previous step), exit conditions
   - A/B variant support per step (two subject/body variants with weight split)
   - Playbook templates: user can start from a playbook and customize
   - Preview: show the full sequence as a timeline

2. Sequence execution engine in apps/hv/src/lib/sequences/engine.ts:
   - CRON job (every 15 minutes): scan for prospects with a pending sequence step
   - For each pending step:
     a. Check exit conditions (reply received? meeting booked? unsubscribed?)
     b. Check suppression
     c. Check Sentinel fatigue rules (via Cortex)
     d. Check send window (is it business hours in prospect's timezone?)
     e. If all pass: execute the step (send email, trigger LinkedIn action, schedule call)
     f. Log activity
     g. Update sequence stats

3. Campaign management UI at /campaigns:
   - Campaign list with status, stats summary
   - Campaign detail: prospect list, sequence progress per prospect, aggregate stats
   - Pause/resume/complete controls
   - Add/remove prospects from active campaign

4. Send-time optimization in apps/hv/src/lib/sequences/timing.ts:
   - Default: send during 8am-10am in prospect's timezone (highest open rates)
   - After 20+ emails to a contact: use their personal open-time pattern (from hv_emails.opened_at history)
   - Randomize within the window (+/- 30 minutes) to avoid pattern detection
```

### Claude Code Prompt - Day 12

```
Read docs/Harvest_Build_Companion.md Part 4.3 (LinkedIn Integration).

Build LinkedIn integration:

1. LinkedIn client in apps/hv/src/lib/linkedin/client.ts per Part 4.3
2. Integrate with Heyreach API (or PhantomBuster as fallback):
   - Profile view
   - Connection request with note
   - Direct message
   - Content engagement (like a post)
3. Rate limiting: enforce daily limits per action type
4. Safety: immediate pause on any LinkedIn warning signal
5. Webhook handler for connection accepts and message replies

Wire LinkedIn actions into the sequence engine:
- When a sequence step is channel=linkedin_*, call the LinkedIn client
- LinkedIn message content is generated by Composer (use the LinkedIn message prompt variant)
- Connection request notes are short (300 char max) - Composer adapts automatically

Build A/B testing infrastructure:
- When a step has variants, randomly assign each prospect to variant A or B (weighted by config)
- Track per-variant metrics in hv_sequences.stats
- Auto-promote winner after statistical significance (minimum 50 sends per variant, p < 0.05)

Test: create a multi-channel sequence (email day 1, LinkedIn view day 2, email day 4, LinkedIn connect day 6). Verify all steps execute in order with correct timing.
```

## Day 13-14: Voice Calling

### Claude Code Prompt - Day 13

```
Read docs/Harvest_Build_Companion.md Part 3 (ElevenLabs + Twilio Voice Calling) - the entire section.

Build the voice calling infrastructure:

1. Twilio setup:
   - Purchase a phone number via Twilio API
   - Configure status callback URL
   - Create apps/hv/src/lib/voice/twilio.ts per Part 3.3

2. ElevenLabs setup:
   - Voice cloning endpoint (upload samples, get voice_id)
   - Agent configuration builder per Part 3.2
   - Create apps/hv/src/lib/voice/elevenlabs.ts

3. Build the websocket bridge:
   - apps/hv/src/app/api/voice/stream/[callId]/route.ts
   - Twilio Media Stream -> audio conversion -> ElevenLabs websocket
   - ElevenLabs response -> audio conversion -> Twilio Media Stream
   - Audio format: Twilio sends mulaw 8kHz, ElevenLabs expects PCM 16kHz
   - Use the audio conversion approach from Twilio's ElevenLabs integration guide

4. Build the TwiML endpoint per Part 3.3:
   - Voicemail detection: if machine_end_beep, play voicemail audio
   - Human answer: connect to ElevenLabs stream

5. Build warm transfer per Part 3.3:
   - Conference-based transfer
   - Context summary spoken to user before connection

6. Call script generation:
   - Composer generates call scripts using the voice call prompt from Part 2.1
   - Load knowledge: loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 2000, forceModules: ["objection-handling"] })
   - Pass generated script through Sentinel review with content_type 'voice_call_script'
   - Store sentinel_verdict and sentinel_flags on hv_calls
   - Scripts stored in hv_calls.script JSONB
```

### Claude Code Prompt - Day 14

```
Build the Calls UI and real-time monitoring:

1. Call queue UI at /calls:
   - Scheduled calls list with prospect info, call type, scheduled time
   - "Call now" button for manual initiation
   - Active call card: live transcript streaming, key moment tags, transfer button
   - Call history: completed calls with transcript, duration, outcome, key moments

2. Real-time Sentinel monitoring per Part 3.4:
   - Transcript chunks forwarded to Sentinel for brand safety check
   - Escalation trigger detection (pricing, legal, anger, "real person")
   - On trigger: immediate warm transfer to user's phone

3. Post-call processing:
   - Save full transcript to hv_calls.transcript
   - Use Claude to extract key moments (interest signals, objections, competitor mentions, next steps)
   - Save key moments to hv_calls.key_moments JSONB
   - Update hv_activities with call outcome
   - If meeting booked during call: create calendar event, update pipeline

4. Call analytics:
   - Connection rate (calls connected / calls attempted)
   - Average call duration
   - Outcome distribution (meeting_booked, interested, not_interested, voicemail, no_answer)
   - Key moment frequency (which objections come up most)

5. DNC (Do Not Call) compliance:
   - Before every call: check hv_suppressions for phone number
   - Integrate FTC DNC Registry API check (or use a third-party DNC screening service)
   - Time check: only call during 8am-9pm in prospect's timezone
   - AI disclosure: first words of every call include the disclosure

Test: make a test call to your own phone. Verify: AI disclosure plays, conversation works, transcript saves, voicemail detection works, warm transfer works.
```

## Day 15-16: Concierge + Inbox

### Claude Code Prompt - Day 15

```
Read docs/Harvest_Build_Companion.md Part 1C (Knowledge Integration) and Part 2.2 (Concierge Prompts).

Build Concierge's reply handling:

0. Wire knowledge loading into Concierge:
   - For objection replies: loadKnowledge({ operator: "composer", intent: "write_follow_up", tokenBudget: 2000, forceModules: ["objection-handling"] })
   - For general replies: loadKnowledge({ operator: "composer", intent: "write_cold_email", tokenBudget: 1500, excludeModules: ["seo", "social"] })
   - All auto-generated responses MUST pass through Sentinel review (content_type: 'auto_reply') before sending

1. Email receiving:
   - SES Inbound (or webhook from email provider): when a reply arrives to any hv_mailbox, process it
   - Match reply to the original email thread (by In-Reply-To header or thread_id)
   - Match to contact by sender email address
   - Store reply in hv_emails (as a new record with in_reply_to_id set)

2. Reply classification engine in apps/hv/src/lib/ai/concierge.ts:
   - Use the classification prompt from Part 2.2
   - Return: classification, confidence, extracted_data
   - If confidence < 0.7: flag for user review (don't auto-respond)

3. Auto-response generation:
   - Use the response generation prompt from Part 2.2
   - Inject the appropriate Context Structure layers based on classification
   - For objections: inject full Competitive and Products layers
   - For questions: inject full Products layer
   - For interested: inject calendar availability (from Google Calendar integration)

4. Unsubscribe handling (CRITICAL):
   - If classification == 'unsubscribe': immediately add to hv_suppressions, remove from all sequences, send confirmation email
   - This happens BEFORE any other processing. No delays. No approvals.

5. OOO handling:
   - Parse return date from OOO message
   - Pause the prospect's active sequence
   - Schedule sequence resume for the return date + 1 day

6. Meeting booking:
   - If classification == 'meeting_request' or 'interested':
   - Get available slots from Google Calendar
   - Generate reply with specific time options or calendar link
   - On booking confirmation: create hv_activities entry, update deal stage if exists
```

### Claude Code Prompt - Day 16

```
Build the Inbox UI at /inbox:

1. Unified inbox:
   - All replies across all mailboxes in one view
   - Each reply shows: sender, company, subject, preview, classification badge, sentiment indicator
   - Filter by classification, sentiment, mailbox, campaign
   - Sort by recency (default), priority (lead score), or awaiting response

2. Reply detail view:
   - Full email thread (original outreach + all replies)
   - Classification with confidence indicator
   - Concierge's proposed response (editable)
   - Sentinel verdict on the proposed response
   - Action buttons: approve and send, edit, write manual response, escalate, dismiss
   - Sidebar: contact card with lead score, org info, deal status, activity timeline

3. Escalation queue:
   - Separate tab for escalated replies
   - Shows: the thread, the classification, the proposed response, the escalation reason
   - User resolves: approve proposed, edit, or write own response

4. Auto-response in Autopilot:
   - For OOO, wrong_person, not_interested: send auto-response immediately
   - For interested with meeting booking: send calendar link
   - For everything else: queue for review unless the specific function is in Autopilot mode

5. Build Concierge's driving mode logic:
   - Check hv_confidence for the specific classification's function
   - Human Drive: classify but don't draft response (user sees classification + writes manually)
   - Approvals: classify + draft response, user approves
   - Autopilot: classify + draft + send (except escalation triggers)

Test: simulate replies of each classification type. Verify correct classification, appropriate response generation, unsubscribe handling, OOO pause/resume.
```

## Day 17-18: Keeper + CRM

### Claude Code Prompt - Day 17

```
Build Keeper's CRM:

1. Pipeline UI at /pipeline:
   - Kanban board with columns for each stage: prospecting, contacted, engaged, meeting_set, qualified, proposal, negotiation, won, lost
   - Deal cards: company name, contact name, value, days in stage
   - Drag-and-drop between stages (creates hv_activities stage_change entry)
   - When dragging to "won": modal for win reason (category dropdown + free text)
   - When dragging to "lost": modal for loss reason (category dropdown + competitor dropdown + free text)
   - Pipeline metrics header: total deals, total value, deals by stage, average stage duration

2. Deal detail view:
   - Deal info (name, value, stage, attribution)
   - Associated contact and organization
   - Full activity timeline for this deal
   - Win/loss reason (if closed)
   - Notes

3. Auto-triggers:
   - Scout adds prospect -> create deal in "prospecting" stage (if Keeper is in Approvals/Autopilot)
   - First email sent -> move to "contacted"
   - Positive reply classified -> move to "engaged"
   - Meeting booked -> move to "meeting_set"
   - All other stages: manual (qualified, proposal, negotiation, won, lost)

4. Pipeline analytics:
   - Conversion rates between stages
   - Average time in each stage
   - Pipeline velocity (deals/week entering each stage)
   - Win rate by campaign, by playbook, by channel
```

### Claude Code Prompt - Day 18

```
Build Keeper's contact and relationship management:

1. Contacts UI at /contacts:
   - Contact directory with search, filter (by org, tag, lead score, source)
   - Contact detail: full profile, enrichment data, lead score breakdown, all activities, all emails, all calls, deals
   - Activity timeline: every touchpoint across every channel, chronologically
   - Conversation view: threaded email + LinkedIn + call transcript view per contact
   - Add contact manually (for non-outbound relationships: investors, partners, advisors)
   - Edit contact (user edits are Priority 1 - override enrichment)

2. Organization view:
   - Company detail page: firmographics, tech stack, signals, all contacts at the company
   - Account-level engagement: aggregate activity across all contacts
   - Org health score: composite of all contact engagement scores

3. BCC conversation tracking:
   - Inbound email endpoint: harvest-bcc@{user-domain}.kinetiks.ai
   - When BCC email received: parse sender, match to contact by email
   - If no contact match: create new contact from email headers
   - Log the email as an hv_activity of type 'bcc_logged'
   - Show in the contact's conversation timeline

4. CSV export:
   - Export contacts, organizations, deals, activities as CSV
   - GDPR-compliant: only export data the user owns
   - Include all fields, not just display fields

Test: create a deal, drag through pipeline stages. Verify auto-triggers work. Verify win/loss reason capture. Add a manual contact, log a BCC email, verify it appears in timeline.
```

## Day 19-20: Analyst + Analytics

### Claude Code Prompt - Day 19

```
Build Analyst's analytics engine:

1. Campaign analytics calculator in apps/hv/src/lib/analytics/campaign.ts:
   - For each campaign: sends, opens, open_rate, replies, reply_rate, positive_replies, positive_rate, meetings, meeting_rate, calls, call_connect_rate, linkedin_sent, linkedin_replies, pipeline_value, closed_value
   - Calculate daily, weekly, monthly, and all-time
   - Store in hv_analytics table

2. Sequence analytics:
   - Per-step funnel: how many prospects reached each step, how many converted at each step
   - Drop-off analysis: which step loses the most prospects
   - A/B test results with statistical significance

3. Channel analytics:
   - Email vs LinkedIn vs Phone: sends, responses, meetings, deals
   - Per-persona channel effectiveness (VPs respond better to email, ICs to LinkedIn, etc.)

4. Revenue attribution:
   - For each won deal: trace back through deal -> emails/calls -> sequence -> campaign
   - Calculate: pipeline generated per campaign, closed revenue per campaign, cost per meeting, cost per deal, ROI
   - Store attribution chain in hv_deals

5. CRON job: recalculate analytics daily (or on-demand after significant activity)
```

### Claude Code Prompt - Day 20

```
Build the Analytics UI at /analytics and pattern detection:

1. Analytics dashboard:
   - Campaign performance table with sortable metrics
   - Sequence funnel visualization (bar chart showing step-by-step conversion)
   - Channel comparison chart (email vs linkedin vs phone)
   - Revenue attribution: pipeline and revenue by campaign, by playbook, by channel
   - Time analytics: best send times, best days, response time distribution

2. Pattern detection engine in apps/hv/src/lib/analytics/patterns.ts:
   - Run weekly via CRON
   - Use Claude to analyze aggregate data and identify patterns:
     - Messaging patterns: which subject line types/angles perform best
     - ICP patterns: which company profiles convert best
     - Timing patterns: optimal follow-up timing
     - Channel patterns: which channel sequences perform best
   - Store patterns in hv_analytics with report_type='pattern'
   - Surface patterns on the dashboard as "Analyst Insights" cards

3. Send-time optimization:
   - Aggregate open-time data across all contacts
   - Calculate optimal send windows per timezone, per seniority, per industry
   - Feed optimal times into Navigator's timing engine

4. Dashboard integration:
   - Add key metrics to the main dashboard at /
   - Pipeline summary, today's activity, top campaigns, recent patterns

Test: populate test data for multiple campaigns. Verify all analytics calculate correctly. Verify pattern detection produces reasonable insights.
```

## Day 21-22: Driving Modes + Slack + Agent-Native Wiring

### Claude Code Prompt - Day 21

```
Read docs/Harvest_Build_Companion.md Part 1B.4 (Approval Protocol) and docs/Kinetiks_Agent_Native_Architecture.md Section 5-6.

Build the driving modes engine:

1. Confidence scoring in apps/hv/src/lib/confidence/engine.ts:
   - Track every user decision: approve, edit, reject for each operator+function
   - Update hv_confidence after every decision:
     - total_decisions++
     - user_approved_unchanged++ or user_edited++ or user_rejected++
     - agreement_rate = user_approved_unchanged / total_decisions * 100
   - Outcome tracking: after an email is sent, track if it got a reply (positive outcome)
   - Recency weighting: last 30 days weighted 3x vs older data
   - unlock_eligible = true when total_decisions >= min_decisions_for_autopilot AND agreement_rate >= min_agreement_for_autopilot
   - AGENT-NATIVE: For API key users (auth_method === 'api_key'), add quality_score_trend dimension:
     - Track Sentinel quality scores over time
     - If quality scores decline over a 7-day window, auto-downgrade from Autopilot to Approvals
     - This is the agent-equivalent of a human losing trust

2. Mode management UI at /settings/driving-modes:
   - Per-operator, per-function grid showing current mode and readiness
   - Upgrade button (appears when unlock_eligible = true)
   - Downgrade button (always available)
   - The unlock prompt: show the stats that earned the unlock
   - AGENT-NATIVE: API endpoint at /api/settings/driving-modes (GET list, PATCH update)
     - Agents can read and change driving modes via API
     - Same auth middleware - works with both cookie and API key

3. Confidence dashboard widget on main /:
   - Compact view of all operators and their mode status
   - Progress bars toward next unlock
   - Recent decision history

4. Wire driving modes into ALL existing features via the approval protocol:
   - Before every Composer draft: check mode for that email type
   - Before every Concierge response: check mode for that classification
   - Before every Scout action: check mode for that function
   - Before every Keeper pipeline change: check mode
   - If Human Drive: show data but don't auto-act. No hv_approvals record created.
   - If Approvals: generate the output, create an hv_approvals record via createApproval() (Part 1B.4).
     The approval protocol handles delivery to ALL channels (dashboard, Slack, webhook, API polling).
     Resolution comes back through resolveApproval() from ANY channel.
   - If Autopilot: execute within guardrails. Create an hv_approvals record with status='auto_approved'
     for audit trail. Sentinel still gates the action.
   CRITICAL: All approval creation and resolution goes through the lib/approvals/ module from Day 2.
   Do NOT build approval handling directly in Slack - Slack is just one delivery/resolution channel.
```

### Claude Code Prompt - Day 22

```
Read docs/Harvest_Build_Companion.md Part 4.9 (Slack Integration) and Part 1B.4-1B.5 (Approval Protocol + Webhooks).

Build the Slack app as ONE CHANNEL of the approval protocol:

1. Slack app setup:
   - Create Slack app with OAuth scopes: chat:write, chat:write.public, commands, incoming-webhook
   - OAuth flow in /settings/integrations
   - Store Slack workspace token in Supabase (encrypted)

2. Wire Slack into the approval DELIVERY system:
   - Update lib/approvals/deliver.ts: the deliverApproval() function already checks for Slack connection.
   - Build sendSlackApproval() in lib/slack/client.ts: takes an hv_approvals record, builds Block Kit message
   - Channels: #harvest-approvals (pending actions), #harvest-activity (autonomous actions), #harvest-wins (wins)
   - Approval messages: Block Kit with approve/edit/reject buttons per Part 4.9

3. Wire Slack into the approval RESOLUTION system:
   - /api/slack/interactions endpoint
   - Handle button clicks: extract the approval_id from the button value
   - Call resolveApproval() from lib/approvals/resolve.ts with resolved_by: 'slack'
   - resolveApproval() handles everything downstream: confidence update, action execution, webhook notification
   - IMPORTANT: Slack is calling the SAME resolveApproval() that the dashboard and API use.
     No separate approval logic for Slack. The resolution path is identical for all channels.

4. Slash commands:
   - Register: /harvest status, /harvest approve [id], /harvest pause [campaign], /harvest prospect [company]
   - /harvest status: calls GET /api/harvest/daily-brief (the convenience endpoint from Part 1B.6)
   - /harvest approve [id]: calls resolveApproval() with resolved_by: 'slack'
   - /harvest pause [campaign]: calls PATCH /api/campaigns/[id] (API route)
   - /harvest prospect [company]: calls POST /api/scout/enrich (API route)

5. Escalation DMs:
   - For Critical/High severity: send DM to the user directly
   - Include full context and action buttons
   - Deduplicate: if multiple escalations for the same contact within 5 minutes, merge

6. Marcus integration:
   - Cross-app insights posted to #harvest-activity

7. Webhook event delivery:
   - Wire key events into notifyWebhooks() from lib/webhooks/notify.ts:
     - deal.won, deal.lost, deal.stage_changed
     - meeting.booked
     - campaign.completed, campaign.paused
     - mailbox.health_alert, mailbox.paused
   - These events are SEPARATE from approval webhooks (which are already handled in deliverApproval).
   - Agent users receive a stream of events without needing Slack.

Test: trigger an approval. Verify it appears in BOTH Slack AND the /api/approvals endpoint.
Approve via Slack - verify the action executes. Create a new approval - approve via API
(curl with kntk_ API key) - verify same result. This proves channel-agnostic resolution.
Trigger an escalation. Verify DM arrives. Test each slash command.
```

## Day 23-24: Synapse + Integration Testing

### Claude Code Prompt - Day 23

```
Build the Harvest Synapse:

1. Fork the Synapse template from apps/id/src/lib/synapse-template/
2. Create apps/hv/src/lib/synapse/harvest-synapse.ts

3. Implement context distribution (pullContext):
   - Scout: pull Customers, Products, Competitive layers
   - Composer: pull Voice, Products, Customers, Narrative, Competitive layers
   - Concierge: pull Products, Competitive, Voice layers
   - Navigator: pull Customers layer
   - Keeper: pull Customers, Competitive layers
   - Analyst: pull all layers

4. Implement promote logic (collectFromOperator -> submitProposal):
   Promote these learnings when detected:
   - Messaging that converts: when Analyst detects a subject line or angle with 2x+ baseline reply rate (50+ sends), promote to Voice/Products layers
   - ICP refinements: when Analyst detects a company profile converting at 2x+ baseline, promote to Customers layer
   - Objection patterns: when Concierge sees the same objection 5+ times, promote to Products/Competitive layers
   - Win/loss reasons: every won/lost deal with a reason gets promoted to Products/Customers/Competitive
   - Competitive intelligence: every competitor mention in replies or calls gets promoted to Competitive layer
   - Channel effectiveness: aggregate channel performance per persona promoted to Customers layer
   - Call intelligence: key moments aggregated and promoted to Voice/Customers/Competitive

5. Implement keep logic:
   Keep inside Harvest: individual prospect records, email contents, call transcripts (summaries promoted, not raw), sequence configs, pipeline positions, mailbox states, individual approval decisions

6. Implement receiveRouting:
   - From Dark Madder: content library updates (new publishable content available for sequences)
   - From Hypothesis: page engagement signals (prospect viewed personalized page)
   - From Litmus: press coverage secured (update Narrative layer references)
   - From any app: Context Structure updates that affect Harvest Operators
```

### Claude Code Prompt - Day 24

```
Integration testing - end-to-end flow:

1. Full user journey test:
   a. Sign up via id.kinetiks.ai (use existing test account)
   b. Navigate to hv.kinetiks.ai - verify auth works, floating pill renders
   c. Set up infrastructure: add a test domain, create a mailbox, configure DNS
   d. Import test prospects via CSV - verify enrichment, verification, scoring
   e. Create a campaign with a multi-channel sequence (email + LinkedIn + call)
   f. Launch campaign - verify first emails send with correct compliance elements
   g. Simulate replies: send test emails to the Harvest mailbox
   h. Verify Concierge classifies correctly and generates appropriate responses
   i. Verify pipeline auto-triggers (contacted, engaged, meeting_set)
   j. Complete a deal as Won with a win reason
   k. Verify win reason promotes through Synapse to Cortex

2. Compliance audit:
   - Every email has: physical address, unsubscribe link, List-Unsubscribe header
   - Unsubscribe click: immediately suppresses, confirms, removes from sequences
   - GDPR export: returns all data for a contact
   - GDPR delete: purges all data, creates permanent suppression
   - DNC check: phone numbers checked before calling
   - AI disclosure: present at start of every call

3. Driving mode test:
   - Start in Human Drive - verify no auto-actions
   - Switch Concierge OOO handling to Autopilot - verify OOO replies auto-process
   - Approve 10+ Composer drafts - verify confidence score increases
   - Check unlock eligibility

4. Cross-app Proposal test:
   - Trigger a win reason promotion
   - Verify it appears in the Learning Ledger at id.kinetiks.ai
   - If DM Synapse is active: verify the learning routes to Dark Madder

5. Slack test:
   - Verify all 4 channels receive appropriate messages
   - Verify approval buttons work (resolved_by should be 'slack')
   - Verify slash commands respond
   - Verify escalation DMs arrive for high-severity items

6. Agent-Native Architecture test (CRITICAL):
   a. API key auth: create a kntk_ API key at id.kinetiks.ai/settings/api-keys.
      Use it to call GET /api/harvest/daily-brief. Verify it returns the standard envelope {success, data}.
   b. Channel-agnostic approvals:
      - Create an approval via Composer (generate an email draft in Approvals mode)
      - Verify it appears in GET /api/approvals?status=pending
      - Resolve it via API: POST /api/approvals/{id}/resolve with Bearer kntk_ auth
      - Verify the email sends, confidence updates, and webhook delivers
   c. Webhook delivery:
      - Configure a webhook at /api/settings/webhooks (use a RequestBin or similar)
      - Trigger an approval. Verify the webhook receives the payload with HMAC signature.
      - Trigger a deal.won event. Verify the webhook receives it.
   d. Convenience endpoints:
      - GET /api/harvest/daily-brief: verify it returns pipeline, approvals, activity in one call
      - GET /api/harvest/prospect/{id}/full: verify it returns contact, org, activities, emails, calls, deals
      - GET /api/approvals/summary: verify it returns grouped counts
   e. Rate limiting:
      - Send 61 requests in 60 seconds with a 60/min API key. Verify the 61st returns 429.
   f. Read-only key:
      - Create a read-only API key. Verify GET endpoints work. Verify POST/PATCH return 403.
   g. Response envelope:
      - Spot-check 10 random API routes. Every one must return {success: boolean, data?: any, error?: string}.
      - No HTML responses. No redirects from mutation endpoints.

7. Performance check:
   - Prospect search with 1000+ contacts: < 500ms
   - Email generation: < 5 seconds
   - Reply classification: < 2 seconds
   - Dashboard load: < 1 second
   - Daily-brief endpoint: < 1 second
   - Approval resolution: < 500ms

Fix any issues found. This is the production readiness gate.
```

---

# PART 6: DECISIONS AND CONVENTIONS

## 6.1 Where Logic Runs

| Component | Runs As | Why |
|-----------|---------|-----|
| Cortex (Proposal evaluation) | Supabase Edge Function | Shared across all apps |
| Harvest Synapse | Supabase Edge Function | Standard Synapse pattern |
| Sentinel | Next.js API Route at id.kinetiks.ai | Cortex Operator, shared. Harvest calls via INTERNAL_SERVICE_SECRET |
| Composer (email/call generation) | Next.js API Route | Needs Claude API, large context |
| Concierge (classification + response) | Next.js API Route | Needs Claude API |
| Scout (enrichment, verification) | Next.js API Route | Needs external API calls |
| Postmaster (sending, warmup) | Next.js API Route + CRON | Time-sensitive, needs SES |
| Navigator (sequence engine) | Supabase pg_cron + Edge Function | Scheduled execution |
| Keeper (CRM logic) | Next.js API Route | User-facing CRUD |
| Analyst (analytics) | Supabase pg_cron + Edge Function | Scheduled computation |
| Voice calling bridge | Next.js API Route (websocket) | Real-time audio streaming |
| Auth middleware | apps/id/src/lib/auth/ (copied to apps/hv/) | Three methods: session, API key (kntk_*), internal service. requireAuth() with scope/permission/rate-limit |
| Knowledge system | @kinetiks/ai package | Loads marketing methodology into operator prompts on-demand |
| Approval protocol | Next.js API Route + lib/ | Create, deliver, resolve approvals. Channel-agnostic. |
| Webhook delivery | Next.js API Route + lib/ | HMAC-signed delivery with retry. Fire-and-forget from approval creation. |
| Rate limiting | Supabase RPC (increment_rate_limit) + requireAuth() | Atomic upsert with per-minute AND per-day windows. Fails open on error. |
| Convenience endpoints | Next.js API Route | daily-brief, prospect-full, approvals-summary. Pre-composed for MCP/agents. |

## 6.2 Environment Variables

```env
# Kinetiks shared
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=

# Enrichment
PDL_API_KEY=
APOLLO_API_KEY=
BUILTWITH_API_KEY=
ZEROBOUNCE_API_KEY=

# Email
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

# Voice
ELEVENLABS_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_TRANSFER_NUMBER=

# LinkedIn
HEYREACH_API_KEY=

# Slack
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=

# Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cross-app
KINETIKS_ID_API_URL=https://id.kinetiks.ai  # Base URL for Sentinel, Synapse, Context Structure API calls
INTERNAL_SERVICE_SECRET=                      # Shared secret for Edge Function / CRON / cross-app auth

# App
APP_URL=https://hv.kinetiks.ai
```

## 6.3 File Structure

```
apps/hv/
  src/
    app/
      layout.tsx              # Root layout with floating pill
      page.tsx                # Dashboard
      prospects/page.tsx
      campaigns/
        page.tsx
        new/page.tsx
      compose/
        page.tsx
        [emailId]/page.tsx
      inbox/page.tsx
      calls/page.tsx
      pipeline/page.tsx
      contacts/
        page.tsx
        [contactId]/page.tsx
      analytics/page.tsx
      infra/page.tsx
      settings/
        page.tsx
        driving-modes/page.tsx
        integrations/page.tsx
      api/
        # ── Agent-Native Architecture: Approvals (channel-agnostic) ──
        approvals/
          route.ts                  # GET list, POST create
          summary/route.ts          # GET convenience summary for MCP/agents
          [id]/
            route.ts                # GET single approval
            resolve/route.ts        # POST resolve (approve/edit/reject)
        # ── Agent-Native Architecture: Convenience endpoints ──
        harvest/
          daily-brief/route.ts      # GET aggregated daily snapshot
          prospect/[id]/
            full/route.ts           # GET everything about a prospect in one call
        # ── Agent-Native Architecture: Webhook configuration ──
        settings/
          webhooks/route.ts         # GET list, POST create webhook configs
          webhooks/[id]/route.ts    # PATCH update, DELETE remove
        # ── Operator routes (all follow API-first pattern) ──
        scout/
          prospects/route.ts        # GET search, POST add
          import/route.ts
          enrich/route.ts
          verify/route.ts
          signals/route.ts
        composer/
          generate/route.ts
          research/route.ts
          playbook/route.ts
        concierge/
          classify/route.ts
          respond/route.ts
          inbox/route.ts            # GET unified inbox
        postmaster/
          send/route.ts
          warmup/route.ts
          reputation/route.ts
        navigator/
          execute-step/route.ts
          linkedin/route.ts
        voice/
          twiml/[callId]/route.ts
          stream/[callId]/route.ts
          status/[callId]/route.ts
          transfer/route.ts
        keeper/
          pipeline/route.ts         # GET pipeline view
          deals/route.ts            # GET list, POST create
          deals/[id]/route.ts       # GET single, PATCH update stage
          activities/route.ts
          bcc/route.ts
        analyst/
          campaigns/route.ts        # GET campaign analytics
          calculate/route.ts
          patterns/route.ts
        slack/
          interactions/route.ts
          commands/route.ts
          events/route.ts
        track/
          open/[emailId]/route.ts   # Tracking pixel - logs opens
          click/[emailId]/route.ts  # Link redirect - logs clicks
        webhooks/
          ses/route.ts              # SES bounce/complaint/delivery notifications
          twilio/status/route.ts    # Twilio call status updates
          heyreach/route.ts         # LinkedIn action results
        unsubscribe/[token]/route.ts
        gdpr/
          export/[token]/route.ts
          delete/[token]/route.ts
    lib/
      enrichment/
        waterfall.ts
        pdl.ts
        apollo.ts
        techstack.ts
        pairing.ts
      verification/
        verify.ts
      ai/
        composer.ts
        compose-email.ts
        concierge.ts
        research.ts
        playbooks.ts
      email/
        sender.ts
        warmup.ts
        rotation.ts
        tracking.ts               # Open pixel + click wrapping
        gmail-compose.ts
      voice/
        twilio.ts
        elevenlabs.ts
        agent-config.ts
        transfer.ts
        monitor.ts
      linkedin/
        client.ts
      sequences/
        engine.ts
        timing.ts
      calendar/
        google.ts
      analytics/
        campaign.ts
        patterns.ts
      confidence/
        engine.ts
      synapse/
        harvest-synapse.ts
      slack/
        client.ts
      # ── Platform Integration modules ──
      auth/
        require-auth.ts           # Three-method auth (session, API key, internal)
        resolve-auth.ts           # Auth resolution logic
        rate-limit.ts             # Atomic rate limiting via RPC
        api-keys.ts               # kntk_* key generation and validation
      sentinel/
        review.ts                 # Sentinel review client (calls id.kinetiks.ai/api/sentinel/review)
      knowledge/
        loader.ts                 # Wrapper around @kinetiks/ai loadKnowledge for Harvest defaults
      # ── Agent-Native Architecture modules ──
      approvals/
        create.ts                 # Create approval, deliver to all channels
        resolve.ts                # Resolve approval, update confidence, execute action
        deliver.ts                # Multi-channel delivery (Slack, webhook, dashboard)
      webhooks/
        deliver.ts                # HMAC-signed webhook delivery with retry
        notify.ts                 # Event notification to all matching webhook configs
      metering/
        usage.ts                  # Track paid resource consumption
      signals/
        monitor.ts                # Scout signal detection CRON
      supabase/
        queries.ts
    components/
      # All Harvest-specific React components
    test/
      mocks/                      # Mock servers for external APIs
      seed.ts                     # Test data generator
```

## 6.4 Testing Strategy

- **Unit tests:** Each lib/ module gets tests with mocked external APIs
- **Mock APIs:** Create mock servers for PDL, Apollo, ZeroBounce, ElevenLabs, Twilio, Heyreach, SES in apps/hv/src/test/mocks/
- **Seed data:** 100 test contacts across 20 organizations with realistic enrichment data, pre-populated in apps/hv/src/test/seed.ts
- **Confidence seed:** Pre-populate hv_confidence with 50 decisions per function to test driving mode transitions
- **End-to-end:** Playwright test for the full user journey (Day 24 test plan)

## 6.5 First-Run Experience

When a user completes Cartographer onboarding and lands at hv.kinetiks.ai for the first time, the dashboard is empty. The first-run experience must guide them through setup without feeling like a second onboarding (they just did one).

### What the user sees

The dashboard shows a **Setup Checklist** card, front and center, with progress tracking. The checklist has five steps. Each step links directly to the relevant page.

**Step 1: Set up sending infrastructure (required)**
- Links to /infra
- User adds at least one sending domain and one mailbox
- Postmaster generates DNS records and validates them
- Estimated time: 10 minutes (DNS propagation may take longer - Postmaster monitors and notifies when ready)
- While waiting for DNS: user can proceed to steps 2-3

**Step 2: Import or find your first prospects (required)**
- Links to /prospects
- Two paths: "Import a CSV" or "Find prospects" (Scout search)
- Minimum: 10 prospects added to proceed
- Enrichment and verification run automatically on import

**Step 3: Create your first campaign (required)**
- Links to /campaigns/new
- Suggest starting from a playbook template rather than from scratch
- Auto-select a playbook based on the user's Context Structure: if they have competitors in the Competitive layer, suggest Competitive Displacement. If their company recently raised, suggest a general outreach playbook.
- Minimum: one campaign created with at least one sequence step

**Step 4: Connect Slack (recommended)**
- Links to /settings/integrations
- OAuth flow for Slack workspace
- Explain: "This is how Harvest communicates with you - approvals, activity, wins"

**Step 5: Set up voice calling (optional)**
- Links to /settings/integrations
- Upload voice samples (or use samples from Cartographer if already provided)
- Twilio phone number provisioning
- Explain: "Harvest can make calls in your voice. This step is optional - you can add it later."

### Checklist behavior

- The checklist persists on the dashboard until all required steps are complete
- After completion: the checklist collapses to a "Setup complete" badge and the dashboard shows normal content (pipeline, campaigns, activity, confidence)
- Steps can be done in any order except Step 3 depends on Step 2 (need prospects for a campaign)
- Each step shows estimated time and current status (not started, in progress, complete)

### Empty states

Every page needs an empty state for first-run:
- /prospects empty: "No prospects yet. Import a CSV or search for companies matching your ICP."
- /campaigns empty: "No campaigns yet. Create your first campaign to start reaching your audience."
- /inbox empty: "No replies yet. Replies will appear here once your first campaign is running."
- /pipeline empty: "Your pipeline will populate as prospects engage with your outreach."
- /analytics empty: "Analytics will appear once you have campaign data. Send your first emails to get started."
- /calls empty: "No calls yet. Set up voice calling in Settings to enable AI phone outreach."

Each empty state includes a primary CTA button linking to the appropriate setup step.

## 6.6 Warmup Timeline and First Campaign

Important UX consideration: new mailboxes need 2-3 weeks of warmup before they can send at volume. This means the user's first campaign will be throttled.

**How to handle this:**
- During Step 1 (infra setup), clearly communicate: "New mailboxes need 2-3 weeks to warm up. During warmup, Postmaster gradually increases your daily send volume."
- Show a warmup progress bar on /infra for each mailbox: "Day 4 of 21 - sending 10/day - inbox placement: 94%"
- Allow the user to create and launch campaigns immediately - Postmaster simply sends fewer emails per day during warmup. The sequence engine queues excess emails and sends them as capacity increases.
- If the user has an existing warm mailbox (from a previous email platform), allow them to mark it as "pre-warmed" and skip the warmup phase.
- Recommended: suggest the user starts with a small campaign (20-50 prospects) during warmup week 1, scaling up as mailboxes warm.

## 6.7 Implementation Lessons (from Kinetiks ID build)

These are hard-won lessons from building the ID platform. Apply them to Harvest from day one.

### Database
- **UNIQUE constraints required for upsert.** If any Harvest table needs upsert behavior (e.g., `hv_confidence` with its `UNIQUE(kinetiks_id, operator, function_name)`), the UNIQUE constraint must exist. Without it, Supabase upsert returns a silent error.
- **Check constraints on enum columns.** When adding new status/type values to existing columns, verify the DB check constraint includes the new value. Missing constraints cause silent write failures.

### Auth & API
- **Use `requireAuth()`, not `authenticateRequest()`.** The old two-method auth pattern (`authenticateRequest`) is deprecated. All Harvest routes use `requireAuth()` with `allowedScopes: "hv"`.
- **Always pass `allowedScopes`.** Without it, any API key (even one scoped to another app) can access Harvest data.
- **Internal service auth requires `allowInternal: true`.** Routes called by Edge Functions or Sentinel must opt in. Read the real `account_id` from the request body when `auth.auth_method === "internal"`.
- **Include error details in API responses.** `apiError("Failed to create contact", 500, error.message)` - never just `apiError("Something went wrong", 500)`.

### Proposals & Synapse
- **Proposals must include exact field schemas.** Any Harvest operator that extracts intelligence (Concierge classifying objections, Analyst finding patterns, Keeper tracking win/loss) must include the exact Context Structure field names when generating Proposals. Without schemas, the LLM invents field names that fail Cortex validation.
- **`evaluateProposal()` takes a full Proposal object, not an ID.** Always construct the complete Proposal object when submitting via the Harvest Synapse.
- **Array fields are additive for user-set data.** The Cortex merge concatenates arrays (messaging_patterns, personas, competitors). Harvest Proposals that add new customer personas or competitive intelligence are appended, not rejected.

### Knowledge System
- **Always wrap `loadKnowledge()` in try/catch.** Knowledge loading is non-blocking. If it fails, the operator should proceed with its base prompt (no methodology). Never let knowledge loading failure block email generation.
- **Token budget is shared with Context Structure.** If you increase knowledge budget, reduce Context Structure truncation limits accordingly.

### Sentinel
- **Sentinel is non-blocking for the review record.** If the AI call fails, Sentinel returns a conservative fallback (score 50, manual review flag). Route these to the approval queue rather than blocking the email pipeline.
- **Pre-send check is mandatory.** `sender.ts` must verify `sentinel_verdict === 'approved'` before calling SES. This is the last safety gate.
- **Harvest uses INTERNAL_SERVICE_SECRET for Sentinel calls.** Sentinel at id.kinetiks.ai accepts internal auth. The route requires `allowInternal: true`.

---

*This document, combined with the Harvest Product Spec v3.0, the Cross-App Intelligence Spec, the Sentinel Spec, KNOWLEDGE_INTEGRATION.md, and the Agent-Native Architecture Spec, provides everything Claude Code needs to build hv.kinetiks.ai. Every API route follows the API-first mandate. Every approval flows through the channel-agnostic protocol. Every response uses the standard envelope. Every outbound content passes through Sentinel review. Every operator loads marketing methodology via the knowledge system. Harvest is agent-ready from day one.*
