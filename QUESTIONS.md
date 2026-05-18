# Open Questions

> Track ambiguity, deferred decisions, and items that need explicit confirmation. Keep entries terse; resolution is captured in a PR or a follow-up commit.

---

## Pattern Library Phase 1 (L1a)

### Discriminated-union refactor of `LedgerEntry.detail`

Currently `LedgerEntry.detail` is `Record<string, unknown>` and the `LedgerEventType` union is a flat string union with no DB CHECK constraint. The Pattern Library Phase 1 keeps this shape and relies on writer-side helpers to enforce per-event detail shape.

A typed discriminated union per event type would tighten the contract. Cost: every existing Ledger writer (including Edge Functions that write strings outside the current union) needs updating. Benefit: compile-time guarantees on `detail` shape, easier reviewer load on new event types.

Decision deferred. Open for a separate structural improvement phase.

### DB CHECK constraint on `kinetiks_ledger.event_type`

The column is currently unconstrained. Tightening it to match the TS union would require auditing every Edge Function and worker that writes Ledger rows. Worth doing eventually; not Phase 1 scope.

### Confidence formula constants

Phase 1 ships pinned constants (`w_obs=0.5`, `w_recency=0.2`, `w_stability=0.3`, `k_obs=8`, `k_recency=effective_decay_days/2`) in the Kinetiks Contract Addendum §1.6. These were chosen for shipping; they will likely be revisited once the 14-day acceptance criterion produces real signal. Phase 2 calibration adjusts `effective_decay_days` within bounds; the formula weights themselves may also be tuned.

Track outcomes from the first two weeks of real Harvest emissions and revise here.

### Cortex Patterns UI: Budget tab inclusion

CLAUDE.md (§ UI quality) declares the seven-section Cortex sub-nav: Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger. Phase 1 ships only Patterns and the four pre-existing tabs (Identity, Goals, Integrations, Ledger). Budget and Authority join in their respective phases.

Decision: leave Budget for its own phase. `BudgetManager.tsx` exists today but is referenced from elsewhere; the dedicated tab is a separate scope decision.

### State machines module location drift (now resolved)

CLAUDE.md previously referenced `@kinetiks/cortex/state-machines.ts` in three places (lines 440, 510, 526), but the actual module is `@kinetiks/lib/state-machines`. Resolved in the L1a commit "chore(claude-md): fix Lessons #2 hybrid-shape contradiction; flag state-machine drift." Future work that touches state-machine code should keep the rule that the canonical module is `@kinetiks/lib/state-machines`, with registration in `apps/id/src/lib/state-machines-init.ts`.

If a future refactor moves state machines back into `@kinetiks/cortex`, update CLAUDE.md and the Kinetiks Contract Addendum's §1.6 reference.

---

## L1b: canonical alignment landed

The six L1a divergences from the canonical addendum (Kinetiks Contract
Addendum.md) have been resolved in the L1b phase per the author's
decisions on return. Recording the resolution here.

### 1. Storage shape — RESOLVED: keep L1a hybrid; canonical updated

The L1a hybrid posture (top-level lifecycle/outcome/evidence/override
columns + jsonb for variable-shape payload only) stays in place per
the canonical §1.5 read-path requirement (filtering and ranking on
indexed columns). The canonical §1.2 was updated in commit
`docs(addendum): §1.2 acknowledge hybrid storage; §1.3 add bucketize`
to acknowledge the hybrid explicitly and cite the indexing rationale.
CLAUDE.md Lessons #2 already reflected this; the canonical doc now
matches.

### 2. Outcome metrics — RESOLVED: aligned to canonical single-primary

The L1a `outcome_metrics: PatternOutcomeMetric[]` array shape was
refactored to canonical single-primary (`outcome_metric`,
`outcome_value`, `outcome_direction`, `baseline_value`, `lift_ratio`)
on both the Pattern row and the PatternEmissionPayload. Multi-outcome
insights are now modeled as separate pattern types sharing
fingerprint dimensions. The seven Harvest seed descriptors reflect
the split (`outreach_angle_performance.reply_rate`,
`outreach_angle_performance.meeting_book_rate`, etc.). Pattern-write
merge logic uses Welford's parallel algorithm to combine outcome
samples + variances with running mean updates. `lift_ratio` drives
list-helper ranking per §1.5.

