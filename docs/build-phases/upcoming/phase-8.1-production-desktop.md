# Phase 8.1 — Production Desktop Foundations (Execution Plan)

> Foundational phase of the Collaborative Workspace program (`collaborative-workspace-plan.md`).
> Turns the 200-LOC Electron skeleton into a production-grade, distributable, observable, deep-linkable shell — the substrate the webview collaborative experience (8.7) requires. No collaborative UI yet.
> **Sub-skill:** subagent-driven-development / executing-plans. Each slice = one branch commit, `tsc` clean before the next.

**Spec refs:** collaborative-workspace-spec §3.1/§4.4/§14.3; spec-addendum-chat-ux §B.4; CLAUDE.md DoD (Sentry on desktop, env discipline).

**Branch:** `collab/phase-8.1-production-desktop`.

---

## Grounding (current shell)

- `apps/desktop/src/main/index.ts` — single `BrowserWindow`, **`APP_URL = "https://kinetiks.ai"` in prod (BUG: 404s; must be `id.kinetiks.ai`)**, `titleBarStyle: hiddenInset`, secure (`contextIsolation: true`, `nodeIntegration: false`), navigation guard to APP_ORIGIN, hide-to-tray.
- `preload/index.ts` — exposes `window.electron` = `{ isDesktop, platform, showNotification }` only.
- `tray.ts`, `notifications.ts` (ipcMain `show-notification`, ignores `deepLink`), `window-state.ts` (bounds persistence). All solid.
- `packages/types/src/desktop.ts` — `KinetiksDesktopBridge` + `DesktopNotification.deepLink?` (already anticipated: "Routed through the kinetiks:// deep-link handler in a later phase").
- `package.json` — `electron-updater` dep present but **unwired**; scripts: dev/build (tsc) / package (electron-builder). **No `type-check` script.**
- `electron-builder.yml` — mac/win/linux targets, **no `publish` feed, no signing/notarize config.**
- Web consumer: `apps/id/src/lib/desktop/useIsDesktop.ts`; `apps/id/src/components/app-shell/DesktopNotificationBridge.tsx`.

---

## Slices (commit boundaries)

### Slice 1 — Prod-URL fix + env-driven origin + type-check script  ⚠️ CRITICAL (live bug)
- [ ] `main/index.ts`: prod `APP_URL` → `https://id.kinetiks.ai` (was `kinetiks.ai`, which 404s). Make it env-driven (`KINETIKS_DESKTOP_APP_URL` override, default prod id origin / `localhost:3000` dev). Keep the same-origin navigation guard.
- [ ] Add `"type-check": "tsc --noEmit"` to `apps/desktop/package.json` so the shell joins `turbo type-check`.
- [ ] Commit: `fix(desktop): load id.kinetiks.ai in prod + env-driven origin + type-check`.

### Slice 2 — Single-instance lock + `kinetiks://` protocol + deep-link routing
- [ ] `app.requestSingleInstanceLock()`; on `second-instance`, focus the window and route any `kinetiks://` arg.
- [ ] `setAsDefaultProtocolClient("kinetiks")` (+ macOS `open-url`, Windows/Linux argv). New `main/protocol.ts`: parse `kinetiks://approval/{id}`, `kinetiks://thread/{id}`, `kinetiks://embed/{app}/{entity}` → in-app path; deliver to the renderer (navigate same-origin) once ready, queue if not.
- [ ] Wire `DesktopNotification.deepLink`: clicking a native notification routes through the protocol handler.
- [ ] Commit: `feat(desktop): single-instance lock + kinetiks:// protocol + deep-link routing`.

