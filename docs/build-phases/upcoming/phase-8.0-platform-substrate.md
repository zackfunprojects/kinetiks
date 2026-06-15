# Phase 8.0 — Platform Data-Plane & Contracts (Execution Plan)

> Foundational phase of the Collaborative Workspace program (`collaborative-workspace-plan.md`).
> Builds every specced-but-missing platform prerequisite the collaborative workspace stands on. No collaborative UI beyond a reference-surface scaffold.
> **Sub-skill:** subagent-driven-development / executing-plans. Each slice = one branch commit, type-checked + tested before the next.

**Spec refs:** cross-app-command-router-spec §3.4/§7/§9; collaborative-workspace-spec §4.2/§5/§11/§12; spec-addendum-chat-ux §B.5.

**Branch:** `collab/phase-8.0-platform-substrate`.

---

## Grounding (actual current signatures)

`packages/synapse/src/command-types.ts` today:
- `SynapseCommand` = `{ id, source:'marcus', target_app, capability, type, parameters, context, timeout_ms, created_at }` — **no `depends_on`**.
- `CommandResponse` = `{ command_id, app_name, status, data, error?, approval_id?, duration_ms }` — **no panel signal**; `approval_id` is singular.
- `CommandProgress` = `{ command_id, app_name, step, progress(0-100), message }` — defined, **never emitted**.
- `CapabilityDefinition` = `{ name, type, description, parameters, examples, requires_approval, timeout_ms }` — **no `result_schema`**.

`apps/id/src/lib/marcus/command-dispatcher.ts`: `dispatchCommands()` → `Promise.allSettled`, parallel only, HTTP to `synapse-{target_app}` Edge Functions. No progress callback, no ordering.

`apps/id/src/app/api/marcus/command/route.ts`: parse → route → translate → dispatch → aggregate → **`apiSuccess` JSON** (not SSE). Writes `command_executed` Ledger entry.

`apps/id/src/app/api/marcus/chat/route.ts`: SSE contract emits `status / text / done / extraction / error` — **no `command_progress` / `command_result` / `panel_open`**.

Realtime: 4 `postgres_changes` subscribers, account-scoped, re-auth on reconnect (`AuthorityRealtimeRefresh.tsx` is canonical). No reusable hook, no broadcast/presence. `kinetiks_account_id()` helper (00084). Latest migration **00086**.

Type-home rule (root CLAUDE.md): cross-cutting **data** shapes → `@kinetiks/types` (append-only). The `CollaborativeSynapse` **handler interface** extends `SynapseCommandHandler` → stays in `packages/synapse`, importing data types from `@kinetiks/types`.

---

## Slices (commit boundaries)

### Slice 1 — Collaborative contract types (append-only, zero behavior change)
- [ ] `@kinetiks/types`: add `PresenceEvent`, `UIStateChange`, `AnnotationAnchor`, `Annotation`, `AnnotationKind`, `DelegationRegion`, `WorkspaceAction`, `ActiveTask`, `TempoMode`, `AppPanelOpen`, `EmbedTarget`. Export from the barrel.
- [ ] `packages/synapse/src/command-types.ts`: add `depends_on?: string[]` to `SynapseCommand`; `app_panel_open?: AppPanelOpen` to `CommandResponse`; `result_schema?: Record<string, unknown>` to `CapabilityDefinition`. (All optional → existing handlers unaffected.)
- [ ] `packages/synapse/src/collaborative.ts`: `CollaborativeSynapse extends SynapseCommandHandler` with `subscribeToUIState`, `handleUserPresence`, `getAnnotationAnchors`, `handleDelegation`, `getUndoStack`, `applyUndo`. Export from `packages/synapse` index.
- [ ] `pnpm -w type-check` clean. Commit: `feat(types): collaborative-workspace contract types + CollaborativeSynapse`.

### Slice 2 — `packages/collaborative` package skeleton
- [ ] New workspace pkg `@kinetiks/collaborative` (package.json `workspace:*`, tsconfig, index). Deps: `@kinetiks/types`, `@kinetiks/ui`, `@kinetiks/supabase`. **Zero app/fixture imports.**
- [ ] `CollaborativeProvider` (context = `CollaborativeContextValue` per spec §11.3) + hooks `useAgentPresence`, `useFieldAnnotations`, `useIsAgentFocused`, `useDelegateRegion`, `useUndoStack`, `useTempoMode`. Hooks are wired to no-ops/empty state in this slice (real Realtime wiring lands in 8.3+); the API surface is what matters.
- [ ] Build + type-check clean. Commit: `feat(collaborative): app-agnostic provider + hooks package`.

### Slice 3 — Realtime substrate (reusable hook + account-scoped publisher)
- [ ] `apps/id/src/lib/hooks/useRealtimeChannel.ts`: extract the canonical lifecycle (subscribe, `CHANNEL_ERROR/TIMED_OUT` → `getSession()` → `realtime.setAuth()`, cleanup via `removeChannel`). Accepts channel name + (postgres_changes config | broadcast handlers).
- [ ] `packages/supabase/src/realtime.ts`: `subscribeAccountScoped()` and `publishAccountScoped(accountId, channel, event, payload)` that **asserts the caller's `account_id` owns the channel before `.send()`** (D4 — broadcast/presence have no RLS). Channel-name builders `presenceChannel/annotationsChannel/workspaceChannel(account, thread)`.
- [ ] Unit test: `publishAccountScoped` rejects a foreign account; channel builders are correct.
- [ ] Type-check + test clean. Commit: `feat(realtime): reusable channel hook + account-scoped broadcast publisher`.

