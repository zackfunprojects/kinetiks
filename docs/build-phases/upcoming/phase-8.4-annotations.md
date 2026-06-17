# Phase 8.4 — Inline Annotations (Execution Plan)

> Spec §13.3 / 4c + §6. The named system explains its reasoning directly on the surface: decision notes, data references, skip notes, suggestions — anchored to a field, dismissible/pinnable/collapsible/replyable, with density control.
> **Branch:** `collab/phase-8.4-annotations`.

**Spec refs:** collaborative-workspace-spec §6 (all); §12 (annotations channel).

---

## Grounding
- `kinetiks_annotations` (migration 00088, applied to prod, types regenerated): `id, account_id, thread_id, team_scope_id, kind, component_id, field_name, position, max_width, summary, body, pinned, dismissed, replies(jsonb), evidence_refs(jsonb), source_app, created_at, updated_at`. RLS: account-scoped read, service-role write. In the `supabase_realtime` publication.
- `@kinetiks/types` `Annotation` (8.0): `{ id, account_id, thread_id, kind, anchor{component_id,field_name,position,max_width}, summary, body, pinned, dismissed, replies?, references?, created_at, team_scope_id }`. DB `evidence_refs` ↔ TS `references`.
- `CollaborativeProvider` has `annotations` state + `addAnnotation`/`dismissAnnotation` + transport `onAnnotations`/`persistAnnotation`/`dismissAnnotation` (no-ops in the Realtime transport today).
- `/api/id/embed/annotations` (8.0 scaffold): validates intent, doesn't persist yet.
- Reference surface fields carry `data-component-id`/`data-field-name`; `PresenceSurface` already positions overlays via `getBoundingClientRect`.

---

## Slices

### Slice 1 — AnnotationChip primitive (`@kinetiks/ui`)
- [ ] `AnnotationChip`: collapsed one-line summary → expand to full body; dismiss X, pin toggle, reply affordance + reply thread. Subtle per-`kind` accent (decision/data-reference/skip/suggestion). Tokens-only; CSS in `primitives.css`.
- [ ] Commit: `feat(ui): AnnotationChip primitive`.

### Slice 2 — Persistence + transport (annotations channel)
- [ ] `/api/id/embed/annotations`: persist create/dismiss/pin/reply to `kinetiks_annotations` (admin client, account+thread scoped, `source_app='kinetiks_fixtures'`, write-before-publish), then broadcast on `annotations:{account}:{thread}`. Pin writes a Ledger entry (`pattern_user_annotated`-style — reuse an existing event type or the annotation lifecycle).
- [ ] Realtime transport: wire `onAnnotations` (postgres_changes on `kinetiks_annotations` filtered by account, mapped DB→`Annotation`), `persistAnnotation`/`dismissAnnotation` (POST the embed route). Provider consumes.
- [ ] Commit: `feat(annotations): persistence + Realtime transport wiring`.

### Slice 3 — Anchored rendering + fixture generation + density
- [ ] `PresenceSurface`/an `AnnotationLayer`: render `AnnotationChip`s positioned at each annotation's `data-field-name` anchor (like the cursor). Dismiss/pin/reply call the provider.
- [ ] Fixture annotation generation: as the agent playback works a field, emit a matching annotation (decision note on tone, data reference on segment, skip note on a step) — fixture-labeled. Real Haiku generation is for real agents.
- [ ] Density control (§6.3): cap visible annotations by autonomy/confidence; learn from dismissals (suppress a kind the user keeps dismissing); always show high-stakes (uncertain) ones.
- [ ] Commit: `feat(embed): anchored annotation rendering + fixture generation + density`.

### Slice 4 — Tests
- [ ] Unit: DB→Annotation mapping, density selection, annotation-intent validation. (Cross-tenant pgTAP already shipped in 00088.)
- [ ] Commit: `test(annotations): mapping + density + intent`.

---

## Phase 8.4 Definition of Done
- Annotations anchor to fields; dismiss/pin/collapse/reply work; pinned ones persist + write a Ledger entry; density shifts with autonomy + dismissal history; high-stakes always shown.
- Every annotation generation labeled fixture; write-before-publish (DB commit before broadcast).
- `pnpm type-check` clean; tests pass; loading/error/empty; light + dark; tokens only. No `apps/dm` staged.