### 3. Field rename — RESOLVED: `emitting_app` → `source_app`

Migration 00041 drops + recreates `kinetiks_pattern_library` with the
canonical column name. Every read path, write path, UI, API endpoint,
Synapse client, and Marcus brief now reads/writes `source_app`. The
read helper exports `listPatternTypesForSourceApp`;
`listPatternTypesForEmittingApp` is a deprecated alias kept during
the transition for any out-of-tree callers.

### 4. Missing canonical fields — RESOLVED: added to the row

Migration 00041 adds top-level columns for `source_workflow_id`
(nullable; Phase 3 wires it), `variance` (nullable; Welford-updated
on merge), `imported` (boolean), `imported_from` (jsonb,
`{ account_id, exported_at }`). The import endpoint now sets
`imported=true` and stamps a hashed source account id at insert time.

### 5. Export payload — RESOLVED: full canonical alignment

Export emits `export_type: 'full' | 'filtered'` (driven by request
filters), `filters: PatternExportRequest` (echo), and
`pattern_type_registry_snapshot: PatternTypeDescriptorSnapshot[]`
(serializable subset of every descriptor present in the export).
`schema_version: '1.0.0'` matches canonical §1.7. Import consumes the
new shape.

### 6. Bucketize spec — RESOLVED: added to canonical §1.3

The canonical §1.3 was updated to declare `bucketize` and
`expected_max_fingerprints_per_account` as first-class descriptor
fields with the cardinality-discipline rationale stated explicitly.

---

## L1b: additional structural improvements landed

### LedgerEntry discriminated union — RESOLVED: tightened with open extension

`LedgerEntry.detail` is now typed via `LedgerEventDetailMap[K] & { [key: string]: unknown }` — a discriminated union per event_type
plus an open extension so legacy writers that include richer detail
keep compiling. `LedgerEventType` is derived from the map keys
(single source of truth). Migration 00042 adds a CHECK constraint on
`kinetiks_ledger.event_type` enforcing the union at the DB layer
(audited 38 event types currently written across the codebase).

### Confidence formula constants — HELD for 14-day acceptance

Phase 1 pinned constants (w_obs=0.5, w_recency=0.2, w_stability=0.3,
k_obs=8, k_recency=effective_decay_days/2) per canonical §1.6. Held
until two weeks of real Harvest emissions produce signal.

### Cortex Patterns UI: Budget tab — DEFERRED

Phase 1 ships Patterns only. Budget tab joins in its own phase.

---

## L1b: acceptance criteria

The Pattern Library is now canonical-aligned. Going into the 14-day
acceptance window:

1. Within 14 days of the first real Harvest emissions, at least one
   pattern of each of the seven registered Harvest pattern types must
   reach `validated` status. If none do, the descriptor's
   bucketization is too narrow — revisit before adding pattern types.
2. Marcus's evidence brief should include a `[RELEVANT PATTERNS]`
   block for any chat turn where at least one validated pattern
   exists for the customer's ICP. Verify the response weaves the
   implication into the recommendation rather than dumping raw
   statistics.
3. The export/import round-trip should preserve the `dimensions`
   blob and the canonical outcome shape verbatim, halve the
   confidence on import, and emit a `pattern_imported` Ledger entry
   with `imported_from_account_id_hash` for every imported pattern.
4. The `archivist-cron` 6-hour sweep should transition any
   `validated` pattern with `last_observed_at > effective_decay_days
   * 0.7` to `declining`, and any `declining` pattern past `decay_at`
   to `archived`. User-starred patterns remain exempt.

If any of these fail in production, surface in this file as a new
open question; do not paper over with looser thresholds.
