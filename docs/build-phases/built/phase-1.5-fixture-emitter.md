# Phase 1.5: Fixture Emitter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Build a feature-flagged emitter inside `apps/id` that periodically calls `/api/synapse/patterns` with synthetic-but-plausible payloads for the seven registered Harvest pattern types. Patterns enter the normal arbitration pipeline (`writePatternEmission()`), Welford-merge with existing rows, transition through `emerging → validated → declining → archived`, and surface in the Cortex Patterns UI, Marcus evidence brief, and Ledger like any real emission would. Gated by `KINETIKS_FIXTURES_ENABLED=true`.

**Why now.** Pattern Library Phase 1 has shipped end-to-end but is starved for emissions. Without volume, Phase 2 calibration math has no test bench, Marcus's `[RELEVANT PATTERNS]` block stays empty, and Phase 4 has no operational evidence to ground Authority Agent proposals against. Fixtures are the substrate that unblocks everything downstream.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §1 (Pattern Library), §1.4 (Write Path), §1.6 (Lifecycle and Decay)
- `CLAUDE.md` — Fixtures Patterns section (seven rules); Pattern Library Patterns (write/read rules); Lessons #7 (Cron + Node API split)

---

## Architecture

Same shape as `gmail-sync-cron` (Deno Edge Function → Node API): a Deno cron loops over active accounts and POSTs to a new internal Node route. The Node route checks `KINETIKS_FIXTURES_ENABLED`, dispatches per-pattern-type generators, and emits each generated pattern through `/api/synapse/patterns` internally (same payload shape as a real Synapse client). The Deno layer stays thin; all generator logic lives in Node where it can import from `packages/types` and use existing helpers.

```text
supabase/functions/fixture-emitter-cron (Deno)
  → POST /api/internal/fixtures/emit (Node, INTERNAL_SERVICE_SECRET)
     → dispatches generators in apps/id/src/lib/fixtures/
        → emits via POST /api/synapse/patterns (existing endpoint)
           → writePatternEmission() → kinetiks_pattern_library + kinetiks_ledger
```

## Files to change / create

| Path | Change |
|---|---|
| `packages/lib/src/env.ts` | Add `KINETIKS_FIXTURES_ENABLED: z.coerce.boolean().optional().default(false)` to `kinetiksServerEnvSchema` |
| `apps/id/src/lib/fixtures/index.ts` | **New** registry: `getGenerators()` returns the seven Harvest generators keyed by `pattern_type` |
| `apps/id/src/lib/fixtures/distributions.ts` | **New** statistical helpers (clipped-normal, beta-ish, decay random walks, bucket samplers) |
| `apps/id/src/lib/fixtures/harvest-outreach-angle-performance.ts` | **New** generators for `.reply_rate` and `.meeting_book_rate` |
| `apps/id/src/lib/fixtures/harvest-sequence-step-conversion.ts` | **New** generators for `.open_rate` and `.reply_rate` |
| `apps/id/src/lib/fixtures/harvest-icp-resonance.ts` | **New** generators for `.reply_rate`, `.meeting_book_rate`, `.deal_close_rate` |
| `apps/id/src/app/api/internal/fixtures/emit/route.ts` | **New** Node route. INTERNAL_SERVICE_SECRET-auth. Checks `KINETIKS_FIXTURES_ENABLED`. Loads generators, builds emission payloads, POSTs each to `/api/synapse/patterns`. |
| `apps/id/src/app/api/internal/fixtures/cleanup/route.ts` | **New** Node route. Archives all patterns with `source_app = 'kinetiks_fixtures'` (status → 'archived'); writes a single `fixture_cleanup` Ledger entry summarizing the count. |
| `supabase/functions/fixture-emitter-cron/index.ts` | **New** Deno function. Iterates active accounts via service-role select; POSTs each to `/api/internal/fixtures/emit` with INTERNAL_SERVICE_SECRET. Honors `KINETIKS_FIXTURES_ENABLED` on the Supabase side too (no-op when false). |
| `supabase/migrations/00043_edge_function_schedules.sql` | **New** follow-up migration. Re-applies all existing schedules (keep 00038 baseline intact) plus the new `fixture-emitter-cron` schedule. Cadence: every 2 hours initially (`0 */2 * * *`); generators produce ~5-20 patterns per account per call so daily volume is in the right ballpark. |
| `supabase/migrations/00044_fixture_emission_ledger_event_type.sql` | **New** migration. Drops + recreates `kinetiks_ledger_event_type_valid` CHECK with `fixture_emission` and `fixture_cleanup` added to the union. Preserves `NOT VALID`. |
| `packages/types/src/billing.ts` | Add `fixture_emission: { pattern_type: string; dimensions_fingerprint: string; outcome_value: number; is_fixture: true }` and `fixture_cleanup: { archived_count: number; is_fixture: true }` to `LedgerEventDetailMap` |
| `apps/id/src/components/cortex/PatternsManager.tsx` (or wherever pattern rows render) | Render a small "fixture" tag where `source_app === 'kinetiks_fixtures'`. Use existing tokens. |
| `apps/id/src/app/(app)/cortex/ledger/...` | Same fixture tag rule on Ledger rows where `detail.is_fixture === true` |
| `supabase/tests/fixtures_emission.sql` | **New** pgTAP test. Asserts: insert fixture-sourced pattern works; cross-tenant isolation holds; cleanup endpoint archives only fixture-sourced patterns. |

