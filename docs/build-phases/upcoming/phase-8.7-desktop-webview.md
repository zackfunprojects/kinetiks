# Phase 8.7 — Desktop Multi-App Webview Experience (Execution Plan)

> Spec §3.1 (Desktop App), §4.4 (App Mounting), §10 (App-First Upgrade / multi-app panels), §14.3 (Memory / LRU). "The app comes to you": every Kinetiks app renders inside the desktop shell as an embedded webview, with a 3-webview LRU cache and the collaborative layer intact.
> **Branch:** `collab/phase-8.7-desktop-webview`.

**Spec refs:** collaborative-workspace-spec §3.1, §4.4, §10 (esp. §10.4), §14 (esp. §14.3).

---

## Grounding (what 8.0–8.6 + 8.1 already shipped — do not rebuild)

- **`apps/desktop` (Phase 8.1):** production Electron shell — `main/index.ts` (BrowserWindow, `webviewTag: true`, loads `APP_URL` = `https://id.kinetiks.ai`), `main/webview.ts` (`configureWebviewSecurity`: forces the webview preload + `contextIsolation` + `nodeIntegration:false` + **`partition: "persist:collaborative"`** via `will-attach-webview`, navigation lock to Kinetiks origins, permission allowlist, `window.open` deny), `preload/index.ts` (`window.electron` = `KinetiksDesktopBridge`, `isDesktop:true`), `preload/webview.ts` (`window.electronWebview = { isWebview:true }`), tray/menu/updater/protocol/window-state/observability. Electron 28, `tsc`→CJS, electron-builder. No tests yet.
- **The web app panel (Phase 8.2/8.5):** `apps/id/src/components/chat/app-panel/` — `AppPanel.tsx` renders `EmbedFrame` = a same-origin `<iframe src="/embed?mode=collaborative&account=&app=&entity=&thread=">`; `PanelBreadcrumb.tsx` (multi-app `[A]›[B]›[C]` + "Show both" side-by-side on ≥1280px); `AppPanelContext.tsx` (`AppPanelTarget`, `PanelStep`). **No LRU today — switching apps unmounts/remounts the iframe (cold each time).**
- **The embed surface (8.2–8.6):** `apps/id/src/components/embed/EmbedSurface.tsx` does a same-origin postMessage handshake (`EMBED_SOURCE = "kinetiks-embed"`, origin-checked) and wraps `CollaborativeProvider` → `PresenceSurface`. Presence flows through `RealtimePresenceTransport` (Supabase broadcast `presence:{account}:{thread}`); annotations/undo/task/approval/intervention flow through the embed API routes + `postgres_changes` **directly from the embed's own web context**.
- **Transport seam:** `packages/collaborative` — `CollaborativeTransport` interface, `RealtimePresenceTransport`, `CollaborativeProvider` (takes an injected `transport`). `apps/id/src/lib/desktop/useIsDesktop.ts` (`isDesktop()`, `getDesktopBridge()`, `useIsDesktop()`).
- **Auth model:** `@supabase/ssr` cookie auth (`sb-*` cookies, non-HttpOnly so the browser client reads them). The session lives in the main renderer's **default** partition.

---

## D1 — Key architectural decision (a deliberate, documented deviation from the literal §8.7 task-2 wording)

The spec's §8.7 outline says "IPC relay: main ↔ webview ↔ renderer bridge for **presence/annotation/undo/task events**." Taken literally that means a *dumb* webview whose data is relayed through the Electron main process. **We do not do that, and it would be wrong here.**

The embed (`/embed`) is a complete web app. Inside a `<webview>` pointed at `https://id.kinetiks.ai/embed`, it is a first-class browser context: it can open the Supabase Realtime WebSocket and `fetch` the embed API routes **directly**, exactly as the web iframe does — provided it is authenticated. So:

- **Data flows directly from the webview** (Supabase Realtime for presence; `/api/id/embed/*` for annotations/undo/task/approval/intervention), authenticated by the **mirrored session cookie** (Slice 3). No Supabase/HTTP re-implementation in the Node main process.
- **The shell↔embed IPC carries coordination only** — `ready`, `init`, `focus`, `delegate`, `app_switch`. That is the "transport abstraction" (task 3): web uses parent↔iframe `postMessage`; desktop uses `<webview>` host↔guest IPC (`webview.send` / `ipcRenderer.sendToHost`). The main process is NOT in the coordination path.
- **Main process role:** the 8.1 security substrate (unchanged) + the session mirror (8.7) + `webviewTag` (already on).

