# Plan: Playwright / E2E test layer for apps/id

**Status:** Proposed (authored 2026-06-15). Scope: `apps/id` only.

## Why

The Definition of Done (root CLAUDE.md) names browser-level coverage of the
critical flows - "the cross-account isolation test is the one that must never
break" - and the 2026-05-29 audit flagged that **no E2E layer exists** (no
Playwright config, dependency, or specs). Today a PR is gated by `type-check` +
`lint` + ~824 Vitest unit tests, plus pgTAP RLS suites when it touches
`supabase/**`. That covers units and the DB tenant boundary, but nothing
exercises the app booted end-to-end: routing, middleware/auth, the SSE chat
stream, onboarding, and the approval/authority lifecycles through real HTTP.

This plan stands up Playwright in three phases, ordered highest-value-first and
cheapest-CI-first.

## What exists to build on

- **Vitest** (`apps/id/vitest.config.ts`, node env): pure-function / seam-mock
  tests. No DB, no browser. Stays as-is.
- **pgTAP** (`supabase/tests/`, `scripts/test-rls.sh`): RLS + state-machine +
  constraint suites against the local Supabase stack. `_setup.sql` has the
  reusable seeding helpers (`_kt_test_seed_account`, `_kt_test_set_auth_user`
  mirroring the custom-access-token hook, `_kt_test_clear_auth`). E2E reuses
  this stack and the seeding patterns.
- **CI** (`.github/workflows/`): `ci.yml` (every PR: type-check/lint/test),
  `rls-tests.yml` (boots Supabase with **pinned CLI 2.105.0** + `pg_prove`),
  `edge-functions-drift.yml`. E2E adds a 4th workflow, not a change to these.
- **`supabase/config.toml`** already enables the custom-access-token hook, so a
  locally-minted session carries the `account_id` claim exactly like prod -
  the JWT-claim RLS path is exercised, not just the fallback.
