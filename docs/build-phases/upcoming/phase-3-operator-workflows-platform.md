# Phase 3 — Operator Workflows Platform

> Move this file to `docs/build-phases/built/` when the PR merges and the DoD is fully satisfied in production.

**Goal.** Ship the platform layer for internal Operator Workflows per the Kinetiks Contract Addendum §3, and validate it by registering Kinetiks Core's five operators (Cartographer, Archivist, Marcus, Oracle, Authority Agent stub) and converting the 6-hour `archivist-cron`'s four sequential HTTP calls into one `WorkflowDefinition` dispatched through the new runtime.

When Implosion lands later, it slots in as the second consumer of this platform with zero platform changes.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §3 (Operator Workflows)
- `docs/platform-contract.md` (App Manifest, Synapse Routing Event)
- `CLAUDE.md` — Three-Layer agent rules, Lesson #8 (deployed-state verification), Lesson #9 (instrumentation runtime split)

---

## What this phase actually ships

### New platform primitives

| Path | Purpose |
|---|---|
| `packages/types/src/workflows.ts` | `WorkflowTask`, `WorkflowDefinition`, `WorkflowDispatchContext`, `WorkflowTaskResult`, `WorkflowRunSummary`. `target_type: "cross_app" | "internal_operator"` is the new addressing mode per Addendum §3.2. |
| `packages/types/src/manifests.ts` | `KineticsAppManifest` — first declaration of the manifest contract type, with `operator_registry?: OperatorDescriptor[]` (Addendum §3.3) and a forward-compat `default_standing_grants?` slot for Phase 5. |
| `packages/types/src/billing.ts` (extended) | Three new `LedgerEventDetailMap` entries: `workflow_task_dispatched`, `workflow_task_completed`, `workflow_task_failed`. PII-safe shape (counts, ids, error classes only). |
| `packages/runtime/src/workflow-dispatch.ts` | `dispatchWorkflowTask` + `runWorkflow`. Cross-app branch inserts a `kinetiks_routing_events` row via host-injected deps; internal branch calls `assertOperator`, validates input/output against the descriptor's Zod schemas, then invokes the host's `resolveOperator`-returned executor. Per-task Ledger writes; first-failure stops the run. |
| `supabase/migrations/00049_workflow_task_ledger_event_types.sql` | Drop + recreate `kinetiks_ledger_event_type_valid` CHECK with the three new event types. `NOT VALID` (Phase 4.5 closes the VALIDATE pass). |

### Kinetiks Core operator wiring

| Path | Purpose |
|---|---|
| `apps/id/src/lib/operators/descriptors.ts` | Five `OperatorDescriptor`s for `kinetiks_id`. Marcus's `required_tools` mirrors the real Tool Registry boot list; Oracle's matches its analytics tools; Cartographer / Archivist / Authority-Agent stay empty until later phases wire them through the runtime. |
| `apps/id/src/lib/operators/executors/{cartographer,marcus,oracle,authority-agent-stub}.ts` | Stubs that throw `not_implemented` with a clear message naming the phase that lands them. |
| `apps/id/src/lib/operators/executors/archivist.ts` | Real executor. Validates input against `archivistInputsSchema`, branches on `step`, calls the matching `runArchivist*ForAccount` helper for each account in the batch, returns aggregated counts. `only_at_utc_hour` short-circuits at the operator boundary (the calibrate step no-ops outside 00:00 UTC). |
| `apps/id/src/lib/operators/registry-boot.ts` | `bootOperatorRegistry()` (idempotent) + `resolveKinetiksOperator(app, key)`. Wired into `instrumentation-node.ts` between `bootPatternTypeRegistry()` and `bootToolRegistry()` so `assertRegistriesValid()` (already invoked at the end of `bootToolRegistry()`) catches any `required_tools` / `required_patterns` / `action_classes` references that don't resolve. |

### Archivist refactor (no behavior change for direct callers)

| Path | Purpose |
|---|---|
| `apps/id/src/lib/archivist/run-clean.ts` | Extracted from `clean/route.ts`. `runArchivistCleanForAccount(admin, accountId)`. |
| `apps/id/src/lib/archivist/run-pattern-sweep.ts` | Extracted from `patterns/sweep/route.ts`. `runArchivistPatternSweepForAccount(admin, accountId)`. |
| `apps/id/src/lib/archivist/run-deferred-sweep.ts` | Extracted from `patterns/sweep-deferred/route.ts`. `runArchivistDeferredSweepForAccount(admin, accountId, deps)`. |
| `apps/id/src/lib/archivist/run-calibrate.ts` | Extracted from `patterns/calibrate/route.ts`. `runArchivistCalibrateForAccount(admin, accountId, now)`. |
| `apps/id/src/app/api/archivist/clean/route.ts`, `patterns/sweep/route.ts`, `patterns/sweep-deferred/route.ts`, `patterns/calibrate/route.ts` | All four routes now delegate to their respective `runArchivist*ForAccount` helper. Response shapes are byte-identical to prior behavior. |

### Workflow + new internal route + cron switch

| Path | Purpose |
|---|---|
| `apps/id/src/lib/workflows/archivist-maintenance.ts` | The first `WorkflowDefinition`: four `target_type: "internal_operator"` tasks (`clean → sweep → sweep_deferred → calibrate`), each addressing `kinetiks_id.archivist` with a different `step` input derived from the dispatch context's `metadata.account_ids`. |
| `apps/id/src/app/api/internal/workflows/archivist-maintenance/run/route.ts` | Service-secret-auth Node route. POST `{ account_ids: string[] }` → builds `WorkflowDispatchContext` with a fresh `correlation_id` and `invoked_by: "cron:archivist-maintenance"`, calls `runWorkflow(archivistMaintenance, ctx, deps)`, returns `{ summary, archivist_cron_summary }`. The `archivist_cron_summary` block matches the legacy per-step counters the cron used to write into the `archivist_cron_run` Ledger entry, so any dashboards reading that detail keep working. |
| `supabase/functions/archivist-cron/index.ts` | Now POSTs once per account batch to the new workflow runner route. Reads `archivist_cron_summary` and writes the existing `archivist_cron_run` Ledger summary with the same field shape. Treats HTTP 207 (Multi-Status, partial success) the same as 200 for accounting. |

