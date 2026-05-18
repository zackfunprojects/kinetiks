-- ============================================================
-- 00041_pattern_library_canonical_shape.sql
--
-- L1b canonical alignment: drop and recreate kinetiks_pattern_library
-- with the canonical shape per Kinetiks Contract Addendum §1.2.
--
-- Safe to drop in place: the table is empty in production (L1a just
-- shipped; no real customer emissions yet).
--
-- Changes from L1a:
--   - emitting_app → source_app (column rename per canonical)
--   - outcome_metrics jsonb array → top-level single-primary outcome
--     columns (outcome_metric, outcome_value, outcome_direction,
--     baseline_value, lift_ratio)
--   - ADDED: sample_size (running sum across emissions)
--   - ADDED: variance (statistical variance of outcome series)
--   - ADDED: source_workflow_id uuid (Phase 3+; nullable)
--   - ADDED: imported boolean, imported_from jsonb (provenance per §1.7)
--   - New index on lift_ratio for ranking per §1.5
-- ============================================================

DROP TABLE IF EXISTS kinetiks_pattern_library CASCADE;

CREATE TABLE kinetiks_pattern_library (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id         text,                                       -- v2 placeholder; null in v1

  -- Source
  source_app            text NOT NULL,
  source_workflow_id    uuid,                                       -- Phase 3+

  -- Identity
  pattern_type          text NOT NULL,
  applies_to_icp        text,
  fingerprint           text NOT NULL,

  -- Outcome (canonical single-primary shape per §1.2)
  outcome_metric        text NOT NULL,
  outcome_value         double precision NOT NULL,
  outcome_direction     text NOT NULL
                        CHECK (outcome_direction IN ('higher_is_better','lower_is_better')),
  baseline_value        double precision,
  lift_ratio            double precision,

  -- Evidence
  sample_size           integer NOT NULL DEFAULT 0
                        CHECK (sample_size >= 0),
  observation_count     integer NOT NULL DEFAULT 0
                        CHECK (observation_count >= 0),
  confidence_score      double precision NOT NULL DEFAULT 0
                        CHECK (confidence_score BETWEEN 0 AND 1),
  variance              double precision,

  -- Lifecycle
  status                text NOT NULL DEFAULT 'emerging'
                        CHECK (status IN ('emerging','validated','declining','archived')),
  first_observed_at     timestamptz NOT NULL DEFAULT now(),
  last_observed_at      timestamptz NOT NULL DEFAULT now(),
  effective_decay_days  integer NOT NULL CHECK (effective_decay_days > 0),
  decay_at              timestamptz NOT NULL,
  validated_at          timestamptz,
  declining_at          timestamptz,
  archived_at           timestamptz,

  -- Provenance (per §1.7)
  imported              boolean NOT NULL DEFAULT false,
  imported_from         jsonb,                                      -- { account_id: string|null, exported_at: string } | null

  -- User overrides (per §1.5 read-path semantics)
  user_starred          boolean NOT NULL DEFAULT false,
  user_suppressed       boolean NOT NULL DEFAULT false,
  user_annotation       text,

  -- Variable-shape payload
  dimensions            jsonb NOT NULL,                             -- validated against descriptor.dimensions_schema
  evidence_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,         -- { last_n_ledger_ids: text[], summary: {...} }

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, pattern_type, fingerprint)
);

COMMENT ON TABLE kinetiks_pattern_library IS
  'Pattern Library per the Kinetiks Contract Addendum §1.2 (L1b canonical shape). Empirically validated multi-dimensional signatures with single primary outcome (outcome_metric + outcome_value + outcome_direction + baseline_value + lift_ratio). Hybrid storage: top-level lifecycle/outcome/evidence/override/provenance columns + jsonb only for dimensions and evidence_summary. team_scope_id is v2 placeholder. Reads via apps/id/src/lib/cortex/patterns/list.ts; writes via the Archivist sync path at /api/synapse/patterns and user-override Server Actions in apps/id.';

COMMENT ON COLUMN kinetiks_pattern_library.fingerprint IS
  'Server-computed deterministic hash of the descriptor''s fingerprint_dimensions (canonicalized + SHA-256, first 32 hex chars). Identity for the pattern within (account_id, pattern_type).';

COMMENT ON COLUMN kinetiks_pattern_library.lift_ratio IS
  'outcome_value / baseline_value when both present. Used for ranking in §1.5 reads. Higher means more lift, regardless of outcome_direction; the UI interprets via outcome_direction.';

COMMENT ON COLUMN kinetiks_pattern_library.evidence_summary IS
  'Rolling cap-50 last_n_ledger_ids + summary block. Detailed evidence lives in kinetiks_ledger; this is the pointer.';

COMMENT ON COLUMN kinetiks_pattern_library.imported IS
  'True if this pattern was seeded via /api/cortex/patterns/import. Together with imported_from, gives provenance per §1.7.';

-- ── Indexes (per §1.5 read paths + §1.6 decay sweep) ─────────
CREATE INDEX idx_pattern_library_account_status_type
  ON kinetiks_pattern_library (account_id, status, pattern_type);

CREATE INDEX idx_pattern_library_account_source
  ON kinetiks_pattern_library (account_id, source_app);

CREATE INDEX idx_pattern_library_account_icp
  ON kinetiks_pattern_library (account_id, applies_to_icp);

-- Decay sweep predicate: only active patterns are candidates.
CREATE INDEX idx_pattern_library_account_decay
  ON kinetiks_pattern_library (account_id, decay_at)
  WHERE status IN ('emerging','validated','declining');

CREATE INDEX idx_pattern_library_account_observed
  ON kinetiks_pattern_library (account_id, last_observed_at DESC);

CREATE INDEX idx_pattern_library_account_starred
  ON kinetiks_pattern_library (account_id)
  WHERE user_starred = true;

-- New: lift_ratio for ranking per §1.5.
CREATE INDEX idx_pattern_library_account_lift
  ON kinetiks_pattern_library (account_id, lift_ratio DESC NULLS LAST)
  WHERE status IN ('validated','emerging');

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
-- Legal transitions per Kinetiks Contract Addendum §1.6:
--   emerging  → validated | archived
--   validated → declining | archived
--   declining → validated | archived
--   archived  → (terminal)
CREATE OR REPLACE FUNCTION _kt_pattern_library_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION
      'kinetiks_pattern_library: status=archived is terminal (attempted → %)', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    (OLD.status = 'emerging'  AND NEW.status IN ('validated','archived')) OR
    (OLD.status = 'validated' AND NEW.status IN ('declining','archived')) OR
    (OLD.status = 'declining' AND NEW.status IN ('validated','archived'))
  ) THEN
    RAISE EXCEPTION
      'kinetiks_pattern_library: illegal transition % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

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
-- Reads: account-scoped. Writes: service-role only.
ALTER TABLE kinetiks_pattern_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own pattern library"
  ON kinetiks_pattern_library
  FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE policies: default deny means only service role
-- (the Archivist sync write path + per-pattern Server Actions in apps/id)
-- may mutate rows.
