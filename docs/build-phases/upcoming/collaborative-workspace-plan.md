# Phase 8 — Collaborative Workspace: Master Program Plan

> **Goal:** Deliver **100% of `docs/collaborative-workspace-spec.md`** — the split-panel, shared-surface, shared-presence collaborative workspace — as a production-grade experience on **both** the web app (`id.kinetiks.ai`) and the **Electron desktop app** (full webview model).
>
> **Source of truth:** `docs/collaborative-workspace-spec.md`. Supporting contracts: `docs/specs/cross-app-command-router-spec.md`, `docs/specs/approval-system-spec.md`, `docs/specs/spec-addendum-chat-ux.md`, `design/kinetiks-design-spec.md` §16, root `CLAUDE.md`.
>
> **Scope discipline:** Phasing is **build order for incremental verification, never scope reduction.** Every phase is a slice of the whole; the final phase completes the entire spec. No "Phase 2 / coming soon" deferral of specced capability.

---

## 0. Executive Summary

The collaborative workspace turns the Kinetiks shell from "chat + sidebar" into a **shared workspace where the user and their named system co-operate on live app surfaces in real time** — split panel, agent + user presence, inline annotations, tempo control, drag-to-delegate, shared undo, a task drawer with a kill switch, in-panel visual approvals, and a floating-bar visual language. On desktop, suite apps render as embedded webviews ("the app comes to you").

Two hard realities shape the program:

1. **Active build scope is `apps/id` only** (no `apps/hv`, `apps/dm`, …), but the spec embeds *suite apps*. **Resolution (confirmed):** apply the proven **substrate principle** — build a fixture-driven **reference collaborative surface inside `apps/id`** (`apps/id/src/app/embed`) that flows through the *same* Synapse/Realtime APIs real suite apps will use. `CollaborativeSynapse` and `packages/collaborative` stay **app-agnostic**. When real suite apps ship, they replace the reference surface **additively**; nothing branches on "is this the reference surface."

2. **Specced-but-missing prerequisites.** Several capabilities the spec assumes already exist do not: command-progress **streaming** (typed but never wired), a panel-activation **signal**, **sequential/dependency** multi-app dispatch, **rich/action response cards**, a Realtime **broadcast/presence substrate**, and a genuinely **production-grade desktop shell** (the current shell is a 200-LOC skeleton that even loads the wrong prod URL). These are built first, in two explicit **foundational phases** (8.0, 8.1), so the feature phases stand on solid ground.

**Single-player simplification (spec §17.5):** presence is *agent-vs-user on one machine*, not multi-user CRDT sync. Agent presence is driven server→client over a broadcast channel (from command progress + reference-surface fixture playback); user presence is local state fed back into agent reasoning. No multi-client conflict resolution is built. The Realtime architecture stays forward-compatible with multiplayer but we spend zero UX effort on it.

---

## 1. Confirmed Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Reference collaborative surface inside `apps/id`** stands in for suite apps, fixture-driven, labeled `source_app='kinetiks_fixtures'`, auto-archivable via the existing `/api/internal/fixtures/cleanup`. | Honors `apps/id`-only scope; mirrors the proven fixtures substrate; exercises the full machinery end-to-end. |
| D2 | **Deliver both web split-panel and desktop webview experiences in full.** Web mounts the reference surface as a **same-origin embed** (faithfully exercises the `/embed` + `postMessage` contract); desktop renders embedded **webviews** with a 3-webview LRU cache. | The spec defines desktop as the full experience and web as the adapted one. 100% of spec = both. |
| D3 | **`CollaborativeSynapse` + `packages/collaborative` are app-agnostic.** No suite-app or fixture knowledge in shared packages. Only the reference surface implementation lives in `apps/id`. | Real suite apps adopt the same contract later with zero platform changes. |
| D4 | **Presence/annotations/workspace channels are scoped `:{account_id}:{thread_id}` and every publish validates `account_id` server-side.** Supabase **broadcast/presence channels have no built-in RLS** — channel-name scoping is a convention, not enforcement. | Cross-account presence bleed is a critical bug (CLAUDE.md §Realtime). A `publishAccountScoped()` helper asserts ownership before send. |
| D5 | **Presence + undo-stack live state is broadcast (ephemeral); annotations + workspace actions + active tasks are persisted** (`postgres_changes` + RLS, write-before-publish). Kill signals are **Ledger entries** (`event_type='task_killed'`), not a new table. | Annotations have lifecycle (pin → Ledger, replies); undo needs causal ordering; presence is throwaway. Persistence follows the data's lifecycle. |
| D6 | **Signal-weight registry.** Kill (2×), undo (weak reject), grab (field-level penalty), non-intervention (boost) are added to a centralized `SIGNAL_WEIGHTS` registry feeding `confidence.ts` / `threshold-math.ts`, not ad-hoc multipliers. | The approval spec defines these weights; today only the 0.4/0.3/0.2/0.1 split exists. A registry keeps them auditable. |
| D7 | **Color mapping resolution.** Spec §16.6 names teal `#00CEC9` for "success"; the live token is `--kt-success` (`#3F7A5B`). **Use `--kt-success`** (teal was superseded per design-spec §14). All floating-bar elements reference `--kt-*` tokens only. | No hardcoded colors; the design spec / token system wins over the spec's aspirational hex. Flag in the design spec as a resolved note. |
| D8 | **Same-origin embed first, webview faithful second.** The web app embeds `id.kinetiks.ai/embed` (same origin → reliable cookie auth + `postMessage`); desktop embeds the same `/embed` route inside a `<webview>`/`BrowserView` with a hardened partition. | One reference surface serves both delivery paths; desktop adds the multi-app ecosystem + process isolation on top. |

