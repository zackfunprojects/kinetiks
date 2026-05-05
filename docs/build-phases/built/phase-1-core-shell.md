# Phase 1: Core Shell Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform apps/id from a sidebar-nav dashboard into the three-tab Kinetiks app (Chat | Analytics | Cortex), with Electron desktop app scaffold.

**Architecture:** Restructure the Next.js app router from `(dashboard)/` with flat sidebar pages to `(app)/` with three top-level tabs. Chat is the default route with a left sidebar toggling between thread history and approvals. Cortex has internal sub-navigation. Analytics is full-width. Settings live in a modal overlay. The Electron app wraps this web app.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS 4, Electron, Supabase

**Spec References:**
- `docs/specs/kinetiks-product-spec-v3.md` — Sections 4 (Desktop App), 5 (Chat Tab), 7 (Analytics Tab), 8 (Cortex Tab), 9 (Settings Modal)
- `CLAUDE.md` — Navigation & Application Architecture, apps/id/ Directory Structure, Design System

**Architectural Principles (apply to every task):**
- Every new module exports a clean interface. No reaching into another module's internals.
- All data fetching in server components. Client components receive props or use hooks that call API routes.
- Every component file under 200 lines. If it's growing beyond that, split it.
- Dark mode support from the start — use CSS variables or Tailwind dark: prefix on every color.

---

## File Structure

This is the target structure after Phase 1 completes. Tasks below build toward this.

```
apps/id/src/
  app/
    (auth)/                           # Unchanged — login, signup, callback
      login/page.tsx
      signup/page.tsx
      callback/route.ts
    (app)/                            # NEW — replaces (dashboard)/
      layout.tsx                      # App shell: top tab bar + settings avatar + modal mount
      chat/
        layout.tsx                    # Chat layout: left sidebar + main area
        page.tsx                      # Default: new chat or most recent thread
        [threadId]/page.tsx           # Specific thread view
      analytics/
        layout.tsx                    # Full-width layout, no sidebar
        page.tsx                      # Placeholder dashboard (populated in Phase 5)
      cortex/
        layout.tsx                    # Left sub-nav + main content area
        identity/page.tsx             # Context Structure viewer (migrated from context/page.tsx)
        identity/[layer]/page.tsx     # Per-layer detail (migrated from context/[layer]/page.tsx)
        goals/page.tsx                # Placeholder (populated in Phase 3)
        integrations/page.tsx         # Combined: apps + connections + imports (migrated + restructured)
        ledger/page.tsx               # Learning Ledger (migrated from ledger/page.tsx)
    onboarding/page.tsx               # Unchanged
    setup/page.tsx                    # NEW — Kinetiks setup flow (name system, connect email/Slack)
    api/                              # Unchanged — all existing API routes stay
  components/
    app-shell/                        # NEW — top-level app frame
      AppShell.tsx                    # The outer frame: tab bar + content area
      TabBar.tsx                      # Chat | Analytics | Cortex tabs + settings avatar
      SettingsModal.tsx               # Modal overlay for account/billing/etc
      SettingsNav.tsx                 # Navigation within the settings modal
    chat/                             # NEW (partially migrated from marcus/)
      ChatLayout.tsx                  # Sidebar + main area container
      ChatSidebar.tsx                 # Left sidebar with toggle (threads / approvals)
      ThreadList.tsx                  # Thread history list
      ApprovalPanel.tsx               # Approval queue placeholder (populated in Phase 2)
      SidebarToggle.tsx               # Toggle button between threads and approvals
      ChatArea.tsx                    # Main conversation area (migrated from MarcusChat)
      MessageBubble.tsx               # Message rendering (migrated)
      MessageInput.tsx                # Input area (migrated)
    cortex/                           # NEW
      CortexLayout.tsx                # Sub-nav + content area container
      CortexNav.tsx                   # Left sub-navigation (Identity, Goals, Integrations, Ledger)
    analytics/                        # NEW
      AnalyticsPlaceholder.tsx        # Placeholder for Phase 5
    settings/                         # NEW
      AccountSettings.tsx
      OrgSettings.tsx
      BillingSettings.tsx
      ApiKeySettings.tsx
      NotificationSettings.tsx
      DangerZone.tsx
    (existing components)             # Retain: onboarding/, context/, billing/ (refactored into settings)

apps/desktop/                         # NEW — Electron wrapper
  src/
    main/index.ts                     # Electron main process
    main/tray.ts                      # System tray
    main/notifications.ts             # Native notification bridge
    preload/index.ts                  # Preload script
  electron-builder.yml
  package.json
  tsconfig.json
```

