-- ============================================================
-- 00088_kinetiks_annotations.sql
--
-- Phase 8.0 — Collaborative Workspace inline annotations (spec §6).
--
-- The named system explains its reasoning directly on the app surface:
-- decision notes, data references, skip notes, suggestions — anchored to a
-- specific UI component/field, dismissible, pinnable, replyable. Annotations
-- are persisted (lifecycle: pin -> Ledger, threaded replies) and also
-- broadcast live over the `annotations:{account}:{thread}` channel
-- (write-before-publish).
--
-- Anchor fields (component_id, field_name, position, max_width) are flattened
-- to top-level columns so `useFieldAnnotations(field)` filters cheaply; the
-- variable-shape parts (replies, evidence refs) are jsonb.
--
-- RLS: account-scoped reads via the canonical resolver; writes are
-- service-role only (the embed API routes in apps/id validate account
-- ownership and write under service role), mirroring kinetiks_authority_grants.
--
-- Every reference-surface annotation is labeled source_app='kinetiks_fixtures'
-- per the fixtures honesty contract; real suite apps set their own source_app.
-- ============================================================

CREATE TABLE kinetiks_annotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  thread_id     text NOT NULL,
  team_scope_id text,                          -- v2 placeholder; null in v1

  kind          text NOT NULL
                CHECK (kind IN ('decision_note','data_reference','skip_note','suggestion')),

  -- Anchor (AnnotationAnchor, flattened for cheap field filtering)
  component_id  text NOT NULL,
  field_name    text NOT NULL,
  position      text NOT NULL DEFAULT 'below'
                CHECK (position IN ('above','below','inline','tooltip')),
  max_width     integer NOT NULL DEFAULT 280,

  summary       text NOT NULL,                 -- one-line collapsed
  body          text NOT NULL,                 -- full reasoning on expand
  pinned        boolean NOT NULL DEFAULT false,
  dismissed     boolean NOT NULL DEFAULT false,

  -- Variable-shape payloads
  replies       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- AnnotationReply[]
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,   -- AnnotationReference[] (TS: `references`)

  source_app    text NOT NULL DEFAULT 'kinetiks_fixtures',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CHECK (jsonb_typeof(replies) = 'array'),
  CHECK (jsonb_typeof(evidence_refs) = 'array')
);

COMMENT ON TABLE kinetiks_annotations IS
  'Collaborative-workspace inline annotations (spec §6). Anchored to a UI component/field; dismissible/pinnable/replyable. Service-role writes (embed API routes), account-scoped reads. evidence_refs maps to the Annotation.references field (renamed to avoid the SQL reserved word).';

CREATE INDEX idx_annotations_thread
  ON kinetiks_annotations (account_id, thread_id);

-- useFieldAnnotations(field) hot path: live, non-dismissed, by field.
CREATE INDEX idx_annotations_field_live
  ON kinetiks_annotations (account_id, thread_id, field_name)
  WHERE dismissed = false;

CREATE INDEX idx_annotations_source_app
  ON kinetiks_annotations (source_app);

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION _kt_annotations_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS annotations_touch_updated_at ON kinetiks_annotations;
CREATE TRIGGER annotations_touch_updated_at
  BEFORE UPDATE ON kinetiks_annotations
  FOR EACH ROW
  EXECUTE FUNCTION _kt_annotations_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
-- Reads: account-scoped. Writes: service-role only (no INSERT/UPDATE/DELETE
-- policy; the embed API routes write under service role after validating
-- account ownership), mirroring kinetiks_authority_grants.
ALTER TABLE kinetiks_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own annotations"
  ON kinetiks_annotations
  FOR SELECT
  USING (account_id = (select public.kinetiks_account_id()));

-- ── Realtime ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE kinetiks_annotations;
