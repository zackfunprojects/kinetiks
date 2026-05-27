# Phase 2: Empirical Decay Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Nightly Archivist job that adjusts each pattern's `effective_decay_days` within its registered `decay_bounds`, based on observed outcome stability. The algorithm is the deliverable; the Phase 1.5 fixture stream and Phase 1.7 Kinetiks-internal stream are the test bench.

**Why now.** Phase 1 ships pinned `initial_decay_days` per pattern type. Without calibration, patterns either decay too fast (validated insights get aged out before their evidence stabilizes) or too slow (stale patterns linger past their usefulness). Calibration was originally gated on ~90 days of real data; under the apps/id-only scope, fixture generators with controlled stability profiles provide the same calibration substrate immediately.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §1.6 (Lifecycle and Empirical Decay Calibration)
- `apps/id/src/lib/patterns/pattern-write.ts` (current Welford merge logic — calibration reads from the same variance/sample_size columns)
- `supabase/functions/archivist-cron/index.ts` (current 6h sweep — extend with the nightly calibration pass)

---

## Algorithm

For each pattern with `sample_size >= calibration_sample_threshold`:

1. Compute rolling outcome variance over a calibration window (default: 30 days). Use the existing `variance` column updated by `writePatternEmission()`.
2. Lookup the descriptor's `decay_floor_days`, `decay_ceiling_days`, and current `effective_decay_days`.
3. Decision:
   - **Variance low AND pattern re-validating** (status oscillates between `validated` and `declining` rarely, or stays `validated`) → multiply `effective_decay_days` by 1.1, clamp to `decay_ceiling_days`.
   - **Variance high OR pattern frequently entering `declining`** → multiply by 0.9, clamp to `decay_floor_days`.
   - Otherwise leave unchanged.
4. Write the new value with a `pattern_decay_calibrated` Ledger entry capturing prior value, new value, observed variance, calibration window samples, decision rationale.

Never move outside the bounds declared in the registry. The descriptor's `decay_bounds` is the truth.

## Files to change / create

| Path | Change |
|---|---|
| `apps/id/src/lib/patterns/decay-calibration.ts` | **New** pure function `calibratePattern(pattern, descriptor, window)` returning `{ next_effective_decay_days, rationale }` |
| `apps/id/src/app/api/archivist/patterns/calibrate/route.ts` | **New** Node route. INTERNAL_SERVICE_SECRET-auth. Loops eligible patterns per account, calls `calibratePattern`, updates rows, writes Ledger entries |
| `supabase/functions/archivist-cron/index.ts` | Extend with a nightly schedule branch (e.g. once per day at a fixed hour) that POSTs to `/api/archivist/patterns/calibrate` for each account. Existing 6h sweep stays untouched. |
| `supabase/migrations/0004X_edge_function_schedules.sql` | Follow-up migration if a new cron name is added; otherwise extend the existing archivist-cron schedule semantics (the function can run different work paths based on hour-of-day) |
| `supabase/migrations/0004X_pattern_decay_calibrated_ledger_event_type.sql` | Drop + recreate `kinetiks_ledger_event_type_valid` CHECK with `pattern_decay_calibrated` added |
| `packages/types/src/billing.ts` | Add `pattern_decay_calibrated: { pattern_id: string; prior_effective_decay_days: number; next_effective_decay_days: number; observed_variance: number; sample_size: number; rationale: string }` to `LedgerEventDetailMap` |
| `apps/id/src/lib/patterns/decay-calibration.test.ts` | **New** unit tests covering: variance-low extends; variance-high shortens; clamp at floor; clamp at ceiling; below-threshold skip |
| `supabase/tests/pattern_decay_calibration.sql` | **New** pgTAP. Asserts the calibration write path obeys RLS, the Ledger entry is correctly typed, cross-tenant isolation holds |

## Definition of Done

- Calibration runs nightly via cron (or as a branch within `archivist-cron` triggered at a specific hour of day).
- Fixture generators with explicit stability profiles produce predictable calibration moves: a "stable" generator's patterns extend `effective_decay_days`; an "unstable" generator's patterns shorten it. Both clamp inside the registered `decay_bounds`.
- `pattern_decay_calibrated` Ledger entries fire on every move with full rationale.
- Below-threshold patterns are skipped (no sample size, no move).
- Algorithm never violates `decay_floor_days` / `decay_ceiling_days`.
- Unit tests for the calibration math: variance-low extension, variance-high shortening, both clamps, threshold gating.
- pgTAP for the write path with cross-tenant isolation.
- `pnpm functions:check` returns OK after deploy.

## Verification

1. Phase 1.5 must be running for at least a few cycles with two contrasting stability profiles (one stable, one unstable). Confirm via `SELECT pattern_type, AVG(variance) FROM kinetiks_pattern_library WHERE source_app='kinetiks_fixtures' GROUP BY pattern_type` that the variance signal is differentiated.
2. Trigger the nightly calibration manually via `/api/archivist/patterns/calibrate`.
3. Query `SELECT pattern_type, AVG(effective_decay_days), MIN(effective_decay_days), MAX(effective_decay_days) FROM kinetiks_pattern_library WHERE source_app='kinetiks_fixtures' GROUP BY pattern_type`. Compare before/after. Confirm direction matches the stability profile.
4. Query `SELECT * FROM kinetiks_ledger WHERE event_type='pattern_decay_calibrated' ORDER BY created_at DESC LIMIT 20`. Confirm rationale strings are coherent and capture prior/next values.
5. Edge case: a pattern at `decay_ceiling_days` with low variance. Run calibration. Confirm value does NOT exceed ceiling.
6. Edge case: a pattern at `decay_floor_days` with high variance. Run calibration. Confirm value does NOT fall below floor.

## Out of scope

- Tuning the formula constants (w_obs, w_recency, w_stability, k_obs, k_recency) in §1.6. Those are pinned and held; revisit in a follow-up after a longer fixture run produces signal.
- Calibrating the `validate_at` / `decline_at` confidence thresholds themselves — only `effective_decay_days` moves in this phase.
- Per-account calibration (each account's patterns calibrate against their own observed stability, not global). Could be added later if cross-account contamination is observed; v1 is per-pattern within an account.