---

## 2. Current-State Gap Map (grounded)

**Strong foundations that exist:**
- Command router with `SynapseCommand.target_app`, capability matching, parallel dispatch (`apps/id/src/lib/marcus/command-{router,translator,dispatcher,aggregator}.ts`).
- Approval system ~95% complete: `WEIGHTS` (0.4/0.3/0.2/0.1), `threshold-math.ts`, `learning-loop.ts`, `edit-analyzer.ts`, `deep_link` wired (`apps/id/src/lib/approvals/*`).
- UI primitives: `FloatingPill`, `Toast` (+ provider/hook), `ConfidenceRing`, `ProgressBar`, `Pill`, `StatusPill`, full token set incl. `--kt-dur-cursor` (`packages/ui/src/*`, `packages/ui/styles/kinetiks-tokens.css`).
- Realtime pattern (postgres_changes, account-scoped, re-auth on reconnect) and `kinetiks_account_id()` JWT helper (migration 00084). Latest migration: **00086**.
- Fixtures substrate (`apps/id/src/lib/fixtures/*`) flowing through `/api/synapse/patterns`.

**Specced-but-missing (built in 8.0 / 8.1):**

| Gap | Spec ref | Phase |
|-----|----------|-------|
| `CommandProgress` typed but never streamed (command route returns JSON, not SSE) | router §7 | 8.0 |
| No panel-activation signal in `CommandResponse`; `deep_link` opens a new tab | CWS §4.2/§9 | 8.0 |
| Sequential/dependency multi-app dispatch not implemented (parallel only) | router §3.4 | 8.0 |
| No rich/action response cards (aggregator is plain text); no "Open in app" affordance | chat-ux §B.5 | 8.0 |
| No reusable Realtime hook; no broadcast/presence channel pattern; broadcast has no RLS | CWS §5/§12 | 8.0 |
| `CollaborativeSynapse` interface + `packages/collaborative` do not exist | CWS §11 | 8.0 |
| No `kinetiks_annotations` / `kinetiks_workspace_actions` / `kinetiks_active_tasks`; `team_scope_id` missing on `kinetiks_ledger` | CWS §6/§7/§8 | 8.0 |
| No `/embed` route / reference surface | CWS §4.4/§11.2 | 8.0 |
| Desktop loads wrong prod URL (`kinetiks.ai` 404 → must be `id.kinetiks.ai`) | — | 8.1 |
| Auto-update unwired (dep present, no `publish` feed); no protocol/deep-link; no single-instance lock | — | 8.1 |
| No Sentry/crash reporting in desktop; no code signing/notarization/distribution | CLAUDE.md DoD | 8.1 |
| No native menu / keyboard accelerators (Cmd+1/2/3, Cmd+K, …) | chat-ux §B.4 | 8.1 |
| No `<webview>`/`BrowserView`, no IPC bridge beyond notifications, no LRU | CWS §3.1/§4.4/§14.3 | 8.1 (substrate) / 8.7 (multi-app) |
| Kill 2× + intervention signals (grab/undo/non-intervention) not in `confidence.ts` | CWS §8.3/§9.3 | 8.6 / 8.5 |

---

## 3. New Surface Inventory

**New packages**
- `packages/collaborative/` — app-agnostic React context + hooks + Realtime subscribers (`CollaborativeProvider`, `useAgentPresence`, `useFieldAnnotations`, `useIsAgentFocused`, `useDelegateRegion`, `useUndoStack`, `useTempoMode`).