---

## Database Changes

**Migration: Add system identity fields to kinetiks_accounts**

```sql
ALTER TABLE kinetiks_accounts
  ADD COLUMN IF NOT EXISTS system_name text,
  ADD COLUMN IF NOT EXISTS kinetiks_connected boolean DEFAULT false;
```

No new tables in Phase 1. The `kinetiks_system_identity` table comes in Phase 6. Approval and goal tables come in their respective phases.

---

## Task 1: Route Structure and App Shell

Create the new route structure and the top-level app shell component.

**Files to create:**
- `apps/id/src/app/(app)/layout.tsx`
- `apps/id/src/components/app-shell/AppShell.tsx`
- `apps/id/src/components/app-shell/TabBar.tsx`

**What these do:**

`(app)/layout.tsx` is the authenticated layout. It checks the session (same as current `(dashboard)/layout.tsx`), renders `AppShell`, and provides the tab routing context.

`AppShell.tsx` is the outer frame. Top bar with `TabBar`, then a content area that renders the active tab's page via `children`.

`TabBar.tsx` renders three tabs: Chat | Analytics | Cortex. Uses Next.js `usePathname()` to highlight the active tab. Includes a settings avatar button on the right side. Tab links: `/chat`, `/analytics`, `/cortex/identity` (default Cortex sub-page).

**Design:**
- Tab bar height: 48px, fixed to top
- Tabs styled like Claude desktop: clean, minimal, subtle active indicator
- Active tab: text color primary, subtle underline or background
- Settings avatar: right-aligned, circular, triggers settings modal
- Dark mode: use CSS variables for all colors

**Steps:**
- [ ] Create `(app)/layout.tsx` with auth check (adapt from existing `(dashboard)/layout.tsx`)
- [ ] Create `AppShell.tsx` — top bar + content area
- [ ] Create `TabBar.tsx` — three tabs with active state + settings trigger
- [ ] Verify: navigating to `/chat`, `/analytics`, `/cortex` renders the correct tab active state
- [ ] Commit: `feat: add app shell with three-tab layout`

---

## Task 2: Chat Tab Layout

Create the Chat tab structure with the left sidebar (thread list + approvals toggle) and main conversation area.

**Files to create:**
- `apps/id/src/app/(app)/chat/layout.tsx`
- `apps/id/src/app/(app)/chat/page.tsx`
- `apps/id/src/app/(app)/chat/[threadId]/page.tsx`
- `apps/id/src/components/chat/ChatLayout.tsx`
- `apps/id/src/components/chat/ChatSidebar.tsx`
- `apps/id/src/components/chat/SidebarToggle.tsx`
- `apps/id/src/components/chat/ThreadList.tsx`
- `apps/id/src/components/chat/ApprovalPanel.tsx` (placeholder)

**Files to migrate:**
- `MarcusChat.tsx` → `ChatArea.tsx` (rename + adapt)
- `ThreadSidebar.tsx` → inform `ThreadList.tsx` design
- `MessageBubble.tsx` → keep, import into new structure
- `MessageInput.tsx` → keep or adapt

**What these do:**

`chat/layout.tsx` renders `ChatLayout` which is a horizontal split: left sidebar (280px) + main area.