### Slice 3 — Crash reporting + observability (Sentry main/preload + PostHog)
- [ ] Add `@sentry/electron` dep. New `main/observability.ts`: init Sentry in main (canonical tags `app:'desktop'`), preload init, `process.on('uncaughtException'/'unhandledRejection')`. DSN via env (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`); no-op when unset (mirrors `@/lib/observability/sentry`). No PII.
- [ ] PostHog desktop lifecycle events (launch, update-applied) — best-effort, gated on key.
- [ ] Commit: `feat(desktop): Sentry crash reporting in main + preload`.

### Slice 4 — Native application menu + keyboard accelerators (chat-ux §B.4)
- [ ] `main/menu.ts`: `Menu.buildFromTemplate` with standard roles (App/Edit/View/Window) + Kinetiks items. Accelerators: `Cmd+1/2/3` (tab switch), `Cmd+K` (palette), `Cmd+N` (new thread), `Cmd+Shift+A` (approvals), `Cmd+,` (settings) → emit IPC to the renderer (`kinetiks:menu` channel).
- [ ] apps/id: a `useDesktopMenu` hook that subscribes and dispatches to the existing shell actions (tab nav, palette, etc.).
- [ ] Commit: `feat(desktop): native menu + keyboard accelerators wired to the shell`.

### Slice 5 — Typed secure IPC bridge expansion + session robustness
- [ ] Extend `KinetiksDesktopBridge` (in `@kinetiks/types`): `onDeepLink(cb)`, `onMenuAction(cb)`, `onUpdateStatus(cb)`, `applyUpdate()`, plus placeholders for presence/annotation/undo relay (filled in 8.7). Validate every IPC payload; `contextIsolation` stays on.
- [ ] Session: on auth-expiry signal from the renderer, surface a re-sign-in path (no silent logout); persist partition.
- [ ] Commit: `feat(desktop): typed IPC bridge (deep-link, menu, update) + session signal`.

### Slice 6 — Auto-update (electron-updater) + update flow  ⚠️ needs feed host
- [ ] `main/updater.ts`: `autoUpdater` check on launch + interval; emit `update-available` / `update-downloaded` over IPC → §16.2 "app update available" info toast in apps/id → `applyUpdate()` → `quitAndInstall`.
- [ ] `electron-builder.yml`: add a `publish` provider (GitHub Releases or generic/S3). **Human setup:** feed host + token. Document in `docs/operational/env-vars.md`.
- [ ] Commit: `feat(desktop): auto-update wiring + update-available flow`.

### Slice 7 — Webview security substrate (the 8.7 foundation)
- [ ] Enable `<webview>`/`BrowserView` with a hardened partition (`persist:collaborative`); dedicated webview preload mirroring the main bridge; `setWindowOpenHandler`, permission + CSP handlers; navigation lock to Kinetiks origins. (Multi-app manager + LRU is 8.7.)
- [ ] Commit: `feat(desktop): hardened webview substrate (partition, preload, permission handlers)`.

### Slice 8 — Custom titlebar chrome (the planned "Phase 2 titlebar")
- [ ] apps/id: traffic-light-aware draggable title region integrated with the three-tab shell; respects macOS vibrancy; only renders in desktop (`useIsDesktop`).
- [ ] Commit: `feat(desktop): custom titlebar chrome integrated with the shell`.

### Slice 9 — Code signing + notarization + distribution  ⚠️ needs certs
- [ ] `electron-builder.yml`: macOS `notarize` + hardened runtime + entitlements; Windows signing; (`afterSign` hook). **Human setup:** Apple Developer ID cert + `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`; Windows cert. Document all in `docs/operational/env-vars.md`; build/release notes.
- [ ] Commit: `chore(desktop): code signing + notarization config + release docs`.

---

## Phase 8.1 Definition of Done
- Packaged build launches, loads `id.kinetiks.ai`, single-instance enforced.
- `kinetiks://approval/{id}` opens the app to that approval (deep-link routing verified).
- A forced main-process throw reaches Sentry with `app:'desktop'`.
- Native menu + all accelerators fire and drive the shell.
- Auto-update checks against the feed and surfaces the update toast (once feed host configured).
- Webview substrate loads a same-origin `/embed` in a hardened partition.
- Signed + notarized artifact installs clean on macOS + Windows (once certs configured).
- `pnpm type-check --filter @kinetiks/desktop` + `--filter @kinetiks/id` clean.
- Infra-dependent items (feed host, certs, DSN) documented in `docs/operational/env-vars.md` with the exact env/secret names.
- No `apps/dm` paths staged; no `git add -A`.

**Verification note:** packaging (`electron-builder`) + live Electron run need Zack's certs/feed/DSN and a desktop session; those slices ship code + config + documented human-setup steps. Pure-shell slices (1–5, 7) verify via `tsc`.
