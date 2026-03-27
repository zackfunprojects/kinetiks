-- Migration 00016: Fix schema gaps found in production audit
-- Adds missing columns referenced by operational layer code

-- 1. hv_emails: Add message_id for provider tracking correlation
ALTER TABLE hv_emails ADD COLUMN IF NOT EXISTS message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_hv_emails_message_id ON hv_emails(message_id) WHERE message_id IS NOT NULL;

-- 2. hv_tracking_events: Add occurred_at and metadata for webhook event data
ALTER TABLE hv_tracking_events ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hv_tracking_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE hv_tracking_events ADD COLUMN IF NOT EXISTS url TEXT;

-- 3. hv_emails: Add style_config for preserving email style preferences
ALTER TABLE hv_emails ADD COLUMN IF NOT EXISTS style_config JSONB DEFAULT '{}';
