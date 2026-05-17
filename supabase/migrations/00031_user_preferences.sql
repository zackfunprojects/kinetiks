-- ============================================================
-- 00031_user_preferences.sql
-- Per-user UI/preference store. Forward-compatible with v2
-- multi-user via team_scope_id placeholder (always null in v1).
--
-- Theme persistence per CLAUDE.md design rule: theme (light/dark)
-- is persisted to the Supabase user profile, not localStorage.
-- ============================================================

CREATE TABLE IF NOT EXISTS kinetiks_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  team_scope_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION kinetiks_user_preferences_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_user_preferences_updated_at ON kinetiks_user_preferences;
CREATE TRIGGER kinetiks_user_preferences_updated_at
  BEFORE UPDATE ON kinetiks_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_user_preferences_set_updated_at();

-- RLS
ALTER TABLE kinetiks_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own preferences" ON kinetiks_user_preferences;
CREATE POLICY "Users read own preferences"
  ON kinetiks_user_preferences
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own preferences" ON kinetiks_user_preferences;
CREATE POLICY "Users insert own preferences"
  ON kinetiks_user_preferences
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own preferences" ON kinetiks_user_preferences;
CREATE POLICY "Users update own preferences"
  ON kinetiks_user_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Note: no DELETE policy. Preferences are deleted via auth.users cascade.

COMMENT ON TABLE kinetiks_user_preferences IS
  'Per-user UI preferences (theme, etc.). Keyed by auth user_id. team_scope_id is a v2 placeholder.';