## Generator design

Each generator returns a list of `PatternEmissionPayload` objects with:

- `source_app: "kinetiks_fixtures"`
- `pattern_type` matching the Harvest descriptor it's mimicking
- `dimensions` drawn from the same `bucketize()` outputs the real Harvest emitters would (industry bucket, seniority, employee-count bucket, step index, channel, etc.)
- `outcome_value`, `sample_size`, `variance` drawn from realistic B2B SaaS ranges (e.g. reply rates 2-12%, meeting book rates 5-25% of replies)
- `outcome_direction` matching the descriptor's primary metric
- `applies_to_icp: true | false` weighted ~85/15

Per-generator stability profile is a knob: some generators bias toward stable outcomes (validate quickly, stay validated); others toward unstable (oscillate, eventually decline). This gives Phase 2 calibration a varied test bench. Profile is controlled by a per-generator config object — not random per-run.

## Definition of Done

- With `KINETIKS_FIXTURES_ENABLED=true` in dev, the fixture cron emits steadily; `kinetiks_pattern_library` row count grows with `source_app = 'kinetiks_fixtures'`.
- Cortex Patterns UI shows fixture-labeled patterns transitioning through `emerging → validated → declining → archived` over the appropriate decay windows.
- Marcus evidence brief surfaces fixture patterns in the `[RELEVANT PATTERNS]` block for chat turns whose ICP matches.
- Cleanup endpoint archives all fixture patterns when called; Ledger preserves history (no DELETEs).
- `pnpm functions:check` returns OK after `pnpm functions:deploy` lands the new function.
- pgTAP tests cover the fixture-emission CHECK constraint, cross-tenant isolation, cleanup idempotency.
- Migration `00043` re-states every existing schedule plus the new one (no drift).
- `KINETIKS_FIXTURES_ENABLED` is documented in `docs/operational/env-vars.md` and committed in the same PR.
- All env vars set in both Supabase (Edge Function env) and Vercel (Node env).
- `/api/health` green after the env change.

## Verification

1. Set `KINETIKS_FIXTURES_ENABLED=true` locally.
2. Manually invoke the cron: trigger the Edge Function via the Supabase CLI or by curl'ing `/api/internal/fixtures/emit` directly.
3. Query `SELECT COUNT(*), source_app FROM kinetiks_pattern_library GROUP BY source_app` — confirm new rows with `source_app = 'kinetiks_fixtures'`.
4. Open Cortex Patterns UI — confirm fixture-tagged rows; click into one and confirm dimensions look plausible.
5. Run several cron cycles (or invoke manually a few times). Confirm at least one fixture pattern transitions to `validated` (sample size and confidence cross threshold).
6. Wait for or accelerate the archivist 6h sweep. Confirm decay transitions on fixture patterns where `last_observed_at > effective_decay_days * 0.7`.
7. Open a Marcus turn whose ICP context matches a validated fixture pattern. Confirm the brief includes `[RELEVANT PATTERNS]` with that pattern's implication.
8. Call `/api/internal/fixtures/cleanup` with INTERNAL_SERVICE_SECRET. Confirm all fixture patterns flip to `status='archived'`. Confirm Ledger has the `fixture_cleanup` entry.
9. With `KINETIKS_FIXTURES_ENABLED=false`, run the cron — confirm it no-ops (no new emissions).

## Out of scope

- Any change to `writePatternEmission()`, the Pattern Type Registry, or `/api/synapse/patterns` itself. Fixtures must not require platform changes.
- Generators for Dark Madder / Hypothesis / Implosion pattern types — those types aren't registered yet.
- The `VALIDATE CONSTRAINT` pass on `kinetiks_ledger_event_type_valid`. That's Phase 2.5 (after this phase + Phase 2 + Phase 4 each add their event types).
- UI configuration of fixtures (turning generators on/off via UI). Initially controlled by code.
