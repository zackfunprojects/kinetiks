# Phase 8.5 — Full Collaboration (Execution Plan)

> Spec §13.4 / 4d + §7. Tempo control, drag-to-delegate, shared undo stack, implicit trust signals into the confidence model, and multi-app panel transitions.
> **Branch:** `collab/phase-8.5-full-collaboration`.

**Spec refs:** collaborative-workspace-spec §7 (all), §9.3, §10.4.

---

## Grounding
- `CollaborativeProvider` (8.0) has `tempoMode`/`setTempoMode`, `undoStack`/`undo`, `delegate` + transport seams; `useTempoMode`/`useUndoStack`/`useDelegateRegion` hooks.
- `kinetiks_workspace_actions` (00089, in prod): `id, account_id, thread_id, participant, action_type, target, previous_value, new_value, annotation_id, sequence_index (unique per thread), undone, source_app, created_at`. In the realtime publication.
- Approval system (apps/id/src/lib/approvals): `confidence.ts` `WEIGHTS`, `threshold-math.ts`, `learning-loop.ts processApprovalDecision`. Ledger event types include `intervention_undo`/`intervention_grab` (added 00087).
- Embed surface (8.2-8.4): `PresenceSurface` + anchors + click-to-intervene (8.3).

---

## Slices

### Slice 1 — TempoControl + provider wiring
- [ ] `TempoControl` primitive (`@kinetiks/ui`): 3-way segmented control (System leads / Pair / User leads). Token-only.
- [ ] Render in the embed surface header via `useTempoMode`. (§7.1)
- [ ] Commit: `feat(ui): TempoControl + tempo wiring`.

### Slice 2 — Shared undo stack (persistence + UndoTimeline + shortcuts)
- [ ] `UndoTimeline` primitive (`@kinetiks/ui`): bidirectional history with participant labels + per-action undo.
- [ ] `useWorkspaceActions(account, thread)` (apps/id): fetch + postgres_changes sync of `kinetiks_workspace_actions`; record (append with next `sequence_index`) + undo (mark `undone`). `/api/id/embed/undo` persists undo; an embed actions route persists records.
- [ ] Keyboard shortcuts: Cmd+Z (last, either), Cmd+Shift+Z (agent-only), Cmd+Alt+Z (open timeline). (§7.3)
- [ ] Commit: `feat(undo): shared undo stack — persistence, UndoTimeline, shortcuts`.

### Slice 3 — Drag-to-delegate + inverse yield
- [ ] Region select on the surface → delegate to the agent (`handleDelegation`); keyboard shortcut. Inverse yield already in 8.3 (user grabs → agent yields). (§7.2)
- [ ] Commit: `feat(embed): drag-to-delegate region + delegation handling`.

### Slice 4 — Implicit trust signals → confidence
- [ ] `SIGNAL_WEIGHTS` registry in `confidence.ts`/`threshold-math.ts`: kill 2x (already 8.6-bound), undo (weak reject), grab (field-level penalty), edit (training), non-intervention (boost). Route grab/undo signals through `learning-loop` with Ledger `intervention_grab`/`intervention_undo`. (§9.3)
- [ ] Commit: `feat(approvals): intervention trust signals + SIGNAL_WEIGHTS registry`.

### Slice 5 — Multi-app panel transitions
- [ ] Sequential breadcrumb (`[DM] > [Harvest] > [Litmus]`), click any step to view; side-by-side "Show both" on wide viewports. (§10.4)
- [ ] Commit: `feat(panel): multi-app transitions + side-by-side`.

### Slice 6 — Tests
- [ ] Unit: undo-stack ordering/selection, SIGNAL_WEIGHTS math, delegation region build. (pgTAP for workspace_actions shipped in 00089.)
- [ ] Commit: `test(collab): undo + signal weights + delegation`.

---

## Phase 8.5 Definition of Done
- All three tempo modes behave per spec; drag-to-delegate hands off the selected region; undo is bidirectional + participant-filterable with the right shortcuts; intervention signals move the confidence threshold via the registry (unit-tested); multi-app breadcrumb + side-by-side render.
- `pnpm type-check` clean; tests pass; tokens only; light + dark. No `apps/dm` staged.