**New shared types** (`@kinetiks/types`, append-only): `PresenceEvent`, `UIStateChange`, `AnnotationAnchor`, `Annotation`, `DelegationRegion`, `WorkspaceAction`, `ActiveTask`, `TempoMode`, `CollaborativeSynapse` (extends `SynapseCommandHandler`), and the desktop IPC contract additions to `packages/types/src/desktop.ts`.

**New UI primitives** (`packages/ui`): `AgentCursor`, `AnnotationChip`, `UndoTimeline`, `TaskDrawer` (floating bar), agent-action toast family (success+Undo / warning / error+Retry / info), `ThreadSwitchWarning`, `BulkActionBar`, `TempoControl`. A shared `.kt-floating-bar` base class in `primitives.css`.

**New `apps/id` surfaces**: `src/app/embed/page.tsx` (reference surface) + its API routes (`/api/id/embed/{presence,annotations,undo,state}`); `AppPanel` + responsive three-column `ChatLayout`; presence/annotation/undo client wiring.

**New migrations** (00087+): `team_scope_id` on `kinetiks_ledger`; `kinetiks_annotations`; `kinetiks_workspace_actions`; `kinetiks_active_tasks` (+ RLS, state machine, indexes, pgTAP); `task_killed` Ledger event type; ALTER PUBLICATION for the persisted tables.

**Desktop**: production hardening (auto-update, protocol handler, Sentry, signing, menu/accelerators, typed IPC), then the webview manager + LRU + IPC relay.

---

## 4. The Phases

> Each phase: **Goal → Spec refs → Key files → Tasks → Verification/DoD.** Phases 8.0 and 8.1 are the **foundational** phases (specced-but-missing prerequisites). 8.2–8.5 map 1:1 to the spec's §13 phases (4a–4d). 8.6–8.8 complete the task drawer, approval integration, floating-bar system, the full desktop webview experience, and hardening.

### Phase 8.0 — Platform Data-Plane & Contracts (FOUNDATIONAL)

**Goal:** Build every specced-but-missing platform prerequisite the collaborative workspace stands on, with no UI yet beyond a reference-surface scaffold. After 8.0, a dispatched command streams progress, can signal "open this panel," can run sequential multi-app plans, returns structured results, and the Realtime/contract/schema substrate exists.

**Spec refs:** router §3.4/§7/§9; CWS §4.2/§5/§11/§12; chat-ux §B.5.

**Key files:**
- `packages/synapse/src/command-types.ts` (CommandProgress 64–70, SynapseCommand 37), `command-handler.ts`, `create-synapse.ts:237`.
- `apps/id/src/lib/marcus/command-{dispatcher,translator,aggregator}.ts`, `apps/id/src/app/api/marcus/{command,chat}/route.ts`.
- `packages/supabase/src/client.ts` (+ new `realtime.ts` helpers).
- `packages/types/src/*` (collaborative types), new `packages/collaborative/`.
- `supabase/migrations/00087+`, `packages/lib/src/state-machines.ts`.
- `apps/id/src/lib/fixtures/*` (study), new `apps/id/src/app/embed/`.

**Tasks:**
1. **Command-progress streaming.** Wire `CommandProgress` through `command-dispatcher` via a progress callback; emit over the Realtime command channel and surface as SSE. Extend the Chat SSE contract (`chat/route.ts`) with `command_progress` and `command_result` events. Convert `/api/marcus/command` to stream.
2. **Panel-activation signal.** Add `app_panel_open?: { app_name; entity_id?; deep_link?; mode: 'collaborative' }` to `CommandResponse`; emit a `panel_open` SSE event on aggregation. Define the `deep_link` → embed-URL parser (`{origin}/embed?entity=&mode=collaborative&thread=&account=`).
3. **Sequential/dependency dispatch.** Add `depends_on: string[]` to `SynapseCommand`; implement an ordered queue in the dispatcher honoring the translator's `DispatchPlan`; pass prior command results into dependent commands' `context`. Keep parallel-within-step.
4. **Structured results + rich/action cards.** Add `result_schema` to `CapabilityDefinition`; validate `CommandResponse.data`; build the chat-ux §B.5 component family in `MessageBubble` (action card, app card, data table, mini-chart via existing `sparkline`/`mini-bars`, progress indicator, expandable). The action/app cards carry the **"Open"** affordance that mounts the panel.
5. **Realtime substrate.** Extract `apps/id/src/lib/hooks/useRealtimeChannel.ts` (lifecycle, error recovery, re-auth — from `AuthorityRealtimeRefresh.tsx`). Add `packages/supabase/src/realtime.ts`: `subscribeAccountScoped()` + `publishAccountScoped(accountId, channel, event)` that **asserts account ownership before send** (D4). Define the three channels (`presence:`, `annotations:`, `workspace:`).
6. **Collaborative contract + package.** Add `CollaborativeSynapse` + all collaborative types to `@kinetiks/types`/`packages/synapse` (append-only). Scaffold `packages/collaborative/` (provider + hooks per CWS §11.3) consuming `@kinetiks/ui` only, zero app-specific imports.
7. **Schema (migrations 00087–00090).** `team_scope_id` on `kinetiks_ledger`; create `kinetiks_annotations`, `kinetiks_workspace_actions`, `kinetiks_active_tasks` (hybrid where useful, `team_scope_id` on each, RLS, indexes on `(account_id, thread_id)`, unique-partial-index one active task per thread). Register `active_tasks` in `state-machines.ts` (`active↔paused`, `active→killed|completed` terminal). pgTAP cross-tenant + state-machine + undo-ordering suites. `task_killed` added to `00062` event-type check. `pnpm db:types`.
8. **Reference surface scaffold.** `apps/id/src/app/embed/page.tsx` behind `mode=collaborative`, wrapped in `CollaborativeProvider`, hiding shell nav; minimal placeholder (grows in 8.2+). API routes `/api/id/embed/{presence,annotations,undo,state}` (JWT account validation, thread scoping). All emissions labeled `source_app='kinetiks_fixtures'`, Ledger `is_fixture:true`.

