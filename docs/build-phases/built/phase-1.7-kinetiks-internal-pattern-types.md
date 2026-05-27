# Phase 1.7: Kinetiks-internal pattern types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Register four pattern types that Kinetiks Core itself produces empirical signal for, and wire emissions from real (non-fixture) code paths. Even with no suite apps, Kinetiks Core observes meaningful customer behavior and can produce patterns about itself. The Patterns tab gets both fixture-sourced (Harvest-shaped) and real (Kinetiks-internal) patterns from day one.

**Why now.** Phase 1.5 unblocks downstream phases but only proves the fixture path. Phase 1.7 proves real emissions from `apps/id` itself; it doubles as the first end-to-end "real" emitter and the proof that the pattern infrastructure works against true production data. It also gives Marcus a kind of pattern (its own behavior) that no fixture generator should ever simulate.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §1.3 (Pattern Type Registry)
- `apps/id/src/lib/patterns/seeds/harvest.ts` (reference shape for descriptors)
- `apps/id/src/lib/patterns/registry-boot.ts` (where new seed packs register)

---

## Pattern types to register

| `pattern_type` | Outcome metric | Dimensions (fingerprint) | Emission site |
|---|---|---|---|
| `kinetiks_id.marcus_question_resonance` | follow-up turn rate (0-1) | topic cluster, question intent, ICP segment | Marcus turn completion handler |
| `kinetiks_id.insight_action_rate` | action acceptance rate (0-1) | Oracle insight category, severity, urgency bucket | Oracle insight delivery / action accept handler |
| `kinetiks_id.onboarding_question_value` | context-structure-value delta (z-score) | question id, ICP segment | Onboarding question completion handler |
| `kinetiks_id.connection_value_per_source` | evidence-usefulness rate (0-1) | connection provider, layer touched, query class | Connection evidence aggregation handler |

All four declare:
- `source_app: "kinetiks_id"`
- `read_apps: ["marcus", "oracle"]` (`kinetiks_id` is implicit; `customer_visible: true`)
- `bucketize()` for any high-cardinality dimension (topic cluster, insight category)
- `decay_bounds` appropriate to the cadence (Marcus turns are frequent → tighter decay; onboarding is one-shot → longer decay)
- `confidence thresholds` matching the canonical formula

## Files to change / create

| Path | Change |
|---|---|
| `apps/id/src/lib/patterns/seeds/kinetiks-id.ts` | **New** seed pack registering the four pattern types with full descriptors |
| `apps/id/src/lib/patterns/registry-boot.ts` | Include the new seed pack |
| `apps/id/src/lib/marcus/turn-completion.ts` (or the existing handler that closes a Marcus turn) | After persisting the turn, emit `kinetiks_id.marcus_question_resonance` via `/api/synapse/patterns`. Outcome value = 1 if user followed up within N hours, 0 otherwise; emission is deferred via a queue/job because outcome is delayed |
| `apps/id/src/lib/oracle/insight-delivery.ts` (existing) | On insight surface, schedule a deferred emission. When the user accepts/rejects or the window expires, emit `kinetiks_id.insight_action_rate` |
| `apps/id/src/lib/onboarding/question-completion.ts` (existing or wrap the existing handler) | After Cartographer processes the answer, compute the context-structure-value delta and emit `kinetiks_id.onboarding_question_value` |
| `apps/id/src/lib/connections/evidence-aggregation.ts` (new wrapper if not present) | Track which connection-provider + layer + query class produces evidence that downstream Marcus/Oracle turns actually use; emit `kinetiks_id.connection_value_per_source` on a rolling window |
| `supabase/tests/kinetiks_id_patterns.sql` | **New** pgTAP. Extends cross-tenant isolation test to the four new types; CHECK constraint compliance |

## Deferred-emission helper

Three of the four outcomes are **delayed** (follow-up rate, action acceptance, evidence usefulness). They can't be emitted at the moment of the observed event because the outcome isn't known yet. Add a thin scheduling helper (or reuse an existing job/queue mechanism) that:

1. Records the observation at event time (dimensions + a pending outcome row).
2. Closes the observation when the outcome window expires or the outcome arrives (whichever first).
3. Emits the pattern at closure time with the final outcome value, sample size, and variance.

Keep this helper inside `apps/id/src/lib/patterns/deferred-emit.ts` (new). It's a Kinetiks-internal concern — suite apps will have their own analogous helpers.

## Definition of Done

- All four pattern types appear in `getRegistry()` at apps/id boot (verify via a unit test or boot smoke check).
- The four real code paths emit through `/api/synapse/patterns` with `source_app: "kinetiks_id"`. Verify by triggering each event in a dev environment and querying `kinetiks_pattern_library`.
- Patterns are queryable via `query_patterns` (test via Marcus tool invocation) and visible in the Cortex Patterns UI.
- Cross-tenant isolation pgTAP test extended to cover the new types.
- Deferred-emit helper has unit tests for the timeout path and the success path.
- No fixture generator is added for these types — they are real-only.

## Verification

1. `pnpm dev`. Send a Marcus message; complete a turn. Wait the follow-up window (or shorten it via env in dev). Query `SELECT * FROM kinetiks_pattern_library WHERE pattern_type LIKE 'kinetiks_id.%'` — confirm a `marcus_question_resonance` row.
2. Trigger an Oracle insight delivery; accept or reject it. Confirm `insight_action_rate` emits.
3. Complete an onboarding question. Confirm `onboarding_question_value` emits.
4. Connect a data source; let evidence aggregation run. Confirm `connection_value_per_source` emits.
5. Patterns tab shows both fixture and Kinetiks-internal patterns. Filter by `source_app` — both groups render correctly.
6. Marcus brief — when relevant validated patterns exist, both fixture-sourced and Kinetiks-internal patterns can appear in `[RELEVANT PATTERNS]` (the read path is `source_app`-agnostic by design).

## Out of scope

- Generators that synthesize Kinetiks-internal pattern types. These are real-only.
- Acting on the patterns (e.g. Marcus changing behavior based on its own resonance pattern). That's a future judgment-loop phase, not this one.
- The `connection_value_per_source` requires a "did Marcus/Oracle use this evidence" signal; if that signal doesn't exist yet, the emission helper can stub the outcome with a TODO and add the signal in a follow-up. Document the gap if it ships incomplete.