- **Fixture emitter** (`KINETIKS_FIXTURES_ENABLED=true`, `apps/id/src/lib/fixtures/`,
  `/api/internal/fixtures/{emit,cleanup}`): realistic Patterns + Ledger volume
  so Cortex/Patterns/Ledger pages render non-empty in E2E. `cleanup` archives
  (doesn't delete) for between-spec reset.

## Architecture decisions

- **Location:** `apps/id/playwright.config.ts`, specs in `apps/id/e2e/`,
  helpers in `apps/id/e2e/support/`. Add `@playwright/test` as an `apps/id`
  dev dependency + `e2e` / `e2e:ui` scripts. Keep E2E in its own workflow
  (`e2e.yml`) - it needs the Supabase stack + a built app and is much slower
  than `ci.yml`.
- **App boot:** Playwright `webServer` running `next build` + `next start` (port
  3000), **not** `next dev`. Build+start exercises the real Node/Edge boundary
  (root Lesson 9: the instrumentation split + Edge bundling only behave like
  prod under a real build); `dev` can mask Edge-bundle breakage.
- **Test DB:** the same local Supabase stack `rls-tests.yml` uses - `supabase
  start` (CLI **2.105.0**, matched to avoid the grant-default drift documented
  in `_setup.sql`) with all migrations applied. Point the booted app at it via
  env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_SERVICE_SECRET`, `KINETIKS_ENCRYPTION_KEY`,
  `KINETIKS_FIXTURES_ENABLED=true`, and a stub/real `ANTHROPIC_API_KEY`).
- **Auth - two strategies:**
  - **API-key path (default for backend/flow specs):** `resolve-auth.ts`
    accepts `Authorization: Bearer kntk_*` keys that resolve straight to an
    `AuthenticatedContext`, bypassing cookies. `/api/account/create` returns a
    `bootstrap_key` on first call. A fixture seeds two accounts (service-role,
    mirroring `_kt_test_seed_account`), mints keys, and drives every API-level
    flow with `request` calls - no browser. Permission tiers + rate limits are
    enforced on this path, so it is a faithful gate.
  - **Browser path (for UI specs):** a Playwright **setup project** that signs
    in once via `(auth)/login` (or programmatically sets the Supabase session
    cookie) and persists `storageState` per account. Middleware protects all
    non-`/api` routes; `/login /signup /callback /onboarding /developers /setup`
    are public. Locally `getCookieDomain` returns `undefined`, so storageState
    cookies work without domain juggling.

## Phase A - backend flow E2E via API keys (highest value, no browser)

Fast specs that drive real HTTP against the booted app with two seeded
accounts. Covers the safety-critical flows the DoD names, complementing (not
replacing) the pgTAP cross-tenant suites.

1. **Harness** (`apps/id/e2e/support/`): `seedAccount()` (service-role insert of
   `auth.users` + `kinetiks_accounts`), `mintApiKey()`, `apiClient(key)`,
   `resetFixtures()`. Two-account factory (Alice / Bob).
2. **Cross-account isolation** (must never break): as Bob, hit each
   account-scoped GET with one of Alice's resource ids -> expect 404/empty,
   never leakage. Covers chat threads, cortex/*, approvals, authority,
   patterns. This is the browser/HTTP-level mirror of the pgTAP cross-tenant
   suites.
3. **Approval lifecycle:** `/api/approvals/submit` -> `/api/approvals/action`
   (approve) -> assert state transition + Ledger row; reject path; the
   non-pending + cross-tenant 404 guards (already unit-tested in
   `approvals/action/route.test.ts` - here end-to-end through the DB).
4. **Authority pause/revoke:** create a grant -> `/api/cortex/authority/[id]/
   pause` then `/revoke` -> assert authority resolution returns null after
   pause/revoke, revoke is terminal, Ledger entries written.

Phase A needs the Supabase stack but no browser, so it is the cheapest to run
and the highest-confidence on the security-critical paths.

## Phase B - browser E2E (UI flows)

5. **storageState login setup project** - sign in once per account, persist
   session.
6. **Onboarding accept:** drive `onboarding/` (Cartographer intake ->
   system-naming -> Permissions/default-standing-grants) ->
   `/api/account/onboarding-complete` -> land in the shell. Middleware leaves
   `/onboarding` public.
7. **Chat send -> response:** `(app)/chat` -> POST `/api/marcus/chat` is an
   **SSE stream** (`thread_id` -> `status` -> `text` -> `done` -> `extraction`).
   The browser spec must read the EventSource stream, not a single JSON body.
   **Decide:** mock `@kinetiks/ai/router` for deterministic CI (no live
   Anthropic, no cost/flake) vs a real key for a smoke lane. Recommendation:
   a router stub returning a canned stream for the gated CI lane; an optional
   real-key smoke lane run manually / nightly.

## Phase C - CI wiring

8. New `.github/workflows/e2e.yml`: checkout -> setup-cli **2.105.0** ->
   `supabase start` (apply migrations) -> `pnpm --filter @kinetiks/id build` ->
   Playwright (`webServer` start + specs) -> upload the HTML report artifact.
9. Land it **non-blocking first** (runs, visible, doesn't gate merges) for ~1
   week to shake out flake, then promote the Phase A backend specs (the
   deterministic ones) to a required check. Keep the SSE/browser lane
   non-required until it's proven stable.

## Critical flows -> routes (reference)

| Flow | Pages | API |
|---|---|---|
| Cross-account isolation (never break) | `(app)/cortex/*`, `(app)/chat` | any account-scoped GET as the other tenant - API-key specs |
| Approval lifecycle | Chat sidebar Approvals | `/api/approvals/submit`, `/api/approvals/action`, `/batch` |
| Authority pause/revoke | `(app)/cortex/authority` | `/api/cortex/authority/[id]/{pause,resume,revoke,narrow}` |
| Chat send -> response | `(app)/chat`, `/chat/[threadId]` | `/api/marcus/chat` (SSE) |
| Onboarding accept | `onboarding/` | `/api/account/create`, `/api/cartographer/*`, `/api/onboarding/authority-defaults`, `/api/account/onboarding-complete` |

## Gotchas

- **SSE chat** is the only flow that breaks request/response assertions - budget
  for a stream reader + the router-mock decision above.
- **Build+start, not dev** - to catch Edge-bundle / instrumentation-split issues
  (Lesson 9).
- **Pin CLI 2.105.0** in `e2e.yml` to match `rls-tests.yml` (grant-default drift).
- **No `supabase/seed.sql`** exists - seed via service-role inserts / the
  API-key bootstrap path. A deterministic E2E seed file is a net-new artifact if
  wanted.
- **No app-level HTTP/browser test-utils today** (`src/test-utils/` is just the
  `server-only` stub) - the `e2e/support/` harness is greenfield.

## Acceptance criteria

- `pnpm --filter @kinetiks/id e2e` boots the app + local Supabase and runs green
  locally.
- `e2e.yml` runs on PRs, uploads a report; the Phase A backend specs are a
  required check once stable.
- The cross-account isolation spec exists and fails loudly if a tenant boundary
  regresses (the must-never-break flow has browser/HTTP coverage, not just
  pgTAP).

## Out of scope / follow-ups

- Desktop (Electron) E2E - separate from web E2E; see
  `docs/collaborative-workspace-spec.md`.
- Visual regression / screenshot diffing.
- Synapse-ingest and Nango-webhook E2E beyond the existing route-handler unit
  tests (add once a provider is wired in a test env).
