# DeskOf

> AI-powered discovery, human-only publishing.

DeskOf is the expert routing and authority-building app in the Kinetiks AI ecosystem. It surfaces conversations across Reddit and Quora where a specific human's expertise is the right answer, helps them show up effectively, and tracks the compounding value of their contributions.

**DeskOf does not generate content. It does not post autonomously. Every published word is written by a human.**

The defining product constraint — *human-only publishing* — is enforced at four layers:

1. **Database** — `deskof_replies.posted_at` cannot be set without `human_confirmed_at` set within the prior 5 minutes (constraint `reply_requires_human_confirmation`)
2. **API** — single-use, content-hash-bound, 5-minute confirmation token consumed by `/api/reply/post`, generated only by `/api/reply/prepare-confirmation` from an authenticated UI session
3. **MCP** (Phase 8) — `deskof_post` tool requires the same confirmation token; cannot be generated from any agent context
4. **UI** — Post button only fires after the gate review screen and only from a human click

Any PR that opens a code path bypassing this constraint will be rejected.

---

## Where things live

```
apps/do/
  src/
    app/                # Next.js App Router
      (root pages, api/* routes, write/, onboarding/, upgrade/, etc.)
    components/
      analytics/        # AnalyticsBootstrap
      onboarding/       # TrackSelector
      privacy/          # PrivacyDisclosureModal
      pwa/              # ServiceWorkerRegister
      tier/             # UpgradeGate
      write/            # OpportunityCard, CardStack, ReplyEditor, etc.
    lib/
      analytics.ts      # Client-side event wrapper (Final Supplement §5)
      auth/             # Kinetiks ID session
      cortex/           # Operator Profile persistence
      dev/              # Dev-only fixture loader
      drafts/           # IndexedDB local draft rescue store
      mirror/           # Cold-start pipeline
      onboarding/       # State machine
      opportunities/    # Queue helpers
      privacy/          # Disclosure + deletion (audit-only until Phase 8)
      quora/            # Playwright scraper + PlatformClient
      reply/            # Reply persistence + confirmation tokens
      scout/            # v1 keyword discovery
      supabase/         # Server + admin clients (mirror apps/id pattern)
      tier-config.ts    # SINGLE source of truth for feature gating
      tracks/           # Track persistence
      webhooks/         # Inbound HMAC verification
    public/             # PWA manifest, icons, offline shell, sw.js
  docs/
    specs/              # The 8 source spec .docx files
    build-plan.md       # Phased build plan
    audit-phase-1-2.md  # Phase 1+2 audit (Phase 2.5 closes most of it)
  CLAUDE.md             # Project-level Claude Code instructions
  README.md             # this file

packages/
  cortex/               # Promoted package — shared Cortex primitives + Operator Profile
  deskof/               # Shared types, scoring math, CPPI, fingerprinting, platform interface
```

---

## Running it locally

```bash
# From the monorepo root
pnpm install
pnpm --filter @kinetiks/do dev
```

App boots at `http://localhost:3005`. You'll need a `.env.local` (see `.env.example`) with at minimum the Supabase URL + anon key + service role key, and the Kinetiks webhook secret if you want to test the inbound webhook routes.

**To exercise the Write loop end-to-end** before the real Reddit/Quora discovery paths exist:

```js
// 1. Sign in via id.kinetiks.ai (the cookie auto-shares to localhost:3005)
// 2. Open localhost:3005, then in the browser devtools console run:
await fetch("/api/dev/seed-fixtures", {
  method: "POST",
  credentials: "include",
});
// 3. Reload /write — you'll see five fixture opportunities
```

The browser session cookie isn't accessible to `curl` without exporting
a cookie jar (`--cookie-jar`/`--cookie`), so the in-browser `fetch`
form is the simplest path. If you do prefer `curl`, save the cookie
jar from a logged-in browser session first.

The seed route is gated to `NODE_ENV !== "production"` OR `DESKOF_ALLOW_DEV_SEED=true`. Fixtures are clearly labeled `[Fixture]` in their titles.

---

## Tests

```bash
pnpm --filter @kinetiks/do test
pnpm --filter @kinetiks/deskof test
```

Phase 2.5 ships an initial test scaffold around the most security-critical
primitives:

- `apps/do/src/lib/reply/confirmation-token.test.ts` — single-use, content-hash binding, replay defense
- `apps/do/src/lib/tier-config.test.ts` — feature gate matrix invariants
- `packages/deskof/src/fingerprint/quora.test.ts` — Levenshtein normalization + spec thresholds
- `packages/deskof/src/scoring/composite.test.ts` — composite formula + clamping + weight validation
- `packages/deskof/src/types/cppi.test.ts` — CPPI level boundaries

Phase 3 onward expands coverage as each feature lands. Any PR that touches the human-only-publishing constraint must add a test.

---

## Type-checking

```bash
pnpm --filter @kinetiks/do type-check
pnpm --filter @kinetiks/deskof type-check
pnpm --filter @kinetiks/cortex type-check
```

The pre-existing `@kinetiks/supabase` type errors are unrelated and tracked separately. DeskOf deliberately inlines its own server-only Supabase client (`src/lib/supabase/{server,admin}.ts`) to sidestep them.

---

## Deployment

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the full deployment guide and the limitations of the Phase 2.5 build (single-instance confirmation token store, no Reddit OAuth client yet, deletion processor returns 503).

---

## Spec

The full DeskOf specification is in [`docs/specs/`](./docs/specs/) — eight `.docx` documents covering the product brief, build companion, integration architecture, quality addendum, final supplement, and research spike. The [`docs/build-plan.md`](./docs/build-plan.md) is the executable phased plan that maps spec items into the actual phase branches that ship them. Read [`CLAUDE.md`](./CLAUDE.md) for the technical contract every PR must hold.