**Verification/DoD:** A scripted command streams `command_progress` → `command_result` → `panel_open` over SSE (unit + route tests). A 2-step dependent plan dispatches in order with result hand-off. `publishAccountScoped` rejects a foreign `account_id` (test). All new tables pass pgTAP cross-tenant. `pnpm build` + `pnpm type-check` clean; types committed with migrations.

---

### Phase 8.1 — Production Desktop Foundations (FOUNDATIONAL)

**Goal:** Turn the 200-LOC Electron skeleton into a **production-grade, distributable, observable, deep-linkable desktop app** — the foundation the webview collaborative experience (8.7) requires. No collaborative UI yet; this is the shell, security, distribution, and IPC substrate.

**Spec refs:** CWS §3.1/§4.4/§14.3; chat-ux §B.4; CLAUDE.md DoD (Sentry on desktop, env discipline).

**Key files:** `apps/desktop/src/main/index.ts` (fix `:8` URL bug), `tray.ts`, `notifications.ts`, `window-state.ts`, `src/preload/index.ts`, `electron-builder.yml`, `package.json`; `packages/types/src/desktop.ts`; new `src/main/{updater,protocol,menu,sentry,session,ipc}.ts`, `src/main/webview/`.

**Tasks:**
1. **Fix prod origin (bug).** `APP_URL` prod → `https://id.kinetiks.ai` (currently `kinetiks.ai`, which 404s). Make origin env-driven; keep the same-origin navigation guard.
2. **Single-instance lock + custom protocol.** `app.requestSingleInstanceLock()`; register `kinetiks://` (`setAsDefaultProtocolClient`); route `kinetiks://approval/{id}`, `kinetiks://thread/{id}`, `kinetiks://embed/{app}/{entity}` to in-app navigation (web + second-instance + macOS `open-url`).
3. **Auto-update.** Wire `electron-updater` (check on launch + interval); add a `publish` feed to `electron-builder.yml`; surface the §16.2 "app update available" info toast → restart-to-update flow via IPC.
4. **Crash reporting + observability.** Sentry in main, preload, and renderer-bridge with the canonical tag/user/extra shape (`app:'desktop'`); PostHog desktop lifecycle events. No PII.
5. **Code signing + notarization + distribution.** macOS notarize (`afterSign`/`notarize`), Windows signing, hardened runtime/entitlements; document required secrets in `docs/operational/env-vars.md`; CI/build notes.
6. **Native menu + keyboard accelerators.** Application `Menu` with standard roles + Kinetiks items; wire chat-ux §B.4 accelerators (Cmd+1/2/3 tab switch, Cmd+K palette, Cmd+N new thread, Cmd+Shift+A approvals, Cmd+, settings) → IPC → renderer.
7. **Auth/session robustness.** Shared `.kinetiks.ai` cookie sign-in inside the window; detect dead refresh token → explicit re-sign-in (not silent logout); persist partition; expose session-expiry signal to the renderer for Realtime re-auth.
8. **Typed secure IPC bridge.** Expand the preload `KinetiksDesktopBridge` (typed in `@kinetiks/types`) with channels for deep-link routing, menu/accelerator events, update flow, and *placeholders* for presence/annotation/undo/task relay (filled in 8.7). `contextIsolation` stays on; validate every IPC payload.
9. **Custom titlebar chrome.** Implement the planned "Phase 2 titlebar": traffic-light-aware draggable region, integrates with the three-tab shell; respects vibrancy on macOS.
10. **Webview security substrate.** Enable `<webview>`/`BrowserView` with a hardened partition (`persist:collaborative`), a dedicated webview preload mirroring the main bridge, permission + CSP + `setWindowOpenHandler` handlers, and navigation lock to Kinetiks origins. (Multi-app management + LRU is 8.7; this is the secured substrate.)

