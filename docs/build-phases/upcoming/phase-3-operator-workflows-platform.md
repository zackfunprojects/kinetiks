# Phase 3: Operator Workflows Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Schema + runtime support for internal Operator Workflows inside an app, distinguishing cross-app dispatch (Synapse Routing Event) from internal dispatch (executing app's Operator registry). Build the platform layer in Kinetiks Core; validate it by registering Kinetiks Core's own Operators and converting one existing direct invocation (daily brief assembly) into a multi-step internal Workflow.

**Why now.** The addendum §3 gates Implosion. Under the apps/id-only scope, build the platform layer regardless and validate it against Kinetiks Core's own Operators (Cartographer, Archivist, Marcus, Oracle, Authority Agent stub). When Implosion eventually lands, it slots in as the second consumer with zero platform changes.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §3 (Operator Workflows)
- `packages/types/src/workflows.ts` (current `WorkflowTask` shape)
- `packages/types/src/synapse.ts` (current `KineticsAppManifest` shape)
- The Three-Layer communication rules in `CLAUDE.md` (Operators in app A cannot talk to Operators in app B)

---

## Schema changes

`WorkflowTask` gains two fields:

```ts
type WorkflowTask = /* existing fields */ & {
  target_type: 'cross_app' | 'internal_operator';
  target_app: string; // app key (e.g. 'kinetiks_id', 'im', 'hv')
};
```

`KineticsAppManifest` gains:

```ts
type KineticsAppManifest = /* existing fields */ & {
  operator_registry?: OperatorDescriptor[]; // present iff the app uses internal Workflows
};
```

`OperatorDescriptor` (new or extend existing):

```ts
type OperatorDescriptor = {
  key: string;            // e.g. 'marcus', 'archivist', 'cartographer'
  description: string;    // LLM-readable
  inputs_schema: ZodSchema;
  outputs_schema: ZodSchema;
  required_tools: string[];
  required_pattern_types: string[];
  allowed_action_classes: string[]; // referenced action classes must be in Action Class Registry (Phase 4)
};
```

## Files to change / create

| Path | Change |
|---|---|
| `packages/types/src/workflows.ts` | Add `target_type` and `target_app` to `WorkflowTask` |
| `packages/types/src/synapse.ts` | Extend `KineticsAppManifest` with optional `operator_registry` |
| `packages/types/src/operators.ts` | **New** (or extend existing): `OperatorDescriptor` type |
| `packages/runtime/src/workflow-dispatch.ts` | **New**. `dispatchTask(task, context)` resolves target_type, dispatches via Synapse Routing Event for `cross_app` or directly invokes the operator from the executing app's registry for `internal_operator`. Single entry point for both modes |
| `apps/id/src/lib/operators/registry-boot.ts` | **New**. Registers Kinetiks Core operators: Cartographer, Archivist, Marcus, Oracle, Authority Agent (Authority Agent is a declared-only stub here — Phase 4 replaces the stub with the real implementation) |
| `apps/id/src/lib/operators/cartographer.ts` etc. | Refactor existing operator code to register itself via the new descriptor pattern (if not already structured this way) |
| `apps/id/src/lib/workflows/daily-brief-assembly.ts` | **New** (or refactor existing). Multi-step internal Workflow that orchestrates: Marcus.gatherEvidence → Oracle.computeInsights → Marcus.composeBrief. Uses the new `dispatchTask` for each step |
| `supabase/migrations/0004X_workflow_task_target_columns.sql` | Migration adding `target_type` and `target_app` columns to whatever table stores WorkflowTasks (typically `kinetiks_workflow_tasks`); default existing rows to `'cross_app'` to preserve current behavior |
| `packages/runtime/src/workflow-dispatch.test.ts` | **New** unit tests: cross_app routes through Synapse Routing Event helper; internal_operator routes through registry; missing operator throws |
| `supabase/tests/workflow_task_target.sql` | **New** pgTAP. CHECK constraint on `target_type`; cross-tenant isolation on workflow tasks |

## Communication rules (preserved)

- Operators in app A cannot talk to Operators in app B. If an internal Workflow needs a cross-app capability, the task must be `target_type: 'cross_app'` and go through a Routing Event. The dispatcher enforces this — there is no path to invoke another app's operator directly.
- Synapses still do not talk to other Synapses.
- The new `dispatchTask` is one new addressing mode for the existing Workflow primitive; it is not a new communication path.

## Definition of Done

- `WorkflowTask` schema change applied; migration safe against existing rows.
- `KineticsAppManifest` extension compiles; existing apps without `operator_registry` are unaffected.
- `apps/id/src/lib/operators/registry-boot.ts` registers five Kinetiks Core operators at app boot.
- The daily-brief-assembly internal Workflow runs end-to-end in dev; each step dispatches via `target_type: 'internal_operator'`.
- A contract test verifies the cross-app dispatch path still works (using the existing Routing Event mechanism).
- `OperatorDescriptor` registration fails at boot if a referenced `action_class` is not in the Action Class Registry (Phase 4 will exercise this; for Phase 3, the Authority Agent stub's allowed_action_classes is empty array).
- Internal dispatch fails cleanly when an Operator key is not registered (no silent fallback to cross-app).
- pgTAP cross-tenant isolation test on workflow tasks.

## Verification

1. Boot apps/id in dev. Check logs for the operator registry registering five operators.
2. Trigger the daily-brief assembly Workflow (e.g. via the existing scheduled cron, or a manual API endpoint). Confirm three steps execute in sequence with `target_type: 'internal_operator'`.
3. Inspect `kinetiks_workflow_tasks` (or wherever tasks persist). Confirm `target_type` and `target_app` columns are populated correctly per task.
4. Try a Workflow that targets a cross-app capability (e.g. routing to a Harvest operator if one is mocked). Confirm the dispatcher uses the cross-app path.
5. Try to register an Operator with `allowed_action_classes: ['nonexistent.action_class']` — confirm registration fails at boot with a clear error.
6. Try to dispatch an internal task targeting an unregistered Operator key — confirm dispatch fails cleanly.

## Out of scope

- Implosion's eight Operators or any other suite-app internal Workflows. Implosion is paused.
- Workflow visualization in the Cortex UI. Workflows remain internal infrastructure for now.
- Cross-account or cross-Workflow nesting. Each Workflow scope is its own account/program/operator triangle.
- Authority resolution at task dispatch — Phase 4 layers that in.
