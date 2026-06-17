# Phase 8.8 — Hardening, Performance, Cross-Account Isolation, Observability & E2E (Execution Plan)

> **FINAL phase of the collaborative-workspace program.** Proves the whole §1–§17
> system against the spec's performance constraints, cross-account isolation,
> observability, and docs — and stands up the Playwright E2E layer the program
> (and the root DoD) has been waiting for. Also absorbs the runtime-only DoD items
> deferred from 8.7.
> **Branch:** `collab/phase-8.8-hardening-e2e`.

**Spec refs:** `docs/collaborative-workspace-spec.md` §14 (Performance Constraints),
§11 (Synapse Extensions / `CollaborativeSynapse`), §12 (Realtime Channels), §17
(Resolved Decisions); the program plan §8 (Program Definition of Done).
**Master plan:** `docs/build-phases/upcoming/collaborative-workspace-plan.md` Phase 8.8.

---

## Grounding (what 8.0–8.7 already shipped — do not rebuild)

- **DB substrate (migrations 00087–00090):** `kinetiks_ledger` gained
  `team_scope_id` + three collaborative event types (`task_killed`,
  `intervention_undo`, `intervention_grab`) in **00087**; `kinetiks_annotations`
  (**00088**), `kinetiks_workspace_actions` (**00089**), `kinetiks_active_tasks`
  (**00090**) — each with read-only RLS (`account_id = kinetiks_account_id()`),
  service-role-only writes, `team_scope_id` placeholder, source-app labels, and —
  for `active_tasks` — a lifecycle-guard trigger (`active↔paused`,
  `→killed|completed` terminal, auto-stamps `ended_at`) + a one-active-task-per-thread
  partial unique index. Latest migration on `main`: **00090**.
- **pgTAP (existing):** `annotations_cross_tenant.sql` (9), `workspace_actions_cross_tenant.sql`
  (7, incl. the `sequence_index` UNIQUE), `active_tasks_cross_tenant.sql` (6),
  `active_tasks_state_machine.sql` (8). Cross-tenant isolation is covered on all
  three tables; gaps are channel-boundary / Realtime-Authorization, the ledger
  collaborative event-type acceptance, `kill_reason_code` CHECK, jsonb-array
  CHECKs, and the `annotation_id` FK `ON DELETE SET NULL`.
- **Realtime substrate:** `packages/supabase/src/realtime.ts` —
  `presence|annotations|workspace:{account}:{thread}` channel builders,
  `channelAccountId()` parser, `AccountScopeError`, and `publishAccountScoped()`
  (the **D4 send-side guard** — refuses a foreign `account_id` before send).
  `apps/id/src/lib/hooks/useRealtimeChannel.ts` (reusable subscription, re-auth on
  `CHANNEL_ERROR`/`TIMED_OUT` via `realtime.setAuth`). The presence/workspace
  broadcast channels are **public** (`broadcast: { self: true }`, not `private`),
  so RLS on `realtime.messages` does not yet apply to them.
- **Transport + packages:** `packages/collaborative` — `CollaborativeTransport`,
  `RealtimePresenceTransport`, `CollaborativeProvider`, `frame-cache.ts` (≤3 LRU,
  pinning), `panel-bridge.ts` (`PanelMessage`/`PanelBridge`, postMessage + webview
  IPC, origin/source validation). Unit tests exist for frame-cache + panel-bridge.
- **Reference surface:** `apps/id/src/app/embed/*` + `apps/id/src/components/embed/*`
  (`EmbedSurface`, `PresenceSurface`, annotations/undo/task/approval/intervention),
  fixture-driven (`source_app='kinetiks_fixtures'`, no live AI calls — annotations
  are static fixture content today). Embed API routes under
  `apps/id/src/app/api/id/embed/*` (`requireAuth` + thread scope; the
  table-writing routes already use the canonical `captureException`).
- **Desktop (8.1/8.7):** `apps/desktop` production shell — hardened
  `persist:collaborative` partition, webview security, session mirror,
  `captureDesktopException` (`app:'desktop'`), one vitest suite
  (`session-sync-cookies.test.ts`). No `vitest.config.ts`; `test` runs with
  `--passWithNoTests`.
- **Observability:** canonical `apps/id/src/lib/observability/sentry.ts`
  (`captureException`/`captureMessage`, `USER_SAFE`) and `posthog.ts`
  (`identify`/`capture`, typed event taxonomy). Embed/app-panel paths are already
  clean; ~40 bare `console.error` sites remain on **other** API error paths.
- **No Playwright anywhere yet** (no config, dep, or specs). 8.8 stands it up.

---

## Decisions (deliberate, documented)

### D1 — Realtime Authorization: schema-level RLS on `realtime.messages` + private channels, with the live WS round-trip runtime-deferred