**Verification/DoD:** Packaged build launches, loads `id.kinetiks.ai`, auto-update check succeeds against the feed, `kinetiks://approval/{id}` opens the app to that approval, a forced main-process throw reaches Sentry with `app:'desktop'`, all accelerators fire, signed+notarized artifact installs clean on macOS + Windows. `docs/operational/env-vars.md` updated.

---

### Phase 8.2 — Basic Split Panel (spec §13.1 / 4a)

**Goal:** The Chat tab splits into `[threads | chat | app panel]`; the panel mounts the reference surface via the embed contract, loaded with an entity, with full activation/deactivation rules and responsive behavior. No presence yet.

**Spec refs:** CWS §4 (all), §14.2.

**Key files:** `apps/id/src/components/chat/{ChatLayout,ChatArea}.tsx`, new `AppPanel.tsx`; `apps/id/src/components/approvals/ReviewApprovalCard.tsx` (deep_link `:55-59`), `ApprovalPanel.tsx`; `apps/id/src/components/app-shell/AppShell.tsx`; `apps/id/src/app/embed/page.tsx` (build out the **minimal-but-representative** surface: a few labeled fields + a step list + a couple of selectable entities).

**Tasks:**
1. `AppPanel` component: same-origin iframe to `/embed?entity=&mode=collaborative&thread=&account=`; `postMessage` handshake; skeleton UI; entity prefetch + preloading (§14.2, <2s interactive).
2. Three-column responsive `ChatLayout`: desktop split (chat flex / panel ~45%); <1280px → panel becomes a toggleable slide-over (§3.2). Resizable divider.
3. **Activation** (§4.2): command dispatch (`panel_open` SSE), explicit user request ("show me Harvest"), approval `deep_link` (mount panel instead of new tab — replace the `target=_blank` path), chat action card "Open".
4. **Deactivation + thread-scope** (§4.3/§17.1): close button, "close X", task-complete auto-close, tab switch, and **reset on thread switch** (`useEffect` on `currentThreadId`; sync with URL pushState/popstate).
5. Breadcrumb bar scaffold for future multi-app orchestration (single-app now).
6. Build out the reference surface (D-fidelity: minimal but representative) so the panel renders a believable editable entity.

**Verification/DoD:** dispatching a command opens the panel with the entity; clicking an approval `deep_link` mounts it in-panel; switching threads resets the panel; slide-over works <1280px; panel interactive <2s. Loading/error/empty states. Tokens only. Playwright happy-path for open/close/thread-reset.

---

### Phase 8.3 — Presence Layer (spec §13.2 / 4b)

**Goal:** Agent and user are visible co-participants on the surface. Agent cursor, typing indicator, uncertainty pulse, selection highlight; user presence events; click-to-intervene.

**Spec refs:** CWS §5, §14.1.

**Key files:** new `packages/ui/src/agent-cursor.tsx`; `packages/collaborative/*` (presence hooks); `apps/id/src/app/embed/*`; `apps/id/src/lib/hooks/useRealtimeChannel.ts`.

**Tasks:**
1. `AgentCursor`: labeled dot (system name + brand color), smooth `transform` transition, uncertainty **pulse** keyframes, selection highlight overlay, **typing indicator** (char-by-char accelerated). Add `--kt-dur-animation` token for cursor movement (distinct from `--kt-dur-cursor` blink).
2. `presence:{account}:{thread}` broadcast channel via `useRealtimeChannel` + `publishAccountScoped`. **Agent presence** driven by command progress + reference-surface fixture playback (server→client). 100–150ms latency interpolation (§14.1).
3. **User presence** (§5.2): embed surface emits `focus/blur/select/scroll/hover` via `postMessage` → presence channel; debounced/sampled (high-frequency control).
4. **Click-to-intervene** (§7.2 inverse): user clicks a field the agent is touching → agent yields immediately, moves on; no dialog.
5. Cross-account isolation: a foreign `account_id` cannot subscribe to or publish on the channel (test).

**Verification/DoD:** cursor animates smoothly at 60fps; typing renders char-by-char; uncertainty pulse fires where the agent pauses; user click yields the field; presence renders <150ms with interpolation; **cross-account presence isolation test passes** (the must-never-break one). Reduced-motion respected.

---

