# Phase 8.6 — Task Drawer, Approval Integration & Floating-Bar System (Execution Plan)

> Spec §8 (Task Drawer), §9 (Approval System Integration), §16 (Design Direction / floating bars). These three sections **are** the scope for 8.6.
> **Branch:** `collab/phase-8.6-task-drawer`.

**Spec refs:** collaborative-workspace-spec §8 (all), §9 (all), §16 (all), §17.2.

---

## Grounding (what 8.0–8.5 already shipped — do not rebuild)

- **`kinetiks_active_tasks`** (migration 00090, in prod): full lifecycle
  (`active → paused | killed | completed`), one-active-per-thread partial unique
  index, `kill_reason_code` / `kill_feedback` columns, `steps` jsonb, `progress`,
  `current_step_index`, `command_id`, RLS (account-scoped SELECT; service-role
  writes), updated_at + lifecycle-guard triggers. In the realtime publication.
- **State machine** for `kinetiks_active_tasks` registered in
  `apps/id/src/lib/state-machines-init.ts` (~line 319): pause/resume are user
  actions; kill is user|system; complete is agent|system.
- **`SIGNAL_WEIGHTS`** registry (`apps/id/src/lib/approvals/signal-weights.ts`):
  `kill=+20` (2× rejection), `undo=+5`, `grab=+3`, `edit=0`, `non_intervention=−2`,
  with `applySignalToThreshold`. **Pure module today — not yet wired into the live
  learning-loop.** 8.6 lands that wiring.
- **Ledger event types** `task_killed` / `intervention_undo` / `intervention_grab`
  exist in the CHECK constraint (migration 00087).
- **Types** (`@kinetiks/types` collaborative.ts): `ActiveTask`, `ActiveTaskStep`,
  `KillSignal`, `KillReasonCode`, `ActiveTaskStatus`, `ActiveTaskStepStatus`.
- **Approval system** (`apps/id/src/lib/approvals`): `calibrateThreshold` +
  `computeThresholdUpdate`, `processApprovalDecision`, `analyzeEdits`.
- **Embed surface:** `EmbedSurface → CollaborativeProvider → PresenceSurface`
  (`apps/id/src/components/embed/`). Undo stack: `useWorkspaceActions.ts` +
  `/api/id/embed/workspace-actions`. PresenceSurface has the scripted-`PLAYBACK`
  fixture pattern. Toast primitive + `.kt-toast` CSS exist in `@kinetiks/ui`.

**No new table or migration is required.** Active tasks, ledger event types, and
approval thresholds all exist. 8.6 is UI + the intervention-signal wiring on top.

---

## Reference-surface conventions (fixtures honesty, §5 cross-cutting)

- Every reference-surface task / action / signal is labeled `source_app =
  "kinetiks_fixtures"`; ledger entries carry `detail.is_fixture: true`; UI shows a
  "fixture" tag. The platform code never branches on "is fixture".
- Intervention signals (kill / undo / grab) and the in-panel approval on the
  reference surface use a single representative action category,
  `REFERENCE_ACTION_CATEGORY = "sequence_adjustment"` (the surface is a sequence
  builder). Documented in `apps/id/src/lib/embed/contract.ts`.

---

## Slices

### Slice 1 — Task drawer floating bar (§8, §16.1)
- [ ] `.kt-floating-bar` base in `packages/ui/styles/primitives.css` — the shared
      pill-shaped, elevated (shadow, no hard border), generous-radius treatment
      for the task drawer, thread-switch warning, and bulk bar.
- [ ] `TaskDrawer` primitive (`@kinetiks/ui`, local types): collapsed = system
      name + current-step label + progress + **Kill** (red text, no fill, always
      visible); expanded = full multi-step plan (§8.4) + elapsed time + step
      controls + app badge. Animated expand, token-only, light + dark,
      `prefers-reduced-motion` respected. X-on-left dismiss/collapse (§16.5).
- [ ] `useActiveTask(account, thread)` (`apps/id/src/lib/embed`): fetch + a
      `postgres_changes` sync of the one active/paused `kinetiks_active_tasks` row
      for the thread; `open` / `pause` / `resume` / `progress` / `kill` / `skipStep`
      ops via the route.