### Tests

| Path | Purpose |
|---|---|
| `packages/runtime/src/__tests__/workflow-dispatch.test.ts` | 9 unit tests: internal_operator happy path, unregistered operator, no-executor-wired, invalid_input, invalid_output, cross_app routing event insertion, multi-task upstream propagation, first-failure-stops, Ledger-failure tolerance. |
| `packages/tools/src/__tests__/validate.test.ts` (already existed) | Existing test `"fails when an operator references an unregistered tool"` covers the validation case the plan called for. No new test needed there. |
| `apps/id/src/lib/workflows/__tests__/archivist-maintenance.test.ts` | 3 integration tests: four steps fire in order with the right account batch into each helper; correct Ledger trail (4 dispatched + 4 completed); calibrate short-circuits outside the 00:00 UTC tick. |

---

## Communication rules preserved

Per the Three-Layer Agent System (CLAUDE.md):

- Operators in app A still cannot call operators in app B. The dispatcher's internal-operator branch only resolves operators inside the host app's executor map.
- Cross-app coordination still flows through Synapse Routing Events (`kinetiks_routing_events`). The new dispatcher's `cross_app` branch writes a row to that same table — it is a new addressing mode for an existing primitive, not a new communication path.
- Synapses still do not talk to other Synapses.

---

## Scope locks (decided before the build)

- **No new tables.** Workflows are typed code constants; observability is per-task Ledger entries.
- **No `kinetiks_programs`, `kinetiks_workflows`, `kinetiks_workflow_runs`, `kinetiks_tasks`.** Programs from `programs-spec.md` are out of scope. The Workflow primitive stands alone here.
- **No persistence, pause/resume, parallel tasks, conditional branches, approval checkpoints.** Additive when Implosion needs them.
- **The four existing `/api/archivist/*` routes stay intact** as the customer-direct path; the cron simply no longer drives them.
- **Authority resolution at task dispatch is NOT here.** Phase 4 layers it in; the `authority` stub in `packages/runtime/src/authority.ts` continues to fire from `run.invokeTool` for tool calls.
- **No suite-app operators.** Implosion's eight operators, Harvest's scout/composer/sender — out of scope until those apps come off pause.

---

## Definition of Done

- [x] Types compile workspace-wide (`pnpm type-check` clean across all 14 packages).
- [x] `packages/runtime` tests pass: 9 new workflow-dispatch tests + 9 existing runtime tests = 18/18.
- [x] `packages/tools` tests pass: 71/71 (existing cross-registry validation tests already cover operator → tool / pattern / action class references).
- [x] `apps/id` tests pass: 374/375 (1 pre-existing skipped GA4 smoke test). 3 new workflow integration tests included.
- [x] `apps/id` builds: `pnpm build` produces the new `/api/internal/workflows/archivist-maintenance/run` route alongside every existing route.
- [x] `pnpm functions:check` reports `OK: 14 functions in repo, all deployed, all scheduled.`
- [x] `bootOperatorRegistry()` wired into `apps/id/src/instrumentation-node.ts` between pattern and tool boots, so `assertRegistriesValid()` validates every operator reference at startup.
- [x] PII rules respected: the three new Ledger event types carry counts, ids, latency, and error classes only — never raw task input/output payloads or prompt text.
- [x] Migration `00049_workflow_task_ledger_event_types.sql` lands `NOT VALID` (Phase 4.5 closes the VALIDATE pass alongside the other deferred constraints).
- [x] `LedgerEventDetailMap` extended with typed entries matching the CHECK constraint exactly.
- [x] The phase-3 doc (this file) updated to reflect what actually shipped.
- [ ] **Manual production verification (post-deploy):** the next 6-hour `archivist-cron` tick produces 4 dispatched + 4 completed Ledger entries per batch sharing one `correlation_id`, plus the existing `archivist_cron_run` summary entry. Run-time spread across the four steps matches the old cron's spread within an order of magnitude.
- [ ] **Move this file to `docs/build-phases/built/`** as part of the merge that lands Phase 3.

The first two unchecked items are post-merge operational verifications, not gating for the PR.

---

## Verification commands

```sh
# Types + tests (used during build)
pnpm -w type-check
( cd packages/runtime && pnpm test )
( cd packages/tools && pnpm test )
( cd apps/id && pnpm test )

# Build the app (catches bundler issues in the new instrumentation wiring)
( cd apps/id && pnpm build )

# Edge Function drift check
pnpm functions:check

# Direct workflow invocation (local dev)
curl -X POST http://localhost:3000/api/internal/workflows/archivist-maintenance/run \
  -H "Authorization: Bearer $INTERNAL_SERVICE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "account_ids": ["<one-real-account-id>"] }'

# Ledger trail (run the SQL after the curl above completes)
select event_type, source_operator, detail->>'task_key', detail->>'correlation_id'
  from kinetiks_ledger
 where (detail->>'correlation_id') = '<correlation_id from the response>'
 order by created_at;
```

Expected after the SQL: 4 `workflow_task_dispatched` + 4 `workflow_task_completed` entries, all sharing one `correlation_id`, with `source_operator = "cron:archivist-maintenance"`. Add the existing `archivist_cron_run` summary entry once the cron actually drives the route in production.
