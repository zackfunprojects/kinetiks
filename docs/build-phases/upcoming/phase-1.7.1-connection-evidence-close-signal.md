# Phase 1.7.1: Close the `connection_value_per_source` outcome signal

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Wire both the open and close hooks for `kinetiks_id.connection_value_per_source` so the pattern produces a real outcome signal instead of timing out at outcome=0 every cycle.

**Why now.** Phase 1.7 registered the pattern type and shipped `recordConnectionEvidenceObservation` as a documented stub. Audit on 2026-05-26 surfaced two facts: (1) the stub is acknowledged in the code, but (2) the helper is never actually called from any site in the codebase. The pattern type produces zero data today. Closing this before Phase 2 (Empirical Decay Calibration) is worthwhile because Phase 2 calibrates against observed variance — a pattern with zero emissions calibrates nothing.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §1 (Pattern Library contract)
- `apps/id/src/lib/patterns/emit-internal.ts:307-348` (current stub)
- `apps/id/src/lib/patterns/seeds/kinetiks-id.ts:298` (descriptor)
- `apps/id/src/lib/patterns/deferred-emit.ts` (`recordDeferredObservation` / `closeDeferredObservation` / `sweepExpiredDeferredObservations`)

---

## What "evidence used downstream" means (decision)

The pattern measures whether evidence from a given `(provider, layer, query_class)` triple was actually consumed in a way that informed a Marcus response or an Oracle insight. The defensible signal:

- **Open (record observation):** when the Agent Runtime successfully invokes a connection-backed tool and the tool returns data (not an error). Each tool call gets a unique `request_id`.
- **Close with outcome=1:** when the tool result is placed into Marcus's evidence brief *and* the resulting assistant response completes successfully. Inclusion in the brief is the deterministic signal that the data fed into Sonnet's reasoning context. The brief is the load-bearing structure per Marcus engine v2; if the data made it into the brief, it shaped the response by definition.
- **Close with outcome=1 (Oracle path):** when an Oracle insight is generated and its evidence references the tool call's result (insight's `evidence_refs` includes the `request_id` or matching `(provider, layer, query_class)` triple within the observation window).
- **Close with outcome=0 (expired):** if neither close path fires within `WINDOWS.connection_value_seconds` (24h), the existing `sweepExpiredDeferredObservations` already closes it as expired. No change there.

Note this is the *broader* signal — citation in the response body would be tighter but requires Haiku post-classification of the response. That refinement can come later; the brief-inclusion signal is already attributable and produces real variance.

## Files to change

| Path | Change |
|---|---|
| `apps/id/src/lib/patterns/emit-internal.ts` | Add `closeConnectionEvidenceObservation(account_id, request_id, admin)` next to the existing `recordConnectionEvidenceObservation`. Wraps `closeDeferredObservation` with `outcome_value: 1, outcome_recorded_via: "marcus_brief_inclusion" \| "oracle_insight_citation"`. Remove the "STUB — records a pending observation. There is no close signal yet" comment block once both hooks are wired. |
| `apps/id/src/lib/marcus/tool-bridge.ts` (or wherever `runTool` dispatch lives — verify) | After a successful connection-backed tool call (where the tool descriptor declares it consumes a connection — `ga4_query`, `gsc-query`, future ones), call `recordConnectionEvidenceObservation({ account_id, provider: tool.connection_provider, layer: tool.cortex_layer, query_class_hint: tool.name, request_id: toolCallId })`. Skip for tools without a `connection_provider` field (noop, internal lookups). |
| `apps/id/src/lib/marcus/pre-analysis.ts` (brief assembly) | After tool results are merged into the evidence brief and the brief is finalized, call `closeConnectionEvidenceObservation` for every `toolCallId` whose result was included. Pass `outcome_recorded_via: "marcus_brief_inclusion"`. Must fire **before** the Sonnet call so we don't race the assistant response (the brief inclusion is the observable event, not the response). |
| `apps/id/src/lib/oracle/insights/` (whatever generates insights from connection evidence) | If an insight cites a tool call's `request_id` (or matches `(provider, layer, query_class)` within the open window), call `closeConnectionEvidenceObservation` with `outcome_recorded_via: "oracle_insight_citation"`. |
| `packages/cortex/src/tools/types.ts` (or wherever `ToolDescriptor` lives — verify) | Add optional `connection_provider?: string` and `cortex_layer?: string` fields to the descriptor. `ga4_query` declares `connection_provider: "ga4"`, `cortex_layer: "analytics"`. `gsc-query` declares `connection_provider: "gsc"`, `cortex_layer: "analytics"`. Schema-only addition. |
| `apps/id/src/lib/tools/ga4-query.ts`, `apps/id/src/lib/tools/gsc-query.ts` | Populate the new descriptor fields. No behavior change. |
| `apps/id/src/lib/patterns/__tests__/emit-internal.test.ts` (new, or extend existing) | Unit test: record + close → outcome=1; record alone + sweep → outcome=0; double-close is idempotent (second call no-ops); close without record is logged but doesn't throw. |
| `supabase/tests/kinetiks_id_patterns.sql` (extend) | Add cross-tenant test: account A's tool call records an observation; account B cannot close it via RLS even with a matching `request_id`. |

