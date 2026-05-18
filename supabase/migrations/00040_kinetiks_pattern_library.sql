-- ============================================================
-- 00040_kinetiks_pattern_library.sql
--
-- Pattern Library Phase 1 (L1a) per the Kinetiks Contract Addendum §1.
--
-- Hybrid table: top-level lifecycle columns + jsonb for variable-shape
-- payload (dimensions, outcome_metrics, evidence_summary). The hybrid
-- is necessary because the read path needs indexed access on
-- (pattern_type, status, applies_to_icp, confidence_score, decay_at).
--
-- Writes restricted to service role (the Archivist write path and
-- per-pattern Server Actions in apps/id); reads are account-scoped via
-- RLS. team_scope_id is the v2 multi-user placeholder; always null in v1.
--
-- Three-layer state machine enforcement: server action (via
-- @kinetiks/lib/state-machines), Postgres trigger (this migration),
-- and RLS (deny user-token writes). The trigger is the backstop the
-- application logic cannot bypass.
-- ============================================================

-- ── Table ───────────────────────────────────────────────────
CREATE TABLE kinetiks_pattern_library (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id         text,                                       -- v2 placeholder; null in v1

  pattern_type          text NOT NULL,                              -- registered type key
  emitting_app          text NOT NULL,
  applies_to_icp        text,                                       -- nullable
  fingerprint           text NOT NULL,                              -- deterministic hash; addendum §1.4

  status                text NOT NULL DEFAULT 'emerging'
                        CHECK (status IN ('emerging','validated','declining','archived')),
  confidence_score      double precision NOT NULL DEFAULT 0
                        CHECK (confidence_score BETWEEN 0 AND 1),
  observation_count     integer NOT NULL DEFAULT 0
                        CHECK (observation_count >= 0),

  first_observed_at     timestamptz NOT NULL DEFAULT now(),
  last_observed_at      timestamptz NOT NULL DEFAULT now(),
  effective_decay_days  integer NOT NULL
                        CHECK (effective_decay_days > 0),
  decay_at              timestamptz NOT NULL,

  validated_at          timestamptz,
  declining_at          timestamptz,
  archived_at           timestamptz,

  user_starred          boolean NOT NULL DEFAULT false,
  user_suppressed       boolean NOT NULL DEFAULT false,
  user_annotation       text,

  dimensions            jsonb NOT NULL,                             -- validated against descriptor.dimensions_schema
  outcome_metrics       jsonb NOT NULL DEFAULT '[]'::jsonb,         -- array of { metric_name, value, sample_count, confidence, unit }
  evidence_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,         -- { last_n_ledger_ids: text[], summary: {...} }

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, pattern_type, fingerprint)
);

COMMENT ON TABLE kinetiks_pattern_library IS
  'Pattern Library per the Kinetiks Contract Addendum §1. Empirically validated multi-dimensional signatures with outcome data and confidence. Hybrid shape: top-level lifecycle fields for indexed reads, jsonb for variable-shape payload. team_scope_id is v2 placeholder. Reads via apps/id/src/lib/cortex/patterns/list.ts (single shared helper); writes via the Archivist sync path at /api/synapse/patterns and user-override Server Actions in apps/id.';

COMMENT ON COLUMN kinetiks_pattern_library.fingerprint IS
  'Server-computed deterministic hash of the descriptor''s fingerprint_dimensions (canonicalized + SHA-256, first 32 hex chars). Identity for the pattern within (account_id, pattern_type).';

COMMENT ON COLUMN kinetiks_pattern_library.evidence_summary IS
  'Rolling cap-50 last_n_ledger_ids + summary block. Detailed evidence lives in kinetiks_ledger; this is the pointer.';

-- ── Indexes (justified by the read paths in §1.5 and the decay sweep in §1.6) ───
CREATE INDEX idx_pattern_library_account_status_type
  ON kinetiks_pattern_library (account_id, status, pattern_type);

