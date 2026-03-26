-- ── HARVEST STYLE PRESETS ─────────────────────────────────────
-- Email style configuration presets for the Outreach Composer.

CREATE TABLE hv_style_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id UUID NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hv_style_presets_kinetiks ON hv_style_presets(kinetiks_id);
CREATE UNIQUE INDEX idx_hv_style_presets_default
  ON hv_style_presets(kinetiks_id) WHERE is_default = TRUE;

ALTER TABLE hv_style_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hv_style_presets_user" ON hv_style_presets FOR ALL
  USING (kinetiks_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));
CREATE POLICY "hv_style_presets_service" ON hv_style_presets FOR ALL
  USING (auth.role() = 'service_role');

-- Add style_config column to hv_emails to persist the style used for each draft
ALTER TABLE hv_emails ADD COLUMN IF NOT EXISTS style_config JSONB DEFAULT '{}';