**Why:** lower latency (renderer↔guest IPC + direct WS beats a renderer→main→Supabase→main→guest round-trip, honoring the §14.1 <150ms presence budget); no duplicate Supabase auth/Realtime stack in Node; preserves 8.1's hardened partition isolation. This satisfies the spec's intent (the app comes to you, shared presence, ≤3 LRU, the collaborative layer intact) while being more correct than a literal main-process data relay. Flagged here, in the PR, and in `QUESTIONS.md`.

---

## D2 — Session sharing without breaking 8.1 isolation

Main renderer = **default** partition; webviews = **`persist:collaborative`** (8.1). Electron partitions are **isolated cookie jars** — they do NOT share cookies (a common misconception). So the webview is unauthenticated by default.

**Approach:** mirror the app-origin auth cookies from the main renderer's session into the `persist:collaborative` session, and keep them in sync (the main session's `cookies.on("changed")`). This authenticates the webview (both `fetch` and the browser Supabase client read the mirrored `sb-*` cookies) **without** merging partitions, so 8.1's hardened, default-deny `persist:collaborative` isolation is preserved. The pure "which cookies, with what set-params" logic is unit-tested; the `session.cookies` I/O runs only in Electron.

---

## D3 — LRU lives in the renderer (DOM frames), not the main process

8.1 enabled `<webview>` tags (renderer DOM), not main-process `BrowserView`. So the ≤3 cache (§14.3) is a **renderer-side LRU of mounted frame elements**: keep ≤3 `(app, entity)` frames mounted; the active one is visible, the others stay mounted but `display:none` (warm web context, "suspended" render); a 4th mount evicts the least-recently-used (unmount → destroys its context). Applies to **both** iframe (web) and webview (desktop) — warm app-switching everywhere, with the ≤3 cap honoring the desktop memory budget. Pure LRU logic is unit-tested.

---

## Slices

### Slice 1 — Panel transport contract (task 3 foundation)
- [ ] `PanelMessage` union + `PanelMessageType` in `@kinetiks/types/src/collaborative.ts` (append-only): `ready` / `init` / `focus` / `delegate` / `app_switch`, each with a typed payload, all carrying `source: "kinetiks-embed"`.
- [ ] `PanelBridge` interface (host side) + `PanelGuestBridge` (embed side) in `packages/collaborative` — `postMessage(msg)` / `onMessage(cb)`; plus two host adapters: `createPostMessageHostBridge(iframeEl, origin)` and `createWebviewHostBridge(webviewEl)`; and a guest factory `resolveGuestBridge()` that picks `window.parent` postMessage vs the `electronWebview` IPC bridge. Strict origin + `source` validation on every inbound message.
- [ ] Unit-test the contract: valid/invalid envelopes, origin/source rejection, round-trip serialization.
- [ ] Commit: `feat(collab): panel transport contract (postMessage + webview IPC)`.

### Slice 2 — Frame abstraction + LRU (§14.2/§14.3, task 1)
- [ ] Pure LRU module (`packages/collaborative/src/frame-cache.ts`): `touch(key)`, `evictions`, `≤3`, active pinned. Unit-tested.
- [ ] `PanelFrame` component (`apps/id`): renders `<iframe>` (web) or `<webview src={…}>` (desktop). The renderer does NOT set `partition` or `allowpopups` — the main process forces `partition: "persist:collaborative"` (will-attach-webview) and denies `window.open`, so they are authoritative there. Same `/embed?...` URL + skeleton (§14.2); collaborative components inside are unchanged.
- [ ] `usePanelFrameCache` + AppPanel: keep ≤3 frames mounted, active visible, others `display:none` (warm), LRU-evict the 4th. Breadcrumb switch becomes warm.
- [ ] Commit: `feat(panel): PanelFrame (iframe/webview) + ≤3 LRU frame cache`.

### Slice 3 — Desktop session mirror (§4.4 auth, D2)
- [ ] `apps/desktop/src/main/session-sync.ts`: pure `cookieSetParamsForMirror(sourceCookies, appUrl)` (filter to app-origin cookies, map to `cookies.set` params) + `startSessionMirror(appUrl)` that does the initial copy and subscribes to the default session's `cookies.on("changed")` to keep `persist:collaborative` in sync (and removes on delete). Wire into `main/index.ts` `whenReady`.
- [ ] Unit-test `cookieSetParamsForMirror` (domain/path/secure/httpOnly/expirationDate mapping; non-app-origin cookies dropped).
- [ ] Commit: `feat(desktop): mirror session cookies into the collaborative partition`.