- [ ] `/api/id/embed/active-task` route: discriminated-union ops (`open`, `pause`,
      `resume`, `progress`, `kill`, `skip_step`). `assertTransition` before every
      status write; service-role write; account+thread scoped; fixture-labeled.
- [ ] `TaskDrawerSurface` mounted in `PresenceSurface`: a fixture playback that
      `open`s a multi-step task and advances `progress` over time, so the drawer
      renders (consistent with the `PLAYBACK` pattern).
- [ ] Commit: `feat(ui): TaskDrawer floating bar + active-task wiring`.

### Slice 2 — Kill Task flow (§8.3, §17.2)
- [ ] Drawer Kill → "What went wrong?" prompt: quick-select reasons (wrong tone /
      data / approach / target / other) + free-text, inside the expanded drawer.
- [ ] `computeInterventionUpdate({ existing, signal, now })` — pure, added to
      `threshold-math.ts`, registry-driven (uses `SIGNAL_WEIGHTS`): applies the
      threshold delta, resets the streak when `resetsStreak`, marks rejection-class
      signals (kill, undo) as a rejection for `total_rejections` / `last_rejection_at`,
      recomputes `approval_rate`. Unit-tested.
- [ ] `applyInterventionSignal(account, category, signal, detail)`
      (`apps/id/src/lib/approvals/intervention-signals.ts`): persists the computed
      threshold to `kinetiks_approval_thresholds` and writes the
      `SIGNAL_WEIGHTS[signal].ledgerEventType` ledger entry (`detail.is_fixture`,
      weight, category, signal-specific detail). Returns the new threshold.
- [ ] Kill op (in the active-task route): `assertTransition → killed`, store
      `kill_reason_code` / `kill_feedback`, **revert in-progress agent field updates
      via the undo stack** (mark the thread's non-undone `participant='agent'`
      workspace actions undone), `applyInterventionSignal(..., 'kill', ...)` at 2×,
      return a plain-language chat acknowledgement string.
- [ ] **Kill-whole vs skip-step** (§8.4): `skip_step` marks the current step
      `skipped`, advances `current_step_index`, leaves status `active` — no kill
      signal. Kill-whole kills the orchestration.
- [ ] Undo + grab wiring (§9.3, deferred from 8.5): the `workspace-actions` `undo`
      op, when the undone row's `participant='agent'`, fires `intervention_undo`;
      a `grab` signal fires `intervention_grab` when the user grabs a field the
      agent was about to fill (PresenceSurface inverse-yield) via
      `/api/id/embed/intervention`.
- [ ] Commit: `feat(tasks): kill-task flow — revert, 2x signal, skip-step, intervention wiring`.

### Slice 3 — Visual approval (§9.1)
- [ ] `ApprovalOverlayBar` primitive (`@kinetiks/ui`): translucent in-panel bar —
      **Approve** (dark-filled primary, §16.6), **Edit** (secondary), **Reject**
      (red text, no fill). Floating-bar treatment.
- [ ] Edit-in-place: the surface field becomes editable; on save the diff is sent
      as `approved_with_edits` and run through `analyzeEdits` (refactored to accept
      a narrow `EditAnalysisContext` so the embed path and the real approval path
      share it). Reject opens a reason prompt → learning signal.
- [ ] `/api/id/embed/approval` route: `approve` (clean) / `approve_with_edits`
      (runs `analyzeEdits`) / `reject` (reason) → `calibrateThreshold` + the matching
      ledger entry (`approval_approved` / `approval_approved_with_edits` /
      `approval_rejected`, `detail.is_fixture`). Account-scoped, representative.
- [ ] Render the overlay on the reference surface when the fixture task reaches an
      "awaiting approval" beat.
- [ ] Commit: `feat(approvals): in-panel visual approval overlay`.

### Slice 4 — Trust through tempo (§9.2)
- [ ] `confidence-tempo.ts` pure helper (`apps/id/src/lib/embed`): confidence
      (0–100) → `{ band: 'low'|'medium'|'high', speedMultiplier, annotationDensity }`.
      Low = slow + every field annotated; high = fast + minimal annotations.
      Unit-tested (density/speed by confidence band).