### Slice 4 — Command-progress streaming + panel signal + sequential dispatch
- [ ] `command-dispatcher.ts`: add an optional `onProgress(p: CommandProgress)` callback; thread it through dispatch. Implement **ordered dispatch** honoring `depends_on` (topological steps; parallel within a step; pass prior `CommandResponse.data` into dependents' `context`). Keep retry/timeout/backoff behavior.
- [ ] `command-aggregator.ts`: surface `app_panel_open` from any single-app action response into the aggregate; keep text aggregation.
- [ ] `apps/id/src/app/api/marcus/command/route.ts`: convert to an **SSE stream** emitting `command_progress` (per step) and a final `command_result` (with `app_panel_open` when present). Preserve the `command_executed` Ledger write; correlate by `command_id`.
- [ ] `apps/id/src/app/api/marcus/chat/route.ts`: extend the SSE contract doc + emitter with `command_progress`, `command_result`, `panel_open`. (Chat is where commands interleave with conversation.)
- [ ] Tests: progress emitted in order; 2-step `depends_on` plan runs sequentially with result hand-off; `panel_open` emitted when `app_panel_open` set.
- [ ] Type-check + test + `pnpm --filter @kinetiks/id build` clean. Commit: `feat(router): stream command progress + panel-open signal + sequential dispatch`.

### Slice 5 — Rich / action response components (chat-ux §B.5)
- [ ] `apps/id/src/components/chat/MessageBubble.tsx`: render a rich-component family — `ActionCard`, `AppCard`, `DataTable`, `MiniChart` (reuse `@kinetiks/ui` `sparkline`/`mini-bars`), `ProgressIndicator`, `ExpandableSection`. Action/App cards carry the **"Open"** affordance that emits a panel-open intent (consumed by the panel in 8.2).
- [ ] Wire `command_result.app_panel_open` and `command_progress` SSE events into the chat stream renderer (progress indicator while running; action card on completion).
- [ ] Loading/error/empty states; tokens only; light + dark.
- [ ] Type-check + build clean. Commit: `feat(chat): rich response + action/app cards with Open affordance`.

### Slice 6 — Schema (migrations 00087–00090) + state machine + pgTAP
- [ ] `00087_ledger_team_scope_id.sql`: `ALTER TABLE kinetiks_ledger ADD COLUMN team_scope_id text` (null default). Confirm no NOT-NULL assumptions.
- [ ] `00088_kinetiks_annotations.sql`, `00089_kinetiks_workspace_actions.sql`, `00090_kinetiks_active_tasks.sql`: columns per spec §6/§7/§8 + `team_scope_id`, RLS (read/write own account via `kinetiks_account_id()`), indexes `(account_id, thread_id)`, unique-partial-index one active task per thread `WHERE status IN ('active','paused')`, `ALTER PUBLICATION supabase_realtime ADD TABLE` for annotations + workspace_actions. Add `task_killed`, `intervention_undo`, `intervention_grab` to the ledger event-type check (extend `00062`/`00070` constraint **before** use).
- [ ] `packages/lib/src/state-machines.ts`: register `active_tasks` (`active↔paused`, `active→killed|completed` terminal). Postgres trigger backstop on `kinetiks_active_tasks` (pattern from `00050` authority grants). Three-layer enforcement.
- [ ] pgTAP in `supabase/tests/`: cross-tenant isolation (two accounts) on all three tables; unique-active-task; invalid state transitions denied at trigger + RLS; workspace-action ordering.
- [ ] `pnpm db:types` **(post-merge follow-up per the db-types-reads-prod rule — do NOT regen against prod inside this PR)**; commit the migration + tests now, type regen tracked as a follow-up.
- [ ] Commit: `feat(db): annotations + workspace_actions + active_tasks + ledger team_scope_id (00087-00090)`.

### Slice 7 — Reference collaborative surface scaffold
- [ ] `apps/id/src/app/embed/page.tsx` (+ `layout.tsx`, `loading.tsx`, `error.tsx`): reads `?entity=&mode=collaborative&thread=&account=`; when collaborative, wraps in `CollaborativeProvider`, hides shell nav. Minimal placeholder content (the minimal-but-representative surface is fleshed out in 8.2).
- [ ] API routes `apps/id/src/app/api/id/embed/{presence,annotations,undo,state}/route.ts`: validate `account_id` from JWT (`requireAuth`), scope by `thread_id`. Emissions labeled `source_app='kinetiks_fixtures'`, Ledger `is_fixture:true`.
- [ ] `postMessage` handshake stub for same-origin embedding (parent ↔ embed).
- [ ] Type-check + build clean. Commit: `feat(embed): reference collaborative surface scaffold + embed API routes`.

---

## Phase 8.0 Definition of Done
- Command pipeline streams `command_progress` → `command_result` → `panel_open` over SSE; a `depends_on` plan dispatches sequentially with result hand-off (tests green).
- `publishAccountScoped` rejects foreign accounts (test); reusable channel hook in place.
- `@kinetiks/collaborative` builds; `CollaborativeSynapse` + all data types append-only in the contract.
- New tables pass pgTAP cross-tenant + state-machine + ordering; `active_tasks` enforced at server-action + trigger + RLS.
- Reference surface renders behind `mode=collaborative`; embed API routes validate account + thread scope; all reference emissions labeled fixtures.
- `pnpm --filter @kinetiks/id build`, `pnpm -w type-check`, lint clean. Migrations + pgTAP committed together; `db:types` regen tracked as a post-merge follow-up.
- No `apps/dm` paths staged; no `git add -A`.