### Slice 4 — Webview IPC bridge (task 2, coordination-only per D1)
- [ ] Extend `apps/desktop/src/preload/webview.ts`: `electronWebview` gains `onHostMessage(cb)` (`ipcRenderer.on(CHANNEL)`) + `sendToHost(msg)` (`ipcRenderer.sendToHost(CHANNEL, msg)`), typed via `@kinetiks/types` desktop bridge (`KinetiksWebviewBridge`). contextIsolation-safe (structured-clone payloads only).
- [ ] Embed-side `usePanelBridge()` in `apps/id` embed: picks the postMessage guest bridge (web) or the `electronWebview` IPC guest bridge (desktop); `EmbedSurface` uses it for the `ready` handshake + inbound `focus`/`delegate`, replacing the inline postMessage. Collaborative components unchanged.
- [ ] Host side: `PanelFrame` wires `createWebviewHostBridge`/`createPostMessageHostBridge` and listens for `ready`.
- [ ] Commit: `feat(desktop): webview host↔guest coordination bridge`.

### Slice 5 — Multi-app on desktop + graceful degradation (§10.4, task 4/5)
- [ ] Breadcrumb-driven app switch swaps the active frame via the LRU (warm); side-by-side renders two frames (two webviews on desktop). Verify the LRU keeps both side-by-side frames pinned.
- [ ] Graceful degradation (task 5): non-desktop or narrow viewport falls back to the existing iframe slide-over; `PanelFrame` already picks iframe off-desktop, and narrow viewports keep the single-frame slide-over from 8.2.
- [ ] Commit: `feat(panel): multi-app webview swap + side-by-side on desktop`.

### Slice 6 — Tests
- [ ] LRU (`frame-cache`): ≤3, eviction order, active/partner pinned, re-touch.
- [ ] Panel-message contract: envelope validation, origin/source rejection, each message type.
- [ ] Cookie mirror: `cookieSetParamsForMirror` mapping + app-origin filter.
- [ ] Frame selection: desktop→webview / web→iframe; URL building.
- [ ] Commit: `test(desktop): LRU + panel-message contract + cookie mirror`.

---

## Cross-cutting (every slice)

- **Security:** the `persist:collaborative` partition stays hardened (8.1); the mirror copies only app-origin cookies and never weakens the partition's permission/navigation locks. No secrets logged. The webview keeps `nodeIntegration:false` + `contextIsolation:true` (main-enforced); the guest bridge passes structured-clone-safe payloads only.
- **Transport abstraction:** one `PanelMessage`/`PanelBridge` contract, two adapters (postMessage / webview IPC); the collaborative components (`PresenceSurface`, annotations, undo, task drawer, approvals) are byte-for-byte unchanged.
- **Tokens / a11y:** `PanelFrame` skeleton + frames use `--kt-*` tokens and the existing `aria-busy`/`aria-live` loading pattern; light + dark.
- **Observability:** desktop main errors via `captureDesktopException` (8.1); renderer errors via the canonical Sentry helper; no `console.log`.
- **No new DB tables / migrations.** 8.7 is desktop + transport plumbing on top of the existing embed APIs.

---

## Verification & Definition of Done

**Verifiable in this environment (will be done):**
- `pnpm --filter @kinetiks/desktop type-check`, `--filter @kinetiks/id type-check`, `--filter @kinetiks/collaborative type-check` clean; lint clean; unit tests pass (LRU, contract, cookie mirror, frame selection).
- `PanelFrame` selects webview on desktop / iframe on web; AppPanel keeps ≤3 frames warm with LRU eviction (unit-level); multi-app swap + side-by-side render; non-desktop/narrow degrade to the iframe slide-over.
- Security substrate + session-mirror code reviewed (adversarial multi-agent review — IPC/security/concurrency is risk-qualifying per the CLAUDE.md tiered-review standard).

**Deferred to a machine with a display / Phase 8.8 (runtime, honestly flagged):**
- Live desktop launch opening the reference surface in a webview; observed ≤3 cached webviews with LRU eviction (memory check); presence/annotations/undo round-trip latency <150ms; real cookie sharing verified in a running webview; packaged-app smoke. These need a packaged/running Electron app (no display here) and are the natural home of the 8.8 hardening + E2E phase. The code is built and unit-tested to be correct; only live runtime numbers are deferred.

This split is honest and consistent with the program's standing note that no E2E/Playwright layer exists yet (8.8 stands it up). No DoD item is silently skipped — the runtime-only items are named and routed to 8.8.