### Phase 8.4 — Inline Annotations (spec §13.3 / 4c)

**Goal:** The system explains reasoning directly on the surface — decision notes, data references, skip notes, suggestions — as anchored chips, with dismiss/pin/collapse/reply and density control.

**Spec refs:** CWS §6.

**Key files:** new `packages/ui/src/annotation-chip.tsx`; `packages/collaborative/*` (`useFieldAnnotations`); `apps/id/src/app/api/id/embed/annotations/route.ts`; `kinetiks_annotations` (8.0); `apps/id/src/lib/ai/prompts/*` (annotation generation, Haiku via router).

**Tasks:**
1. `AnnotationChip`: anchored (`above/below/inline/tooltip`), one-line→expand, dismiss X, pin, reply. `getAnnotationAnchors()` per current view.
2. Persistence + live: write to `kinetiks_annotations` then publish on `annotations:{account}:{thread}` (write-before-publish, D5). Replies = threaded micro-conversation on the field.
3. **Generation** (§6.1): decision/data-reference/skip/suggestion notes produced during agent work (Haiku via `@kinetiks/ai/router`; never raw PII; pattern/data references cite Cortex).
4. **Density control** (§6.3): tie to autonomy/confidence level (more in Human-Drive/low-confidence, fewer in Autopilot/high), learn from dismissals, always annotate high-stakes decisions.
5. **Pin → Learning Ledger** (§6.2): pinned annotations persist into entity context with a Ledger entry.

**Verification/DoD:** annotations anchor correctly, dismiss/pin/collapse/reply work, pinned ones write to the Ledger, density shifts with autonomy and dismissal history, every generation logs an `ai_calls` row, no PII in prompts. pgTAP cross-tenant on `kinetiks_annotations`.

---

### Phase 8.5 — Full Collaboration (spec §13.4 / 4d)

**Goal:** Tempo control, drag-to-delegate, shared undo stack, implicit trust signals into the confidence model, and multi-app panel transitions.

**Spec refs:** CWS §7 (all), §9.3, §10.4.

**Key files:** new `packages/ui/src/{undo-timeline,tempo-control}.tsx`; `packages/collaborative/*` (`useUndoStack`, `useDelegateRegion`, `useTempoMode`); `kinetiks_workspace_actions` (8.0); `apps/id/src/lib/approvals/{confidence,threshold-math,learning-loop}.ts`; `apps/id/src/lib/marcus/command-dispatcher.ts` (multi-app transitions).

**Tasks:**
1. **Tempo control** (§7.1): header control — System Leads / User Leads / Pair Mode; contested-field negotiation in Pair ("I was going to X — want me to, or you?").
2. **Drag-to-delegate** (§7.2): select region → drag to agent presence (or shortcut) → `handleDelegation(region)`; agent picks up exactly those fields. Inverse yield already in 8.3.
3. **Shared undo stack** (§7.3): `kinetiks_workspace_actions` with causal `sequence_index`; bidirectional `WorkspaceAction`; `UndoTimeline` (who-did-what); shortcuts Cmd+Z / Cmd+Shift+Z (agent-only) / Cmd+Alt+Z (timeline); `workspace:{account}:{thread}` channel.
4. **Implicit trust signals → confidence** (§9.3, D6): grab (field-level penalty), edit (training, reuse `edit-analyzer`), undo (weak reject), non-intervention (boost). Add `SIGNAL_WEIGHTS` registry to `confidence.ts`/`threshold-math.ts`; route signals through `learning-loop.processApprovalDecision`; Ledger `event_type='intervention_undo'|'intervention_grab'`.
5. **Multi-app transitions** (§10.4): sequential breadcrumb (`[DM] > [Harvest] > [Litmus]`), click any step to view; **side-by-side** "Show both" on wide desktop viewports.

**Verification/DoD:** all three tempo modes behave per spec; drag-to-delegate hands off exactly the selected region; undo is bidirectional and participant-filterable with correct shortcuts; intervention signals move the confidence threshold per the registry (unit tests incl. property tests on `threshold-math`); multi-app breadcrumb + side-by-side render. pgTAP on `kinetiks_workspace_actions` incl. ordering.

---

### Phase 8.6 — Task Drawer, Approval Integration & Floating-Bar System (spec §8, §9, §16)

**Goal:** The task drawer with kill switch, in-panel visual approvals with trust-through-tempo, and the complete §16 floating-bar visual language.

**Spec refs:** CWS §8 (all), §9 (all), §16 (all).

**Key files:** new `packages/ui/src/{task-drawer,thread-switch-warning,bulk-action-bar}.tsx` + agent-action toast variants extending `toast.tsx`; `.kt-floating-bar` in `packages/ui/styles/primitives.css`; `apps/id/src/lib/approvals/*`; `kinetiks_active_tasks` (8.0); `apps/id/src/components/approvals/*` (in-panel overlay).