## Definition of Done

- `recordConnectionEvidenceObservation` is called for every successful connection-backed tool call. Verified by running a Marcus turn that triggers `ga4_query` and inspecting `kinetiks_pattern_pending_observations`.
- `closeConnectionEvidenceObservation` is called when the tool result is placed in Marcus's evidence brief. Verified by the same Marcus turn producing a row in `kinetiks_pattern_library` for `kinetiks_id.connection_value_per_source` with `outcome_value` reflecting the observation.
- Oracle insight path closes observations when an insight cites the tool call. Verified by triggering an Oracle run against an account with recent tool calls.
- Expired observations still flow through `sweepExpiredDeferredObservations` and close as outcome=0. No regression.
- Tool descriptors for `ga4_query` and `gsc-query` declare `connection_provider` and `cortex_layer`.
- Unit + pgTAP coverage per the table above.
- Stub comment block in `emit-internal.ts` is removed; new comment block documents the open/close contract.
- `kinetiks_id.connection_value_per_source` produces emissions with non-zero variance within 7 days of deploy (assuming `ga4_query` / `gsc-query` are exercised). If only one connection is being used, manual testing across both is fine.

## Verification

1. Local dev with a connected GA4 account. Run a Marcus turn that triggers `ga4_query` ("how's my traffic looking?").
2. `SELECT * FROM kinetiks_pattern_pending_observations WHERE pattern_type='kinetiks_id.connection_value_per_source' ORDER BY created_at DESC LIMIT 5;` — confirm an observation appears with `dimensions->>provider='ga4'`, `dimensions->>layer_touched='market'`, `dimensions->>query_class='ga4_query'`. (Note: the canonical dimension key is `layer_touched`, not `layer`; GA4 + GSC tools declare `cortex_layer: "market"` which maps onto the pattern type's `CONTEXT_LAYERS` enum.)
3. After the turn completes, re-query the same table — row should be closed (deleted or marked closed depending on `closeDeferredObservation`'s semantics). Confirm by reading `deferred-emit.ts`.
4. `SELECT * FROM kinetiks_pattern_library WHERE pattern_type='kinetiks_id.connection_value_per_source' AND account_id=$ACCOUNT;` — confirm the pattern row has incremented `sample_size` and a non-zero `outcome_value`.
5. `SELECT * FROM kinetiks_ledger WHERE event_type='pattern_observation' AND detail->>'pattern_type'='kinetiks_id.connection_value_per_source' ORDER BY created_at DESC LIMIT 5;` — confirm Ledger entry fired with `outcome_recorded_via` in the detail.
6. Edge case: trigger a tool call that errors out (e.g., expired OAuth). Confirm no observation is recorded (open hook is gated on tool success).
7. Edge case: tool call succeeds but result is empty (zero rows). Confirm observation IS recorded (data was returned, just empty) and brief inclusion still closes it. Empty results are still evidence — they tell Marcus the connection has no signal for that query.

## Out of scope

- Citation-level outcome scoring (Haiku judges whether the response actually quoted the data). Defer to a future refinement once we have enough data to know whether brief-inclusion is too permissive.
- Backfilling historical tool calls. Phase 1.7.1 starts the signal from deploy forward.
- Extending to non-Marcus tool consumers (e.g., background agents that pull connection data without a brief). When those exist (Phase 4 timeframe), add the close hook in their result-consumption path.
- Touching the descriptor's `decay_bounds` or `calibration_sample_threshold` — Phase 2 handles those.
