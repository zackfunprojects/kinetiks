# Phase 8.2 — Basic Split Panel (Execution Plan)

> First **user-visible** collaborative phase (spec §13.1 / 4a). The Chat tab splits into `[threads | chat | app panel]`; the panel mounts the reference surface via the same-origin embed contract, loaded with an entity, with full activation/deactivation rules and responsive behavior. No presence layer yet (8.3).
> **Branch:** `collab/phase-8.2-split-panel`.

**Spec refs:** collaborative-workspace-spec §4 (all), §14.2; spec-addendum-chat-ux §B.5.

---

## Grounding
- `ChatLayout.tsx` — `<div flex height:100%>` with `ChatSidebar` (280px) + `ChatArea` (flex). Owns `currentThreadId`, thread select/new (both reset messages + pushState). Add the panel as a third column here.
- Activation sources that exist **today**: the rich `ActionCard` (8.0 Slice 5) already carries `onOpen(panel: AppPanelOpen)`; approval cards carry `deep_link` (currently `target=_blank`); the command pipeline emits a `panel_open` SSE event (8.0 Slice 4) — though chat doesn't run that pipeline inline yet.
- Reference surface: `apps/id/src/app/embed` (8.0 Slice 7) renders a placeholder; 8.2 builds it out to minimal-but-representative.
- Layout uses inline `--kt-*` styles (no component CSS files) → responsive needs a `useMediaQuery` hook (JS), not media queries.

---

## Slices

### Slice 1 — Panel infrastructure (context + AppPanel + responsive layout)
- [ ] `AppPanelContext` (provider in ChatLayout): `{ panel, openPanel(target), openFromSignal(AppPanelOpen), closePanel }`. `useAppPanel()` returns null outside a panel-capable layout (no-op).
- [ ] `AppPanel.tsx`: same-origin iframe to `/embed?app=&entity=&mode=collaborative&thread=&account=`; skeleton while loading; parent-side `postMessage` handshake (listen for the embed `ready`); close button + breadcrumb scaffold (single app now). Entity prefetch/preload (§14.2, interactive <2s).
- [ ] `useMediaQuery` hook (if absent). Three-column responsive ChatLayout: ≥1280px → `[sidebar | chat flex | panel ~45%]` with a resizable divider; <1280px → panel is a toggleable slide-over (fixed, right, max 600px, z-index above chat).
- [ ] Open/close + **thread-scope reset** (close panel on thread switch / new thread; spec §17.1). Tab switch (Analytics/Cortex) also closes (panel lives in Chat).
- [ ] Commit: `feat(panel): split-panel infra — context, AppPanel, responsive ChatLayout`.

### Slice 2 — Activation + deactivation wiring
- [ ] **Action card "Open"** (§4.2.4): ChatArea reads `useAppPanel()` and passes `onOpenPanel` to MessageBubble → RichResponse → ActionCard (already plumbed in 8.0).
- [ ] **Approval deep_link** (§4.2.3): `ReviewApprovalCard` mounts the panel when the `deep_link` targets an embeddable surface (`/embed` or app+entity), else keeps the in-app/external behavior.
- [ ] **Command `panel_open`** (§4.2.1): a chat-stream handler calls `openFromSignal` when the SSE `panel_open` event arrives (seam ready; full inline command routing is a later phase).
- [ ] **Explicit** (§4.2.2) + deactivation: close button, task-complete auto-close hook, breadcrumb. Verify all §4.3 close rules.
- [ ] Commit: `feat(panel): activation (action card, approval deep_link, panel_open) + close rules`.

### Slice 3 — Reference surface build-out (minimal-but-representative)
- [ ] `apps/id/src/app/embed` + `EmbedSurface`: a small sequence-builder-style stub — a few labeled fields + a step list + a couple of selectable entities — fixture-labeled, editable. Rich enough to demo (and to host 8.3 presence / 8.4 annotations) without becoming a second app.
- [ ] Loading/error/empty states; tokens only; light + dark.
- [ ] Commit: `feat(embed): minimal-but-representative reference surface`.

---

## Phase 8.2 Definition of Done
- Dispatching/opening mounts the panel with the entity; clicking an approval embed deep_link mounts it in-panel; an action card "Open" mounts it.
- Switching threads / tabs resets the panel; close button + "close" rules all work.
- ≥1280px split with resizable divider; <1280px slide-over toggle. Panel interactive <2s with a skeleton.
- Reference surface renders a believable editable entity, fixture-labeled.
- `pnpm type-check --filter @kinetiks/id` clean; loading/error/empty + light/dark; tokens only.
- No `apps/dm` paths staged.