The program's D4 made `publishAccountScoped()` the **send-side** boundary because
public broadcast channels have no built-in RLS. 8.8 adds the **subscribe-side**
boundary the spec names ("full Realtime Authorization via RLS on
`realtime.messages`"). Concretely:

1. **Migration 00091** adds RLS policies on `realtime.messages` that parse the
   account segment out of `realtime.topic()` (the channel name) and compare it to
   `public.kinetiks_account_id()` — for both `SELECT` (receive/subscribe) and the
   broadcast `INSERT` path — scoped to the three collaborative prefixes only. This
   is the schema enforcement; it is **pgTAP-testable in isolation** by setting
   `realtime.topic` via `set_config` + the test JWT claims.
2. **Client wiring:** the presence/workspace channels flip to
   `config: { private: true, broadcast: { self: true } }`, and the transport calls
   `realtime.setAuth(token)` before subscribe so the WS connection carries the JWT
   the policy reads. Pure wiring is unit-tested with a mocked client.
3. **`publishAccountScoped()` stays** as belt-and-suspenders on the send side.

**Honest deferral:** the *live WebSocket round-trip* (a private channel actually
delivering a same-account beat and rejecting a foreign-account subscribe over a
running Realtime server) cannot be observed in this environment — Docker/Colima is
down here and there is no Realtime server. The **policy logic is pgTAP-proven** and
the **client wiring is unit-tested**; the end-to-end WS assertion is routed to the
E2E lane / a running environment and flagged, never faked.

### D2 — E2E architecture follows the existing `e2e-playwright-plan.md`

`apps/id/playwright.config.ts`, specs in `apps/id/e2e/`, helpers in
`apps/id/e2e/support/`. Two strategies: **API-key path** (default; `kntk_*` bearer
keys resolve straight to an `AuthenticatedContext`, no browser — the cheapest,
highest-confidence lane for the safety-critical cross-account isolation specs) and
a **browser path** (`storageState` per account) for the collaborative UI flow. App
boots via `next build` + `next start` (not `dev`) to exercise the real Node/Edge
boundary (Lesson 9). New `.github/workflows/e2e.yml` pins Supabase CLI **2.105.0**
(matches `rls-tests.yml`). The router is **stubbed** for the deterministic CI lane
(no live Anthropic). **The cross-account presence/annotation isolation spec is the
one that must never break.**

### D3 — Observability sweep is one cross-cutting commit, scoped to genuine error paths

The collaborative surfaces are already on the canonical helper. The remaining bare
`console.error` sites are in unrelated subsystems (cartographer, connections,
imports, nango, fixtures-cleanup, api-keys). They are converted to
`captureException` in a single focused `refactor(observability)` commit — one
logical change (one cross-cutting concern: "every error path reports through the
canonical Sentry shape"), not bundled feature work. Pure logging-line swaps, no
behavior change; `no-console` lint + type-check gate them.

### D4 — Reference-surface AI honesty

The reference collaborative surface uses **fixture/static** annotations and makes
**no AI calls** today (confirmed: no annotation-generation prompt exists; embed
annotations are seeded fixture content labeled `kinetiks_fixtures`). The DoD line
"`ai_calls` fire on every annotation/judgement AI call" is therefore **vacuously
satisfied** on the reference surface and is documented as such — the `ai_calls`
plumbing is proven elsewhere (Marcus, Cartographer, Oracle), and when a real suite
app emits AI-generated annotations it routes through `@kinetiks/ai/router` like
every other call. We do **not** invent an AI call just to light up the row; that
would be dishonest plumbing. The in-panel approval path (`analyzeEdits`,
`calibrateThreshold`) is deterministic, not an AI judgement, so it correctly emits
no `ai_calls` row.

### D5 — PostHog collaborative events are append-only additions to the typed taxonomy

New `KineticsEventName` entries (`collab_panel_opened`, `collab_annotation_pinned`,
`collab_annotation_dismissed`, `collab_task_killed`, `collab_intervention`,
`collab_approval_decided`, `collab_tempo_changed`) are added to
`posthog.ts` and captured from the embed routes/components. Properties are
primitives only (ids/enums/bools), no PII, mirroring the existing taxonomy. No-op
until `NEXT_PUBLIC_POSTHOG_KEY` is set (the existing lazy-init pattern).

---

## Slices

### Slice 1 — pgTAP hardening + Realtime Authorization (security)
- [ ] Migration `00091_realtime_authorization.sql`: RLS policies on
  `realtime.messages` for `presence|annotations|workspace:{account}:{thread}`
  topics, scoped via `realtime.topic()` → account segment vs `kinetiks_account_id()`
  (SELECT + broadcast INSERT). Idempotent/guarded; `team_scope_id` n/a (no new table).
- [ ] Flip presence/workspace channels to `private: true`; ensure `realtime.setAuth`
  runs before subscribe in the transport. Unit-test the channel config + setAuth call.
- [ ] pgTAP `realtime_channel_boundary.sql`: same-account topic allowed, foreign-account
  topic denied, malformed topic denied (SELECT + INSERT).
- [ ] pgTAP gap-fill: `ledger_collaborative_events.sql` (the three new event types
  accepted; an unregistered type rejected); extend `active_tasks_state_machine.sql`
  with `kill_reason_code` CHECK (invalid code fails); extend
  `annotations_cross_tenant.sql` with jsonb-array CHECK on `replies`/`evidence_refs`;
  `workspace_actions` FK `ON DELETE SET NULL` behavior.
- [ ] `pnpm db:types` only if the migration changes generated types (realtime-schema
  policies do not — note in commit).
- [ ] Commit: `feat(collab): Realtime Authorization (realtime.messages RLS) + pgTAP hardening`.

### Slice 2 — Observability standardization + PostHog product events
- [ ] Sweep bare `console.error` on API error paths → `captureException` with the
  canonical `{ route, action, stage, app:'id' }` tags + ids-only `extra`.
- [ ] Add the seven `collab_*` events to `posthog.ts`; capture from embed routes
  (annotations pin/dismiss, active-task kill, intervention, approval) and the panel
  open path. Primitives only.
- [ ] Confirm Ledger entries carry `grant_id`/`pattern_id` where applicable (the
  reference surface emits neither — document); confirm `ai_calls` discipline (D4).
- [ ] Commit(s): `refactor(observability): route remaining API error paths through canonical Sentry helper`; `feat(collab): PostHog product events for collaborative actions`.

### Slice 3 — Playwright E2E harness + specs + CI
- [ ] `apps/id/playwright.config.ts` (webServer = build+start), `@playwright/test`
  dev dep + `e2e`/`e2e:ui` scripts, `e2e/support/` harness (`seedAccount`,
  `mintApiKey`, `apiClient`, `resetFixtures`, two-account factory).
- [ ] Backend flow specs (API-key, no browser): **cross-account isolation
  (must-never-break)** across the embed collaborative routes
  (`/api/id/embed/{annotations,active-task,workspace-actions,intervention,state,approval}`)
  + the existing approval/authority/cortex paths; approval lifecycle; authority
  pause/revoke.
- [ ] Browser spec(s): the full collaborative flow on the reference surface (open
  panel → presence → annotate → delegate → undo → kill → approve) with a router
  stub; **the cross-account presence/annotation isolation browser spec**.
- [ ] `.github/workflows/e2e.yml` (CLI 2.105.0, build+start, upload report);
  non-blocking first per the e2e plan.
- [ ] Commit: `test(e2e): Playwright harness + collaborative + cross-account isolation specs`.

### Slice 4 — Performance budgets + assertions
- [ ] Unit assertions where runnable: frame-cache memory budget (≤3, eviction order,
  pinning — extend the existing suite with an explicit §14.3 budget test); presence
  interpolation ≤150ms (unit on the interpolation/latency logic, §14.1); panel
  interactive <2s (E2E timing: skeleton→ready, §14.2).
- [ ] Document the desktop live-webview memory check as runtime-deferred (no display/GPU here).
- [ ] Commit: `test(perf): collaborative performance-budget assertions (§14)`.

### Slice 5 — Docs
- [ ] Root `CLAUDE.md`: a "Collaborative Workspace Patterns" section — collaborative
  RLS rules (read-only RLS + service-role writes + `publishAccountScoped` +
  `realtime.messages` RLS), `team_scope_id` placeholder, kill-signal Ledger shape
  (`task_killed` @ 2×, `intervention_undo`/`intervention_grab`), the
  `CollaborativeSynapse` contract for future suite apps.
- [ ] `design/kinetiks-design-spec.md`: §16 floating-bar note + the **D7 resolved-color
  note** (spec's aspirational `#00CEC9` superseded by `--kt-success`).
- [ ] `docs/platform-contract.md`: `CollaborativeSynapse` extension.
- [ ] `docs/operational/env-vars.md`: E2E env + correct the `NEXT_PUBLIC_POSTHOG_KEY`
  name; any new vars.
- [ ] Commit: `docs(collab): collaborative RLS/contract rules, §16 D7 note, env-vars`.

### Slice 6 — Close out 8.7 deferred runtime items (honest) + DoD checklist
- [ ] Close what's runnable at unit/CI level; honestly document the genuinely
  un-runnable items (live desktop launch, observed ≤3-webview LRU eviction memory
  check, presence/undo round-trip <150ms over a running webview, real cookie-share
  in a running webview, packaged-app smoke) as **still-deferred with the reason**
  (no display / no GPU / no Electron packaging in this environment), routed to a
  machine with a display.
- [ ] Re-read spec §1–§17; tick every capability in the checklist below.

---

## Cross-cutting (every slice)

- **Security:** channel names are conventions — `publishAccountScoped` (send) +
  `realtime.messages` RLS (subscribe) + table RLS together are the boundary.
  `team_scope_id` stays null in v1. No PII in prompts/logs. Service-role use
  justified in the PR.
- **State machines:** unchanged — `active_tasks` enforced at server-action
  `assertTransition` + trigger + RLS; terminal states irreversible at all three.
- **Tokens / a11y:** any new UI references `--kt-*`; light + dark; reduced-motion.
- **Observability:** canonical `captureException` shape with `app` tag; no
  `console.log` in committed code.
- **Fixtures honesty:** reference-surface rows stay `source_app='kinetiks_fixtures'`,
  Ledger `is_fixture:true`.
- **Git/deploy parity (Lessons 8/10):** migration + types in one PR; never
  `git add -A` (apps/dm untracked drift); gated deploy scripts need `--allow-dirty`
  with an immediate matching commit.

---

## Verification & Definition of Done

**Verifiable in this environment (will be done):**
- `pnpm type-check` (16/16 packages) + `pnpm lint` clean.
- Unit suites pass: `packages/collaborative` (frame-cache, panel-bridge, perf,
  realtime wiring), `apps/id` (embed contract, new specs' helpers), `apps/desktop`.
- pgTAP suites **authored** and self-reviewed; channel-boundary + gap-fill SQL
  written to run under `pnpm test:rls` in CI (Docker/Colima is down locally —
  flagged, run in `rls-tests.yml`).
- Playwright harness + specs **authored**; `e2e.yml` wired. The API-key
  cross-account isolation spec is written to fail loudly on a tenant-boundary
  regression.
- Adversarial multi-agent review (this phase is risk-qualifying: RLS / cross-tenant
  isolation / Realtime boundaries / observability) + CodeRabbit, reconciled.
- `pnpm health` git↔deploy parity after merge.

**Deferred to a running environment (honestly flagged, never faked):**
- Live `pnpm test:rls` execution (needs Docker/Colima + `pg_prove` — absent here;
  runs in CI).
- Live Playwright run (needs the Supabase stack + a built app + browsers; CI lane,
  non-blocking first).
- The Realtime-Authorization **live WS round-trip** (D1): policy is pgTAP-proven,
  wiring unit-tested, end-to-end WS assertion routed to the E2E lane / a Realtime server.
- The 8.7 desktop runtime items (live launch, observed LRU memory eviction,
  webview presence/undo <150ms, live cookie-share, packaged smoke) — no
  display/GPU/packaging here; routed to a machine with a display.

---

## Program DoD — §1–§17 capability checklist (ticked in Slice 6)

- [ ] §3/§4 Split panel — web (same-origin embed) + desktop (webview), activation/deactivation, thread-scope reset, responsive slide-over <1280px.
- [ ] §5 Presence — agent cursor (typing, uncertainty pulse, selection), user presence, click-to-intervene, <150ms interpolation.
- [ ] §6 Annotations — decision/data/skip/suggestion, dismiss/pin/collapse/reply, density control, pin→Ledger.
- [ ] §7 Collaboration modes — System/User/Pair tempo, drag-to-delegate, shared bidirectional undo + shortcuts.
- [ ] §8 Task drawer — floating pill, multi-step plan, Kill Task flow (2× signal, "what went wrong", revert), skip-step.
- [ ] §9 Approval integration — in-panel visual approve/edit/reject, trust-through-tempo, intervention-as-trust-signal, auto-approve retrospective.
- [ ] §10 App-first / multi-app — sequential breadcrumb + side-by-side, desktop "app comes to you".
- [ ] §11 `CollaborativeSynapse` + `/embed` + `CollaborativeProvider` — app-agnostic contract documented.
- [ ] §12 Realtime channels — three account/thread-scoped channels, `publishAccountScoped` + `realtime.messages` RLS.
- [ ] §13 Phased delivery — 8.2–8.7 complete; 8.8 hardens.
- [ ] §14 Performance — presence <100ms (interp ≤150ms), panel <2s, ≤3 webviews LRU.
- [ ] §16 Floating-bar visual language — pill/shadow/anatomy, §16.6 color map (D7), dismiss patterns, red-text destructive, dark-filled primary.
- [ ] §17 Resolved decisions — thread-scoped, kill switch, desktop-only, first-party-only, single-player — all honored.
- [ ] Cross-account isolation proven (pgTAP + API-key E2E + browser isolation spec).
- [ ] Observability — canonical Sentry everywhere, PostHog collaborative events, `ai_calls`/Ledger discipline (D4).