- [ ] Wire into the playback: `hold_ms` scaled by `speedMultiplier`; the agent emits
      annotations only up to `annotationDensity`.
- [ ] Auto-approved path: when the surface is in the auto-approve band, no overlay
      bar opens; a sidebar `RetrospectiveNotice` renders ("{System} auto-approved
      and sent N follow-up emails. [Review]") → `RetrospectivePanel` shows a
      read-only after-the-fact summary (§9.2 "Auto-approved").
- [ ] Commit: `feat(tempo): trust-through-tempo density + auto-approve retrospective`.

### Slice 5 — Floating-bar system (§16)
- [ ] Extend `toast.tsx`: agent-action toast variants with the §16.5 anatomy
      (icon + label + action). Success (green) + **Undo** (outline); warning/
      uncertainty (amber) + dismiss; error (red) + **Retry** (outline) or dismiss;
      info (neutral) + CTA (dark-filled) or dismiss. X-on-the-right for transient
      toasts. `.kt-toast__action` + icon styling, token-only.
- [ ] `ThreadSwitchWarning` primitive (`@kinetiks/ui`): amber floating bar — "{System}
      is still working on {task} — leave anyway?" with **Stay** (primary) / **Leave**
      (secondary). Wired into the reference surface's "close panel / navigate away"
      affordance while a task is active.
- [ ] `BulkActionBar` primitive (`@kinetiks/ui`): top-of-panel floating bar —
      selection count + "Select all N" + contextual actions (incl. red-text Delete);
      agent-triggerable. Demonstrated by selecting steps on the reference surface.
- [ ] Enforce §16.5 (pill radius, shadow-not-border, dismiss patterns, red-text
      destructive, dark-filled primary) and §16.6 color mapping across all of them,
      light + dark.
- [ ] Commit: `feat(ui): floating-bar system — agent toasts, thread-switch, bulk bar`.

### Slice 6 — Tests
- [ ] Unit: `computeInterventionUpdate` (kill = +20 / 2×, undo = +5, grab = +3,
      non_intervention = −2, edit = 0; streak reset; clamps; rejection-class bumps).
- [ ] Unit: `confidence-tempo` density + speed by band.
- [ ] Unit: undo-revert selection (which agent actions a kill reverts).
- [ ] State-machine: `kinetiks_active_tasks` transitions (kill from active/paused
      ok; complete only by agent/system; terminal irreversible; skip-step is not a
      status transition).
- [ ] Commit: `test(collab): intervention signals + active-task transitions + tempo`.

---

## Cross-cutting (every slice)

- **Tokens only** — every value references a `--kt-*` token; `.kt-floating-bar`
  is the base for all floating elements; light + dark intentional;
  `prefers-reduced-motion` respected. New UI primitives live in `@kinetiks/ui`
  with local types (decoupled from `@kinetiks/types`).
- **State machines** — `assertTransition()` before every `kinetiks_active_tasks`
  status write (server layer); the 00090 trigger + RLS are the other two layers.
- **Observability** — canonical `Sentry.captureException` shape via
  `@/lib/observability/sentry`; no `console.log`.
- **Customer-facing copy** — no raw types; the kill prompt + acknowledgement read
  as plain language. The literal phrase "Authority Grant" never appears.
- **Fixtures honesty** — `source_app='kinetiks_fixtures'`, `detail.is_fixture:true`,
  "fixture" tag.

---

## Phase 8.6 Definition of Done

- Task drawer renders bound to `kinetiks_active_tasks` (collapsed + expanded, §8 +
  §16.1); kill reverts in-progress changes, logs a 2× `task_killed` signal, and
  contracts trust (state-machine + signal-math tests); skip-step advances without
  killing; in-panel approve/edit/reject works and feeds learning (edit → analyzer,
  reject → signal); auto-approve retrospective renders; the full §16 floating-bar
  language (task drawer, agent toasts, thread-switch, bulk bar) matches §16.5/§16.6
  in light + dark.
- `kinetiks_active_tasks` transitions enforced at server-action (`assertTransition`)
  + trigger + RLS. Ledger entries fire with correct weights and `is_fixture`.
- `pnpm type-check` clean; lint clean; tests pass; tokens only. No `apps/dm` staged.
