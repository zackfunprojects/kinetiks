-- Email templates for Harvest outreach
-- Templates are the building blocks - sequences reference them,
-- compose uses them, and performance is tracked per template.

CREATE TABLE IF NOT EXISTS hv_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kinetiks_id uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'cold_outreach',
  subject_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  style_preset_id uuid REFERENCES hv_style_presets(id) ON DELETE SET NULL,
  merge_fields jsonb NOT NULL DEFAULT '[]',
  is_ai_generated boolean NOT NULL DEFAULT false,
  performance jsonb NOT NULL DEFAULT '{"times_used": 0}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hv_templates_kinetiks ON hv_templates(kinetiks_id);
CREATE INDEX idx_hv_templates_category ON hv_templates(kinetiks_id, category);

-- RLS
ALTER TABLE hv_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates"
  ON hv_templates FOR ALL
  USING (kinetiks_id = auth.uid());

CREATE POLICY "Service role full access on hv_templates"
  ON hv_templates FOR ALL
  USING (auth.role() = 'service_role');