**Tasks:**
1. **Task drawer** (§8, §16.1): floating pill (collapsed: name + step + progress + kill; expanded: multi-step plan §8.4, elapsed time, step controls). Bound to `kinetiks_active_tasks` + command progress.
2. **Kill Task flow** (§8.3): stop current action, revert via undo stack, "What went wrong?" prompt (quick reasons + free text), log `task_killed` Ledger entry at **2× rejection weight** (via `SIGNAL_WEIGHTS`), trust contraction, chat acknowledgement. Kill-whole vs skip-step for orchestrations.
3. **Visual approval** (§9.1): in-panel Approve/Edit/Reject overlay bar; edit-in-place feeds `edit-analyzer`; reject reason → learning signal.
4. **Trust-through-tempo** (§9.2): annotation density + agent speed scale with confidence; auto-approved work shows a retrospective view (no panel; sidebar notice → "Review" opens retrospective).
5. **Floating-bar system** (§16): agent-action toasts (success+Undo / warning-uncertainty / error+Retry / info+CTA), thread-switch warning (Stay/Leave), bulk-action bar (selection count + actions, agent-triggerable). Enforce §16.5 anatomy, §16.6 color mapping (D7), dismiss patterns, red-text destructive, dark-filled primary.

**Verification/DoD:** kill reverts changes + logs a 2× signal + contracts trust (state-machine test); in-panel approve/edit/reject works and feeds learning; auto-approve retrospective renders; every floating element matches §16 in light + dark (screenshots); `active_tasks` transitions enforced at server-action + trigger + RLS. Ledger entries fire with correct weights.

---

### Phase 8.7 — Desktop Multi-App Webview Experience (spec §3.1, §4.4, §10, §14.3)

**Goal:** On desktop, apps render as embedded webviews with a 3-webview LRU cache and full IPC relay of presence/annotations/undo/task-drawer — "the app comes to you," including multi-app orchestration panels.

**Spec refs:** CWS §3.1, §4.4, §10, §14.3.

**Key files:** `apps/desktop/src/main/webview/*` (manager, LRU), `src/main/ipc.ts`, `src/preload/*`; the 8.2–8.6 collaborative components rendered inside webviews; `apps/id` panel adapts iframe↔webview transport.

**Tasks:**
1. **Webview manager + LRU** (§14.3): mount embedded apps as `<webview>`/`BrowserView`; cache ≤3, LRU eviction, active always live, others suspended; warm session cookie reuse.
2. **IPC relay**: main ↔ webview ↔ renderer bridge for presence/annotation/undo/task events + drag-to-delegate across process boundaries; UUID-tracked instances; sample/debounce high-frequency presence.
3. **Transport abstraction**: the `AppPanel` + `CollaborativeProvider` speak one interface; web uses same-origin `postMessage`, desktop uses webview IPC — collaborative components unchanged.
4. **Multi-app panels on desktop** (§10.4): sequential transitions + side-by-side webviews; breadcrumb drives webview swap with LRU.
5. **Graceful degradation**: non-collaborative or narrow contexts fall back to the web slide-over.

**Verification/DoD:** desktop opens the reference surface in a webview; ≤3 cached with LRU eviction (memory check); presence/annotations/undo round-trip over IPC at <150ms; multi-app side-by-side works; session cookie shared; security partition + permission handlers verified.

---

### Phase 8.8 — Hardening, Performance & E2E (spec §14 + Program DoD)

**Goal:** Prove the whole system against the spec's performance constraints, cross-account isolation, observability, and docs.

**Spec refs:** CWS §14; CLAUDE.md DoD.

**Tasks:**
1. **Playwright E2E**: full collaborative flows (open panel → presence → annotate → delegate → undo → kill → approve). **The cross-account presence/annotation isolation test is the one that must never break.**
2. **Performance budgets** (§14): presence <100ms (interp ≤150ms), panel interactive <2s, memory ≤3 webviews. Add perf assertions.
3. **pgTAP**: cross-tenant on all new tables + Realtime channel boundary subscription tests.
4. **Observability**: canonical Sentry shape on every error path (web + desktop + Edge); PostHog product events per spec; Ledger entries with `grant_id`/`pattern_id` where applicable; `ai_calls` on every annotation/judgement call.
5. **Docs**: update `CLAUDE.md` (collaborative RLS rules, `team_scope_id`, kill-signal Ledger shape, the `CollaborativeSynapse` contract for future suite apps), `design/kinetiks-design-spec.md` (§16 resolved color note D7), `docs/platform-contract.md` (`CollaborativeSynapse`), `docs/operational/env-vars.md`.

