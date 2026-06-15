# CLAUDE.md - apps/id (Kinetiks Core)

Per-app guide for `apps/id`, the Kinetiks Core app served at
**`https://id.kinetiks.ai`** (NOT `kinetiks.ai`, which is the marketing apex
and 404s `/api`). This is the **only app in active build scope**.

**Read the root `../../CLAUDE.md` first** for all cross-cutting rules (TypeScript,
RLS, state machines, Approval System, Marcus engine, Authority Grants, Synapse,
AI router, Sentry shape, design tokens, git workflow, Definition of Done). This
file only documents what is specific to `apps/id`; it never overrides the root.

---

## What this app is

The three-tab control plane (Chat, Analytics, Cortex) where a user runs their
GTM operation by talking to their named AI system. It also hosts every
platform-layer service the suite plugs into: the five Cortex Operators, the
Approval System, the Agent Runtime, the Tool/Pattern-Type/Action-Class
registries, the Synapse ingest endpoints, the Nango sync handlers, the comms
layer, and the `/admin` operator console.

## Route structure (`src/app/`)

- **`(app)/`** — the authenticated shell: `chat`, `analytics`, `cortex/*`
  (the seven Cortex sections: identity, goals, budget, patterns, authority,
  integrations, ledger). Approvals live in the Chat sidebar; Settings is a modal.
- **`(auth)/`** — login / auth callback.
- **`onboarding/`** — the setup flow (Cartographer intake + the system-naming
  step + the Permissions/default-standing-grants step).
- **`admin/`** — the operator console, gated on membership in `kinetiks_admins`
  (unauth → `/login`, non-admin → 404). Model management + flip-proposal review.
- **`api/`** — webhooks, public endpoints, MCP, Synapse ingest, Pattern
  export/import, the internal (`INTERNAL_SERVICE_SECRET`-gated) cron callbacks,
  and `health` (env presence + the JWT `account_id` claim assertion).

Every server-fetching segment has `loading.tsx` / `error.tsx`.

## `src/lib/` subsystems

- **Operators:** `cartographer/`, `archivist/`, `marcus/`, `oracle/`, plus the
  Authority Agent under `cortex/authority/` and `operators/`. Only the Archivist
  executor is wired to the Workflow dispatcher (`workflows/archivist-maintenance.ts`);
  Cartographer/Marcus/Oracle executors are registration-only stubs (run via their
  original paths). See "Deferred-by-design" in the root doc.
- **Platform:** `runtime/` (the app-side Agent Runtime seams — see
  `runtime/runtime-boot.ts`, a frequent merge-conflict point), `tools/`
  (`registry-boot.ts` registers the tools), `approvals/`, `cortex/` (context
  readers, patterns, authority, validate), `action-classes/`, `manifest/`.
- **Data + comms:** `integrations/nango/handlers/` (the ten provider sync
  handlers, side-imported at boot), `connections/` (system OAuth: Workspace,
  Slack, calendar), `comms/`, `email/`, `slack/`, `calendar/`, `webhooks/`.
- **Marcus engine:** `marcus/` — `pre-analysis.ts` (the evidence brief, built by
  the injected `claudeHaiku` seam), `engine.ts`, `tool-decision.ts`, `memory.ts`,
  `prompts/`. The v2 architecture rules in the root doc are non-optional.
- **Fixtures:** `fixtures/` — the suite-app stand-in, gated by
  `KINETIKS_FIXTURES_ENABLED`. Lives only here, never in `packages/*`.
- **Cross-cutting:** `ai/` (always via `@kinetiks/ai/router`), `observability/`
  (`captureException` canonical Sentry helper), `auth/` (`requireAuth` →
  `resolveAuth`; `account_id` is the DB-resolved `kinetiks_accounts.id`),
  `supabase/` (server / admin clients), `state-machines-init.ts`, `cortex-init.ts`.

## apps/id-specific gotchas

- **Instrumentation split (root Lesson 9):** `src/instrumentation.ts` is a tiny
  shim with NO Node-only imports (it's bundled for both Edge and Node). All
  platform wiring is in `src/instrumentation-node.ts`, loaded only inside
  `if (process.env.NEXT_RUNTIME === "nodejs")`. Keep Node-only SDKs out of the
  shim; use `node:crypto` / `node:fs` (never bare), and `/* webpackIgnore: true */`
  on lazily-loaded native SDKs.
- **Client bundles:** import `@kinetiks/lib/format` (subpath), not the package
  barrel, in client code — the barrel pulls `node:crypto` into the bundle.
- **JWT RLS:** RLS resolves the account via `public.kinetiks_account_id()`
  (`coalesce(JWT account_id claim, the auth.uid() subquery)`; migrations
  00084-00086). `/api/health` reports `jwt.claim_matches_db` for session auth.
- **Tests:** Vitest at `vitest.config.ts` (`pnpm --filter @kinetiks/id test`);
  pgTAP RLS suites live at the repo root (`supabase/tests/`), not here.

## Current state

Phases 1-7 complete. See the root `CLAUDE.md` "Current State" table for the
authoritative component status, the deferred-by-design list, and the known
follow-ups.