CREATE INDEX idx_pattern_library_account_emitter
  ON kinetiks_pattern_library (account_id, emitting_app);

CREATE INDEX idx_pattern_library_account_icp
  ON kinetiks_pattern_library (account_id, applies_to_icp);

-- Decay sweep predicate: only active patterns are candidates for time-based decay.
CREATE INDEX idx_pattern_library_account_decay
  ON kinetiks_pattern_library (account_id, decay_at)
  WHERE status IN ('emerging','validated','declining');

CREATE INDEX idx_pattern_library_account_observed
  ON kinetiks_pattern_library (account_id, last_observed_at DESC);

-- Starred-only filter for the Cortex UI quick path.
CREATE INDEX idx_pattern_library_account_starred
  ON kinetiks_pattern_library (account_id)
  WHERE user_starred = true;

-- ── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION _kt_pattern_library_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pattern_library_touch_updated_at ON kinetiks_pattern_library;
CREATE TRIGGER pattern_library_touch_updated_at
  BEFORE UPDATE ON kinetiks_pattern_library
  FOR EACH ROW
  EXECUTE FUNCTION _kt_pattern_library_touch_updated_at();

-- ── Lifecycle state-machine trigger (backstop) ──────────────
-- Legal transitions per Kinetiks Contract Addendum §1.6 (Lifecycle and Empirical Decay Calibration):
--   emerging  → validated | archived
--   validated → declining | archived
--   declining → validated | archived
--   archived  → (terminal)
--
-- Timestamp side-effects: validated_at, declining_at, archived_at are
-- stamped automatically when status enters those states.
CREATE OR REPLACE FUNCTION _kt_pattern_library_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- archived is terminal
  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION
      'kinetiks_pattern_library: status=archived is terminal (attempted → %)', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Legal transitions
  IF NOT (
    (OLD.status = 'emerging'  AND NEW.status IN ('validated','archived')) OR
    (OLD.status = 'validated' AND NEW.status IN ('declining','archived')) OR
    (OLD.status = 'declining' AND NEW.status IN ('validated','archived'))
  ) THEN
    RAISE EXCEPTION
      'kinetiks_pattern_library: illegal transition % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Timestamp side-effects
  IF NEW.status = 'validated' AND OLD.status = 'emerging' AND NEW.validated_at IS NULL THEN
    NEW.validated_at := now();
  END IF;
  IF NEW.status = 'declining' AND NEW.declining_at IS NULL THEN
    NEW.declining_at := now();
  END IF;
  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pattern_library_lifecycle_guard ON kinetiks_pattern_library;
CREATE TRIGGER pattern_library_lifecycle_guard
  BEFORE UPDATE OF status ON kinetiks_pattern_library
  FOR EACH ROW
  EXECUTE FUNCTION _kt_pattern_library_check_transition();

-- ── RLS ─────────────────────────────────────────────────────
-- Reads: account-scoped. Writes: service-role only (no INSERT/UPDATE/DELETE
-- policy for user tokens, so the default deny applies).
ALTER TABLE kinetiks_pattern_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own pattern library"
  ON kinetiks_pattern_library
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- No INSERT / UPDATE / DELETE policies declared: the default deny means
-- only the service role (used by the Archivist write path and the
-- per-pattern Server Actions in apps/id) may mutate rows.

-- ── Ledger event type advisory (no DB CHECK by design) ──────
COMMENT ON COLUMN kinetiks_ledger.event_type IS
  'LedgerEventType per @kinetiks/types/billing.ts. Phase 1 pattern_* additions: pattern_observed, pattern_arbitrated, pattern_user_starred, pattern_user_unstarred, pattern_user_suppressed, pattern_user_unsuppressed, pattern_user_annotated, pattern_exported, pattern_imported, pattern_archived. No DB CHECK constraint by design (open string union); writer-side helpers enforce shape.';