**Verification/DoD:** all E2E green; perf budgets met; pgTAP cross-tenant passes; production build green per `pnpm health`; spec re-read and every §1–§17 capability checked off.

---

## 5. Cross-Cutting Requirements (every phase)

- **Security:** Channel names are conventions, not RLS — `publishAccountScoped` validates `account_id` on every broadcast/presence send (D4). Persisted tables get RLS in the same migration, scoped by `kinetiks_account_id()`. `team_scope_id` null in v1 on all new tables. No PII in prompts/logs. Service-role use justified in PR.
- **State machines** (CLAUDE.md §State machines): `active_tasks` (and any status entity) enforced at server-action `canTransition()` + Postgres trigger + RLS. Terminal states irreversible at all three layers.
- **Design tokens:** every value references a `--kt-*` token; new tokens added to `kinetiks-tokens.css` first. `.kt-floating-bar` base for all floating elements. Light + dark intentional; `prefers-reduced-motion` respected.
- **AI:** all calls via `@kinetiks/ai/router` (`ai_calls` row each); annotation generation = Haiku; persona/anti-sycophancy rules intact. Marcus never claims an in-panel action happened before it's emitted + approved/covered.
- **Observability:** canonical `Sentry.captureException` shape with `app` tag; ids-only `extra`; no `console.log` in committed code.
- **Fixtures honesty:** every reference-surface emission `source_app='kinetiks_fixtures'`, Ledger `is_fixture:true`, "fixture" tag in UI; `/api/internal/fixtures/cleanup` archives them.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Cross-account presence/annotation leak (no RLS on broadcast) | `publishAccountScoped` ownership assert; pgTAP + Playwright isolation tests; channel scoping `:{account}:{thread}`. |
| Reference-surface scope creep into a real mock app | Hard cap: minimal-but-representative (a few fields + step list); it's a visualization stub, not an app (D1). |
| Presence latency / cursor jump on fixture data | Real-time accelerated fixture emission or pre-recorded playback; 100–150ms interpolation. |
| Desktop webview IPC complexity (race conditions, process boundaries) | Production substrate first (8.1), transport abstraction (8.7); UUID-tracked instances; debounced presence. |
| Pattern-type collision when real Harvest lands | Namespace/version fixture types; cleanup endpoint archives gracefully (existing fixture rule). |
| `instrumentation.ts` Edge bundling (Lesson 9) | Keep Node-only collaborative wiring in `instrumentation-node.ts`; no Node imports reachable from the Edge shim. |
| Signal-weight ad-hoc proliferation | Centralized `SIGNAL_WEIGHTS` registry (D6); property tests on `threshold-math`. |
| Git ↔ deploy drift on schema/Edge/desktop (Lessons 8/10) | `pnpm health` Step 6 parity gate; migrations + types + functions in one PR; desktop publish documented. |

---

## 7. Sequencing & Dependencies

```
8.0 Platform Data-Plane & Contracts ──┐
                                       ├─→ 8.2 Split Panel ─→ 8.3 Presence ─→ 8.4 Annotations ─→ 8.5 Full Collab ─→ 8.6 Task Drawer/Approval/§16 ─┐
8.1 Production Desktop Foundations ────┘                                                                                                          ├─→ 8.7 Desktop Webview ─→ 8.8 Hardening/E2E
```

- **8.0 and 8.1 are parallelizable** (data-plane vs desktop shell) and both gate the feature phases.
- 8.2→8.6 are strictly sequential (each builds on the prior surface).
- 8.7 needs 8.1 (desktop shell) **and** 8.2–8.6 (collaborative components to relay).
- 8.8 closes the program.

Each phase ships as its own branch + PR (≤~500 real lines where feasible; split if larger), opened draft once a meaningful slice exists, with screenshots/Loom for UI. Each phase gets a dedicated `phase-8.x-*.md` implementation plan in `docs/build-phases/upcoming/` when it starts (subagent-driven-development), then moves to `built/` on completion.

---

## 8. Program Definition of Done

100% of `docs/collaborative-workspace-spec.md` §1–§17 implemented and verified: split panel (web + desktop), presence layer, inline annotations, all three collaboration modes, drag-to-delegate, shared undo, task drawer + kill switch (2× signal), in-panel visual approval, intervention-as-trust-signal, the full §16 floating-bar visual language, multi-app orchestration panels, the desktop webview model with LRU — all on a production-grade, signed, auto-updating, observable desktop app and a responsive web app. Cross-account isolation proven. Performance budgets met. CLAUDE.md DoD satisfied for every phase.
