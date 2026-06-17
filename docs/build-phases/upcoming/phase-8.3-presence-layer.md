# Phase 8.3 — Presence Layer (Execution Plan)

> Spec §13.2 / 4b + §5. Agent and user are visible co-participants on the panel surface: agent cursor, typing indicator, uncertainty pulse, selection highlight; user presence; click-to-intervene. Built on the broadcast channel substrate from 8.0.
> **Branch:** `collab/phase-8.3-presence-layer`.

**Spec refs:** collaborative-workspace-spec §5 (all), §14.1; §12 (channels).

---

## Grounding
- `@kinetiks/collaborative` `CollaborativeProvider` (8.0) has `agentPresence`/`userPresence` state + a pluggable `CollaborativeTransport` seam (null today). 8.3 supplies a Realtime transport.
- `packages/supabase/realtime` (8.0): `presenceChannel(account, thread)` + `publishAccountScoped` (account-validated, broadcast has no RLS) + `useRealtimeChannel` hook.
- Reference surface (`ReferenceSequenceBuilder`, 8.2) has `data-component-id`/`data-field-name` anchors for positioning.
- Single-player (§17.5): agent presence is server/fixture→client; user presence is local. No multi-client CRDT.
- Motion tokens exist: `--kt-dur-3` (320ms, cursor move), `--kt-dur-cursor` (1s, pulse). No new token needed.

---

## Slices

### Slice 1 — AgentCursor primitive (`@kinetiks/ui`)
- [ ] `AgentCursor`: labeled dot positioned at (x,y), smooth `transform` transition (`--kt-dur-3`), uncertainty **pulse** (`@keyframes kt-agent-pulse`, `--kt-dur-cursor`), brand color via `currentColor`. States: idle / uncertain / typing / selecting. Tokens only (label = elevated bg + currentColor border, no hardcoded white).
- [ ] CSS in `primitives.css` (mirrors `.kt-cursor`); export from ui index. `prefers-reduced-motion` disables the pulse.
- [ ] Commit: `feat(ui): AgentCursor presence primitive`.

### Slice 2 — Realtime presence transport + provider wiring
- [ ] `packages/collaborative`: a Realtime-backed `CollaborativeTransport` (subscribe agent presence, publish user presence via `publishAccountScoped`) + a `useRealtimeTransport(account, thread)` hook. Provider consumes it.
- [ ] 100–150ms interpolation (§14.1): smooth cursor between beats; if a beat is late, animate to the last known target.
- [ ] Commit: `feat(collaborative): Realtime presence transport`.

### Slice 3 — Presence rendering + agent fixture playback + user presence + intervene
- [ ] Embed surface renders `AgentCursor` at the agent's target field (`getBoundingClientRect` of the `data-field-name` anchor, relative to the surface). Typing indicator + selection highlight at the field.
- [ ] **Agent fixture playback** (the reference surface has no real agent): a scripted, clearly-labeled sequence (cursor → segment → type topic → uncertain pause → …) drives agent presence over the channel. Honors the fixtures contract.
- [ ] **User presence**: embed surface emits focus/blur/select/scroll/hover → presence channel.
- [ ] **Click-to-intervene** (§7.2 inverse): user focuses a field the agent is on → agent yields (playback skips it).
- [ ] Commit: `feat(embed): presence rendering + agent playback + user presence + intervene`.

### Slice 4 — Cross-account isolation + reduced-motion + tests
- [ ] Verify a foreign account cannot subscribe/publish on `presence:{account}:{thread}` (the must-never-break test). `prefers-reduced-motion` respected (no pulse, instant cursor).
- [ ] Unit/contract tests for the transport publish guard + presence event mapping.
- [ ] Commit: `test(presence): cross-account isolation + reduced-motion`.

---

## Phase 8.3 Definition of Done
- Agent cursor animates smoothly (60fps); typing renders char-by-char; uncertainty pulse fires where the agent pauses; user click yields the field; presence renders <150ms with interpolation.
- **Cross-account presence isolation holds** (foreign account cannot see/publish). `prefers-reduced-motion` respected.
- Agent playback is fixture-labeled. `pnpm type-check` clean; tests pass. No `apps/dm` staged.
