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

## Divergences from the canonical addendum (flag for review)

The L1a implementation was authored against a parallel "fabricated" §1 text that has now been deleted in favor of `docs/Kinetiks Contract Addendum.md`. Several non-trivial divergences from the canonical surface remain. None are blocking, all are localized, all are correctable later without breaking changes outside their own module — but they should be reviewed.

### 1. Storage shape: hybrid columns vs `data` jsonb

The canonical §1.2 declares the Pattern interface as a top-level field list AND says one line later: "The same shape as every other `kinetiks_*` context table: payload in `data` jsonb with sibling `confidence_score` column." Those two statements together permit two readings: (a) the interface is the read shape, the physical row is `(account_id, data jsonb, confidence_score, ...)`; or (b) the interface IS the physical shape, the trailing sentence is loose guidance about general structural style.

The L1a implementation chose reading (b) — hybrid table with lifecycle fields as top-level columns and `dimensions` / `outcome_metrics` / `evidence_summary` in jsonb. Justification: indexed reads on `(pattern_type, status, applies_to_icp, confidence_score, decay_at)` need top-level columns and matching B-tree indexes; the per-row decay sweep would otherwise need `data->>'status'`-style filtering with jsonb index strategies that don't compose as cleanly. CLAUDE.md Lessons #2 was rewritten to acknowledge the hybrid posture for both `kinetiks_pattern_library` and `kinetiks_authority_grants`.

If the spec intent is reading (a) — pure `data` jsonb — this is a structural change that requires a follow-up migration: drop the lifecycle columns, move them into `data` jsonb, add jsonb GIN indexes, rewrite the read helper and the pattern-write module to operate against the jsonb shape. Not blocking, but the choice should be explicit before Phase 2 calibration adds more pattern logic on top.

### 2. Outcome metrics: single primary vs array

The canonical §1.2 declares a single primary outcome on each Pattern: `outcome_metric: string`, `outcome_value: number`, `outcome_direction: 'higher_is_better' | 'lower_is_better'`, `baseline_value: number | null`, `lift_ratio: number | null`. L1a stores `outcome_metrics: PatternOutcomeMetric[]` (array) with per-metric `metric_name`, `value`, `sample_count`, `confidence`, `unit`.

The array shape is richer — a pattern can track multiple outcomes (reply_rate AND meeting_book_rate AND deal_close_rate on the same ICP signature). The canonical single-metric shape constrains a pattern to one outcome at a time and embeds direction + baseline + lift_ratio as first-class fields.

Implications of the divergence:
- L1a does not store `outcome_direction` or `baseline_value` or `lift_ratio`. The canonical §1.6 expects `lift_ratio` to drive ranking; L1a ranks by `confidence_score` only.
- Merging in the L1a write path is a per-metric weighted average; the canonical shape implies one merge per outcome on each emission.
- `valid_outcome_metrics` on the descriptor (an array of metric names) is consistent with the L1a shape; the canonical's single-metric shape would constrain `valid_outcome_metrics` differently.

Recommendation: align to canonical when Implosion lands (Implosion's signatures are paired with one primary outcome per pattern by design). Until then, the array shape composes safely with the canonical's higher-level claims.

### 3. Field naming: `emitting_app` vs `source_app`

The canonical §1.2 names the originating app `source_app`. L1a stores `emitting_app` on the row and uses `source_apps[]` in the read filter. Both refer to the same concept; the rename is a follow-up. The column rename and codebase-wide search-and-replace is mechanical and bounded.

### 4. Missing canonical fields

The canonical §1.2 Pattern interface includes fields L1a does not store:
- `source_workflow_id: string | null` — the Workflow run that produced this pattern, if applicable. L1a has no Workflow integration (Workflows are Phase 3); this field can be added when Operator Workflows land.
- `variance: number | null` — top-level. L1a stores variance implicitly via the stability term in the confidence formula; the canonical exposes it.
- `imported: boolean` + `imported_from: { account_id, exported_at }` — provenance. L1a logs imports to the Ledger only; the canonical wants these on the row.

These are additive columns; future migrations can layer them on without rewriting existing rows.

### 5. Export payload shape

Canonical §1.7 export shape includes `export_type: 'full' | 'filtered'`, `filters: PatternExportRequest`, and `pattern_type_registry_snapshot: PatternTypeDescriptor[]`. L1a's export emits only `{ schema_version, exported_at, account_id, patterns: PatternExportEntry[] }` — no registry snapshot, no filter echo. Schema version is now `'1.0.0'` per canonical.

The missing `pattern_type_registry_snapshot` is the more meaningful divergence — without it the export is not fully self-describing for cross-account import, since the destination account may have different registry descriptors. Recommendation: add the snapshot in a follow-up commit before the first real cross-account migration.

### 6. Bucketize as part of the canonical

The L1a implementation adds a `bucketize` function on the descriptor and an explicit `expected_max_fingerprints_per_account` to prevent pattern type explosion. These are not in the canonical §1.3 registry shape. The canonical does not address cardinality discipline. L1a's design choice was conservative — without bucketization, the failure mode of pattern type explosion makes the Library useless.

Recommendation: bring this into the canonical registry descriptor in the next spec revision. The implementation will not change; the doc will.

---

These six divergences should be reviewed alongside the L1a code. The L1a implementation is internally consistent and ships; aligning it to the canonical in spirit and letter is a follow-up phase.