`ChatSidebar.tsx` has a toggle at the top (like Claude desktop's Projects toggle) switching between `ThreadList` and `ApprovalPanel`. Default is ThreadList.

`SidebarToggle.tsx` is the toggle control: two buttons "Chats" and "Approvals" with a count badge on Approvals.

`ThreadList.tsx` shows thread history: new chat button at top, then threads sorted by recency. Each thread shows title, timestamp, preview text. Clicking navigates to `/chat/[threadId]`.

`ApprovalPanel.tsx` in Phase 1 is a placeholder with text "Approvals will appear here" and an empty state illustration. It gets populated in Phase 2.

`chat/page.tsx` (default route) either shows the most recent thread or a new chat state.

`chat/[threadId]/page.tsx` loads a specific thread and renders the conversation.

**The ChatArea component (migrated from MarcusChat):**
- Retains existing Marcus conversation functionality
- Message list with streaming support
- MessageBubble for each message
- MessageInput at the bottom
- All existing Marcus API integration stays (the Chat tab is Marcus, just promoted)

**Design:**
- Sidebar: 280px width, collapsible on mobile
- Toggle: pill-shaped, two segments, subtle animation on switch
- Thread list: clean, minimal, like Claude desktop's chat list
- Main area: full remaining width, messages centered with max-width ~720px
- Input: bottom of main area, multi-line, file attachment button

**Steps:**
- [ ] Create `ChatLayout.tsx` with sidebar + main area split
- [ ] Create `SidebarToggle.tsx` with Chats / Approvals toggle
- [ ] Create `ThreadList.tsx` with thread data fetching from `kinetiks_marcus_threads`
- [ ] Create `ApprovalPanel.tsx` as placeholder
- [ ] Create `ChatSidebar.tsx` composing toggle + active panel
- [ ] Migrate existing Marcus chat components into `ChatArea.tsx`
- [ ] Create `chat/layout.tsx` rendering `ChatLayout`
- [ ] Create `chat/page.tsx` — default chat view
- [ ] Create `chat/[threadId]/page.tsx` — specific thread view
- [ ] Verify: thread list loads, clicking a thread shows the conversation, toggle switches panels
- [ ] Verify: existing Marcus chat functionality works (send message, receive streaming response)
- [ ] Commit: `feat: add Chat tab with sidebar, thread list, and conversation area`

---

## Task 3: Cortex Tab Layout

Create the Cortex tab with internal sub-navigation and migrate existing pages.

**Files to create:**
- `apps/id/src/app/(app)/cortex/layout.tsx`
- `apps/id/src/app/(app)/cortex/identity/page.tsx`
- `apps/id/src/app/(app)/cortex/identity/[layer]/page.tsx`
- `apps/id/src/app/(app)/cortex/goals/page.tsx` (placeholder)
- `apps/id/src/app/(app)/cortex/integrations/page.tsx`
- `apps/id/src/app/(app)/cortex/ledger/page.tsx`
- `apps/id/src/components/cortex/CortexLayout.tsx`
- `apps/id/src/components/cortex/CortexNav.tsx`

**Files to migrate/adapt:**
- Existing `context/page.tsx` → `cortex/identity/page.tsx`
- Existing `context/[layer]/page.tsx` → `cortex/identity/[layer]/page.tsx`
- Existing `ledger/page.tsx` → `cortex/ledger/page.tsx`
- Existing `connections/page.tsx` + `apps/page.tsx` + `imports/page.tsx` → combined into `cortex/integrations/page.tsx`

**What these do:**

`cortex/layout.tsx` renders `CortexLayout` — a horizontal split: left sub-nav (220px) + main area.

`CortexNav.tsx` renders four navigation items: Identity, Goals, Integrations, Ledger. Uses `usePathname()` for active state. Links to `/cortex/identity`, `/cortex/goals`, `/cortex/integrations`, `/cortex/ledger`.

`identity/page.tsx` is the Context Structure viewer — migrated from the existing context page. Shows all 8 layers with confidence scores.

`goals/page.tsx` is a placeholder: "Goals will be configured here" with empty state. Populated in Phase 3.

`integrations/page.tsx` combines the existing connections, apps management, and imports pages into a single view with sections. This is a restructuring of existing UI, not new functionality.

`ledger/page.tsx` is the Learning Ledger — migrated from existing page.

**Design:**
- Sub-nav: 220px, left side, vertical list with icons
- Active item: background highlight + text color primary
- Main area: full remaining width with comfortable padding
- The sub-nav is not collapsible (Cortex always shows it)

**Steps:**
- [ ] Create `CortexNav.tsx` with four nav items and active state
- [ ] Create `CortexLayout.tsx` with sub-nav + main area split
- [ ] Create `cortex/layout.tsx` rendering `CortexLayout`
- [ ] Migrate context viewer to `cortex/identity/page.tsx`
- [ ] Migrate layer detail to `cortex/identity/[layer]/page.tsx`
- [ ] Create `cortex/goals/page.tsx` as placeholder
- [ ] Build `cortex/integrations/page.tsx` combining connections + apps + imports
- [ ] Migrate ledger to `cortex/ledger/page.tsx`
- [ ] Verify: all four sub-nav items work, existing data displays correctly
- [ ] Commit: `feat: add Cortex tab with sub-navigation and migrated pages`

---

## Task 4: Analytics Tab Placeholder

Create the Analytics tab as a placeholder for Phase 5.

**Files to create:**
- `apps/id/src/app/(app)/analytics/layout.tsx`
- `apps/id/src/app/(app)/analytics/page.tsx`
- `apps/id/src/components/analytics/AnalyticsPlaceholder.tsx`

**What these do:**

`analytics/layout.tsx` is a simple full-width layout — no sidebar, no sub-nav.

`analytics/page.tsx` renders the placeholder.

`AnalyticsPlaceholder.tsx` shows an empty state: "Analytics dashboard coming soon. The Oracle is being built." with a relevant illustration or icon. This should look intentional, not broken.

**Steps:**
- [ ] Create `analytics/layout.tsx` — full-width, minimal
- [ ] Create `AnalyticsPlaceholder.tsx` with styled empty state
- [ ] Create `analytics/page.tsx` rendering the placeholder
- [ ] Verify: Analytics tab renders cleanly with the placeholder
- [ ] Commit: `feat: add Analytics tab placeholder`

---

## Task 5: Settings Modal

Create the settings modal that opens over any tab.

**Files to create:**
- `apps/id/src/components/app-shell/SettingsModal.tsx`
- `apps/id/src/components/app-shell/SettingsNav.tsx`
- `apps/id/src/components/settings/AccountSettings.tsx`
- `apps/id/src/components/settings/BillingSettings.tsx`
- `apps/id/src/components/settings/ApiKeySettings.tsx`
- `apps/id/src/components/settings/NotificationSettings.tsx`
- `apps/id/src/components/settings/DangerZone.tsx`

**Files to migrate:**
- Existing `billing/` components → `settings/BillingSettings.tsx`
- Existing `settings/` page content → `settings/AccountSettings.tsx`

**What these do:**

`SettingsModal.tsx` is a full-screen modal overlay (like Claude desktop's settings). Triggered by the avatar button in `TabBar`. Uses a portal to render above everything. Escape key and overlay click close it. Has its own internal navigation via `SettingsNav`.

`SettingsNav.tsx` is a left-side nav within the modal: Account, Billing, API Keys, Notifications, Danger Zone. (Organization and Team/Seats sections added when multi-user is built.)

Each settings section is a self-contained component that handles its own data fetching and state.

**Design:**
- Modal: full viewport with slight margin (like Claude desktop), glass/blur background overlay
- Internal nav: left side, 200px, same pattern as Cortex sub-nav
- Content area: scrollable, comfortable padding
- Close button: top-right X

**Steps:**
- [ ] Create `SettingsModal.tsx` with overlay, portal rendering, open/close state
- [ ] Create `SettingsNav.tsx` with section navigation
- [ ] Migrate account settings into `AccountSettings.tsx`
- [ ] Migrate billing into `BillingSettings.tsx`
- [ ] Create `ApiKeySettings.tsx` (may reuse existing if it exists)
- [ ] Create `NotificationSettings.tsx` — preferences UI for brief schedule, channels, quiet hours
- [ ] Create `DangerZone.tsx` — delete account, export data
- [ ] Wire settings avatar in `TabBar` to open `SettingsModal`
- [ ] Verify: modal opens/closes, all sections render, existing billing/account functionality works
- [ ] Commit: `feat: add settings modal with migrated account and billing sections`

---

## Task 6: Database Migration — System Identity Fields

Add the `system_name` and `kinetiks_connected` fields to `kinetiks_accounts`.

**Files to create:**
- `supabase/migrations/000XX_system_identity_fields.sql`

**Migration SQL:**
```sql
ALTER TABLE kinetiks_accounts
  ADD COLUMN IF NOT EXISTS system_name text,
  ADD COLUMN IF NOT EXISTS kinetiks_connected boolean DEFAULT false;

COMMENT ON COLUMN kinetiks_accounts.system_name IS 'User-chosen name for their GTM system (Kit, Archer, etc.)';
COMMENT ON COLUMN kinetiks_accounts.kinetiks_connected IS 'Whether the user has completed full Kinetiks setup (named system, connected email/Slack)';
```

**Steps:**
- [ ] Create migration file with the next sequential number
- [ ] Run migration locally: `supabase db push` or `supabase migration up`
- [ ] Verify: fields exist in the accounts table
- [ ] Update `@kinetiks/types` to include the new fields in the account type
- [ ] Commit: `feat: add system_name and kinetiks_connected to accounts`

---

## Task 7: Setup Flow Page

Create the Kinetiks setup flow for users upgrading from standalone to full Kinetiks.

**Files to create:**
- `apps/id/src/app/(app)/setup/page.tsx`
- `apps/id/src/components/setup/SetupFlow.tsx`
- `apps/id/src/components/setup/NameSystem.tsx`
- `apps/id/src/components/setup/SetupComplete.tsx`

**What these do:**

`setup/page.tsx` renders the setup flow. This is only shown to users who don't yet have `kinetiks_connected = true`.

`SetupFlow.tsx` manages the multi-step flow: Name System → (email and Slack steps are placeholders until Phase 6) → Complete.

`NameSystem.tsx` is the "Name your GTM system" step. Freeform text input with live previews showing how the name appears in Chat, Slack, and Email contexts. Saves to `kinetiks_accounts.system_name`.

`SetupComplete.tsx` congratulates the user, sets `kinetiks_connected = true`, and redirects to the Chat tab.

**Note:** Email connection (ConnectEmail) and Slack connection (ConnectSlack) steps are built in Phase 6. The Phase 1 setup flow skips directly from naming to complete, with those steps marked as "coming soon" or simply omitted until Phase 6.

**Steps:**
- [ ] Create `NameSystem.tsx` with text input, live preview, and save logic
- [ ] Create `SetupComplete.tsx` with redirect to Chat
- [ ] Create `SetupFlow.tsx` orchestrating the steps
- [ ] Create `setup/page.tsx` with auth guard (redirect if already connected)
- [ ] Verify: user can name their system, name saves to DB, redirects to Chat
- [ ] Commit: `feat: add Kinetiks setup flow with system naming`

---

## Task 8: Remove Old Dashboard Layout

Remove the old `(dashboard)/` route group and redirect old routes to new locations.

**Files to modify:**
- Remove or rename `apps/id/src/app/(dashboard)/` directory
- Add redirects for old routes

**What this does:**

The old sidebar-based dashboard layout is replaced by the tab-based layout. Old routes redirect:

- `/` → `/chat` (the new default)
- `/context` → `/cortex/identity`
- `/context/[layer]` → `/cortex/identity/[layer]`
- `/ledger` → `/cortex/ledger`
- `/connections` → `/cortex/integrations`
- `/imports` → `/cortex/integrations`
- `/apps` → `/cortex/integrations`
- `/billing` → opens settings modal (handled client-side)
- `/settings` → opens settings modal (handled client-side)
- `/marcus` → `/chat`

**Steps:**
- [ ] Add Next.js redirects in `next.config.js` for all old routes
- [ ] Remove the old `(dashboard)/layout.tsx` (sidebar layout)
- [ ] Remove old page files that have been migrated (don't delete until verified)
- [ ] Verify: all old bookmarked URLs redirect correctly
- [ ] Verify: no broken links within the app
- [ ] Commit: `refactor: remove old dashboard layout, redirect old routes`

---

## Task 9: Default Route and Auth Flow

Set up the default route behavior and auth redirects.

**What this does:**

- Unauthenticated users hitting any `(app)/` route redirect to `/login`
- Authenticated users hitting `/` redirect to `/chat`
- Users with `kinetiks_connected = false` who hit `/chat` are redirected to `/setup` first
- The `?from=` parameter on signup still works and is stored in `kinetiks_accounts.from_app`
- After onboarding (existing flow), users without `kinetiks_connected` go to their `from_app` URL or to `/setup`

**Steps:**
- [ ] Update middleware to redirect `/` to `/chat` for authenticated users
- [ ] Add setup guard: if `kinetiks_connected = false` and user hits `/chat`, redirect to `/setup`
- [ ] Verify: full auth flow works (login → redirect → correct landing page)
- [ ] Verify: onboarding completion redirects correctly based on `from_app`
- [ ] Commit: `feat: configure default routes and auth flow for new tab layout`

---

## Task 10: Electron App Scaffold

Create the Electron wrapper for the desktop app.

**Files to create:**
- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json`
- `apps/desktop/electron-builder.yml`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/tray.ts`
- `apps/desktop/src/main/notifications.ts`
- `apps/desktop/src/preload/index.ts`

**What these do:**

`main/index.ts` creates an Electron BrowserWindow that loads `https://kinetiks.ai` (production) or `http://localhost:3000` (dev). Sets up the window with appropriate size, titlebar style, and web preferences.

`main/tray.ts` creates a system tray icon with a menu: Show/Hide window, Quit. The app stays in the tray when the window is closed.

`main/notifications.ts` bridges native notifications. The web app can call `window.electron.showNotification(title, body)` via the preload script.

`preload/index.ts` exposes a safe API on `window.electron`:
- `showNotification(title: string, body: string): void`
- `isDesktop: boolean` (so the web app knows it's in Electron)
- `platform: string` (macOS, Windows, Linux)

`electron-builder.yml` configures builds for macOS (.dmg), Windows (.exe/.msi), Linux (.AppImage).

**Note:** Auto-update, deep links, and advanced keyboard shortcuts come in later phases. Phase 1 is a working shell.

**Steps:**
- [ ] Create `apps/desktop/package.json` with Electron + electron-builder dependencies
- [ ] Create `apps/desktop/tsconfig.json`
- [ ] Create `main/index.ts` — window creation, URL loading, basic window management
- [ ] Create `preload/index.ts` — expose `window.electron` API
- [ ] Create `main/tray.ts` — system tray with Show/Hide/Quit
- [ ] Create `main/notifications.ts` — native notification bridge
- [ ] Create `electron-builder.yml` — build config for all platforms
- [ ] Add dev script: `"dev": "electron ."` that loads localhost:3000
- [ ] Verify: `pnpm --filter desktop dev` opens Electron window with the web app
- [ ] Verify: system tray works, closing window hides to tray
- [ ] Commit: `feat: add Electron desktop app scaffold`

---

## Task 11: End-to-End Verification

Verify the complete Phase 1 restructure works.

**Verification checklist:**
- [ ] App loads at `/chat` by default for authenticated users
- [ ] Three tabs work: Chat, Analytics, Cortex — each renders its content
- [ ] Chat tab: thread list loads, clicking a thread shows messages, sending a message works (Marcus responds)
- [ ] Chat sidebar: toggle switches between thread list and approval placeholder
- [ ] Cortex tab: sub-nav works for Identity, Goals (placeholder), Integrations, Ledger
- [ ] Cortex Identity: 8-layer Context Structure displays with confidence scores
- [ ] Cortex Integrations: apps, connections, and imports display
- [ ] Cortex Ledger: ledger entries display
- [ ] Analytics: placeholder renders cleanly
- [ ] Settings modal: opens from avatar, all sections accessible, billing and account settings work
- [ ] Old routes: all redirect correctly to new locations
- [ ] Setup flow: naming the system works and saves to DB
- [ ] Electron: desktop app opens and loads the web app
- [ ] Dark mode: all new components respect dark mode
- [ ] Mobile: responsive behavior is reasonable (sidebar collapses, tabs stack or scroll)
- [ ] `pnpm build` passes with no errors
- [ ] Commit: `chore: phase 1 complete — core shell restructure verified`
