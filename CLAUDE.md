# CLAUDE.md - Kinetiks AI Monorepo

Operating instructions for Claude (and Claude Code) working on the Kinetiks AI codebase.

Read this at the start of every session. Then check `docs/kinetiks-product-spec-v3.md` for the full product spec and `docs/platform-contract.md` for how apps, integrations, and agents plug into the platform.

---

## Source of truth

**`docs/kinetiks-product-spec-v3.md` is the canonical product spec.** It supersedes:
- Any earlier `kinetiks-product-spec*.md` files
- The original "Platform Addendum" (now `docs/specs/programs-spec.md`, content elaborated and brought under v3)
- The `kinetiks-terminal-spec-v2.md` (now at `docs/legacy/terminal/`)
- Any spec referenced as "v1" or "v2" in chat history

Older files are kept under `docs/archive/` (superseded but referenced from current docs) and `docs/legacy/` (older iterations, retired product directions, binary `.docx` originals) as historical reference. **Never build from them.** Any conflict, the v3 spec wins. If the v3 spec is wrong, flag it in a PR or in `QUESTIONS.md`, do not work around it.

**`docs/platform-contract.md` is the canonical contract for everything that plugs into Kinetiks.** Apps, integrations, agents, tools - all conform. If a contract change is needed, update the contract first, then the implementations.

**Subsystem specs in `docs/specs/` are authoritative within their scope.** Examples: `approval-system-spec.md` for Approval, `cross-app-command-router-spec.md` for command routing, `marcus-engine-v2-plan.md` for the Marcus engine. They never contradict the v3 spec or the platform contract; if they do, the higher-level doc wins.

---

## Project Overview

Kinetiks AI is a GTM operating system. The product is the Kinetiks core app (web at kinetiks.ai plus an Electron desktop wrapper), a three-tab interface (Chat, Analytics, Cortex) where users run their entire go-to-market operation by talking to a named AI system.

**The architecture position:** the LLM is the orchestration layer, not a feature on top. Marcus (the conversational engine) and the background intelligence agents have tool access to every connected data source and every suite app. They reason about what to query, what patterns matter, and what to act on. The Approval System gates consequential actions. The system gets smarter over time through the append-only Learning Ledger.

**The apps-first model.** Every suite app (Harvest, Dark Madder, Hypothesis, Litmus, Adventure) ships as a standalone product first. Each signup creates a Kinetiks ID behind the scenes. Kinetiks is the universal control plane that users opt into when they want cross-app intelligence and the conversational command interface. App-level changes that do not touch shared packages or the Synapse interface do not break the system.

**The system identity.** Users name their GTM system at setup (freeform - "Kit", "Archer", whatever). That name speaks in Chat, sends emails, posts in Slack, owns approval requests. The underlying engine is Marcus, but the user never sees that name in product surfaces.

**Company:** Kinetiks AI. **Author:** Zack Holland.

---

## Current State (What Actually Exists)

### Built and Real

| Component | Files | LOC | Status |
|-----------|-------|-----|--------|
| **Kinetiks Core (apps/id)** | 290 | 37k | Phases 1-6 complete. Chat, Analytics, Cortex, Cartographer, Archivist, Marcus v2, Oracle schemas, approvals, agent comms, connections framework |
| **Harvest (apps/hv)** | 214 | 26k | Full UI built (Greenhouse, Field, Market). Needs end-to-end workflow fixes. |
| **Desktop (apps/desktop)** | 4 | 200 | Electron skeleton (main, tray, notifications, preload) |
| **Shared packages** | 94 | 13k | types, ui, supabase, synapse, ai, mcp, cortex, sentinel - all functional |
| **Database** | 28 migrations | - | Core + Marcus + Harvest schemas with RLS |

### Not Yet Built

| Component | Notes |
|-----------|-------|
| **Dark Madder (apps/dm)** | Exists as standalone repo, needs monorepo migration |
| **Hypothesis (apps/ht)** | Not started |
| **Litmus (apps/lt)** | Not started |
| **Adventure (apps/av)** | Scoping (creative GTM: OOH, events, sponsorships, unconventional) |
| **Tool registry + agent runtime** | The 2026 platform layer - next to build |
| **Integration extractors** | Connection framework exists (9 providers, OAuth, encryption) but zero actual data flows |
| **`@kinetiks/lib`** | Shared utilities home (state machines, env, pagination, format helpers, template vars). Does not exist yet; create as the first task that needs it. |

### The Critical Gap

The connections system has 9 providers defined with OAuth and encryption, but `registerExtractor()` is never called. The Oracle has types and schemas but no data flowing into it. Marcus cannot reference real metrics. The intelligence layer has no fuel. **Building the tool infrastructure and the first real integrations is the highest priority.**

---

## How We Work

**Think before you code.** For any non-trivial task, write a short plan first: what you are building, why, what could break, what is the smallest testable slice. Wait for explicit approval before producing code. This is doubly true for anything touching Cortex, the Approval System, or Marcus.

**Incremental and verifiable.** Small commits that each do one thing. You should be able to describe every commit in one sentence. If you cannot, it is doing too much.

**Evidence, not assertions.** Do not claim something works until you have verified types compile, tests pass, and behavior is correct. "It should work" is not a success state. "Clean compile, all done" is not done.

**Architecture over patches.** When the same kind of bug keeps recurring, the abstraction is wrong, not the implementation. Stop and re-architect rather than adding the next post-hoc validator. The Marcus engine v2 rebuild is the canonical example: post-generation validation could not fix what was a pre-generation evidence problem.

**Ask when the spec is ambiguous.** If the spec does not cover something and the answer is not obvious, surface the question in `QUESTIONS.md` at the repo root or in the PR description. Never silently pick a direction on a meaningful product decision.

**Stop when something feels wrong.** If you are about to add `any`, suppress an error, write a "temporary" workaround, or hardcode a metric list, stop and figure out the right answer. The temporary becomes permanent.

**Respect the phase plan.** Work the current phase in order. Cross-phase work needs explicit approval. A phase is finished when every task in its plan is done, not "mostly done."

---

## Monorepo Structure

```
kinetiks/
  apps/
    id/                          # kinetiks.ai - Core app (Chat, Analytics, Cortex)
    desktop/                     # Electron wrapper for desktop
    hv/                          # hv.kinetiks.ai - Harvest (outbound engine)
    dm/                          # dm.kinetiks.ai - Dark Madder (content engine) [migrating]
    ht/                          # ht.kinetiks.ai - Hypothesis (landing pages) [future]
    lt/                          # lt.kinetiks.ai - Litmus (PR engine) [future]
    av/                          # av.kinetiks.ai - Adventure (creative GTM) [future]
  packages/
    types/                       # @kinetiks/types - All shared types
    ui/                          # @kinetiks/ui - Floating pill, shared components, design tokens
    supabase/                    # @kinetiks/supabase - DB clients, auth middleware, generated types
    synapse/                     # @kinetiks/synapse - App-to-Cortex communication
    ai/                          # @kinetiks/ai - Anthropic SDK wrapper, prompts, router, ai_calls logger
    mcp/                         # @kinetiks/mcp - MCP server for Claude Code integration
    sentinel/                    # @kinetiks/sentinel - Content review, brand safety
    cortex/                      # @kinetiks/cortex - Operators, Context Structure, Proposals, state machines
    lib/                         # @kinetiks/lib - Pure utilities (env, pagination, state machines, format, template vars) [TBD]
  supabase/
    migrations/                  # ALL database migrations (single shared DB)
    seed.sql
    functions/                   # Edge Functions (Cortex, Archivist, Oracle, Synapses)
  docs/
    README.md                    # Map of the docs folder
    kinetiks-product-spec-v3.md  # THE product spec
    platform-contract.md         # THE plug-in contract for apps/integrations/agents
    kinetiks-core-architecture-v2.md
    kinetiks-roadmap.md
    collaborative-workspace-spec.md  # Desktop interaction model (split-panel, presence, task drawer)
    specs/                       # Subsystem specs (approval, command router, oracle, marcus, programs, autopilot, etc.)
    archive/                     # Superseded but actively referenced (Plan 1 marcus, prior CLAUDE.md)
    legacy/                      # Older iterations, retired directions (Terminal, DeskOf), binary .docx originals
    build-phases/
      built/                     # Phase 1-6 implementation plans (complete)
      upcoming/                  # New phase plans authored here as scoped
  turbo.json
  pnpm-workspace.yaml
  CLAUDE.md                      # THIS FILE
```

### Package resolution

Workspace pins, never published to npm:

```json
{
  "dependencies": {
    "@kinetiks/types": "workspace:*",
    "@kinetiks/ui": "workspace:*",
    "@kinetiks/supabase": "workspace:*",
    "@kinetiks/synapse": "workspace:*",
    "@kinetiks/ai": "workspace:*",
    "@kinetiks/cortex": "workspace:*"
  }
}
```

Never duplicate code across packages. If the same logic is needed in two places, extract to `@kinetiks/lib` or `@kinetiks/ui`. Turborepo caches build and test outputs; do not disable caching without a written reason.

### Vercel deployment

Each app deploys separately. Push to main rebuilds only apps with changes (Turborepo remote caching).

- `apps/id` -> kinetiks.ai
- `apps/hv` -> hv.kinetiks.ai
- `apps/dm` -> dm.kinetiks.ai
- `apps/ht` -> ht.kinetiks.ai
- `apps/lt` -> lt.kinetiks.ai
- `apps/av` -> av.kinetiks.ai

### One Supabase project

All apps share a single Supabase project. Tables use app prefixes:

- `kinetiks_*` - core platform (Context Structure, Proposals, Approvals, Goals, Insights, Learning Ledger, Thread Memory, Accounts)
- `hv_*` - Harvest
- `dm_*` - Dark Madder
- `ht_*` - Hypothesis
- `lt_*` - Litmus
- `av_*` - Adventure

RLS enforced on every user-owned table. Service role used only by Edge Functions.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Desktop:** Electron with auto-update
- **Language:** TypeScript (strict)
- **Database:** Supabase (Postgres, Auth, Realtime, Edge Functions, Storage)
- **AI:** Anthropic Claude API. Sonnet for primary response generation. Haiku for pre-analysis, action generation, lightweight extraction, rewrite tasks.
- **Styling:** Tailwind CSS, Geist font stack
- **Crawling:** Firecrawl
- **Enrichment:** People Data Labs
- **Email:** Resend (transactional). Google Workspace and Microsoft 365 (system identity).
- **Analytics integrations:** GA4, GSC, Stripe, Google Ads, Meta Ads, HubSpot, social platforms
- **Hosting:** Vercel (web), Electron auto-update (desktop)
- **Slack:** Slack Bolt
- **Package manager:** pnpm

---

## Architecture

### The agent-native model

Kinetiks is not a traditional SaaS with AI bolted on. The intelligence layer **is** the product.

**Tools, not pipelines.** Every integration, app, and platform capability exposes tools that agents can invoke. Marcus queries GA4 directly via tools when a user asks about traffic. Background agents browse competitor websites via tools when monitoring the landscape. No hardcoded metric extractors, no static CRON pipelines.

**Agents with reasoning, not scripts with configs.** Background intelligence agents have system prompts that define their mission and tool access. They decide what to query, what patterns matter, what to surface. Adding a new intelligence capability equals writing a new system prompt and registering the agent.

**Approval gates actions, not analysis.** Agents read any data freely. Actions that change external state (sending email, publishing content, creating campaigns, spending money) route through the confidence-based Approval System.

### The four Cortex Operators

- **Cartographer** - intake. Builds the Context Structure from onboarding inputs and connected data.
- **Archivist** - data quality. Validates, deduplicates, evaluates confidence, merges Proposals into the Context Structure.
- **Marcus** - conversation and orchestration. The voice behind the user's named system. Reasons live with tool access.
- **Oracle** - analytics intelligence. Synthesizes metrics, surfaces insights, drafts budget proposals (highest-bar approval, never auto-approved).

### Core platform components

- **Tool Registry** - central registry of all tools available to agents. Per-account availability based on what is connected.
- **Agent Runtime** - executes background intelligence agents within safety boundaries (tool resolution, approval gating, cost tracking, error recovery, structured logging).
- **Insight Store** - first-class objects with type, severity, evidence, suggested actions. Marcus reads undelivered insights and weaves them into conversation. Analytics surfaces them. Notifications push the urgent ones.
- **Metric Cache** - write-through cache for data source query results. Shaped by agent behavior, not a predefined metric list.
- **Approval System** - the most critical system in the product. Confidence-based autonomy that earns trust over time and contracts when mistakes occur. See `docs/specs/approval-system-spec.md`.
- **Synapse** - the contract by which suite apps communicate with Cortex (Proposals up, commands down). See `docs/platform-contract.md`.
- **Learning Ledger** - append-only record of every approval decision, override, outcome, and correction. Inputs to confidence scoring and to Oracle's calibration.

### Three-layer agent system

- **Layer 3 - Cortex.** Core intelligence. Context Structure, Proposals, routing, confidence scoring, the four Operators.
- **Layer 2 - Suite app Operators.** Each app's internal agents (Harvest's Scout, Composer, etc.). Local to the app, but emit Proposals up via Synapse.
- **Layer 1 - Tools.** The leaf-level capabilities (GA4 query, send email, browse URL). Anything an agent invokes.

---

## Git Workflow

**Never commit directly to `main`.**

### Branching

- One branch per task. Branch off `main`, which stays green.
- Naming: `phase-2/tool-registry`, `marcus/evidence-brief-fix`, `harvest/sequence-pause`, `fix/rls-kinetiks-context-voice`, `refactor/synapse-proposal-builder`.
- Do not bundle unrelated changes.

### Commits

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`. One logical change per commit.
- Imperative mood. Subject under 72 chars.
- Commit after each completed task. Do not batch a feature.
- Never commit secrets or `.env*` files.

### Pull Requests

- Open as draft once you have a meaningful slice.
- PR description includes: what changed (one paragraph), why (link to spec section), how to test locally, anything that needs extra reviewer attention, open questions.
- Screenshots or short Loom for any UI change.
- Keep under ~500 lines of real changes. Split if larger.
- Address every review comment. Fix it or explain in reply, never silently ignore.
- Never force-push a shared branch after review starts. New commits, squash on merge.
- Do not merge your own PRs without approval unless explicitly told otherwise.

---

## Code Quality

Elite means no cut corners. Concretely:

### TypeScript

- `strict: true` in `tsconfig.base.json`. Always.
- No `any`. If a true escape hatch is needed, use `unknown` and narrow it.
- No `@ts-ignore` or `@ts-expect-error` without an inline comment and a tracked follow-up.
- Types are documentation. Name them well. Prefer readable types over clever generics.
- Supabase types are generated into `packages/supabase/src/types.ts` via `pnpm db:types`. Regenerate after every migration. Commit the generated types in the same PR as the migration.
- Cross-app shared types live in `@kinetiks/types`. App-internal types live in the app. The Synapse Proposal contract types live in `@kinetiks/types` and are append-only without a versioned migration.

### Error handling

- Every async operation has an error path. No unhandled promise rejections.
- API routes and Server Actions validate inputs with Zod **before touching the database**.
- User-facing errors are friendly and actionable. Internal errors go to Sentry with structured context.
- The Sentry capture shape is fixed:
  ```ts
  Sentry.captureException(err, {
    tags: { route, action, stage, app: 'id' | 'hv' | 'dm' | ... },
    user: { id: kinetiksAccountId },
    extra: { proposalId, threadId, toolName, /* ids only, no raw payloads */ }
  })
  ```
- Pair every failure branch with a generic user-safe message constant (e.g. `GENERIC_PROPOSAL_REJECT_ERROR = "We couldn't record that decision. Try again."`). The UI shows the constant. Sentry gets the detail. Never interpolate raw PostgREST messages into the response.
- `console.error` is dev-only noise. Production reporting goes through Sentry. No `console.log` in committed code.
- Never include PII in error metadata: no emails, no full names, no auth tokens, no encrypted OAuth blobs, no full prompt text.

### Data fetching

- Server Components for initial page data wherever possible.
- TanStack Query for mutations, optimistic updates, and any client-side refetching.
- Always handle three states: loading, error, empty. Every list, every form, every async view.
- No n+1 queries. Use Supabase relational queries or explicit joins.
- Keyset pagination via `@kinetiks/lib/pagination` on every unbounded list (proposals, ledger entries, insights, approvals, threads, ai_calls, harvest contacts, dark madder articles).
- Distinguish "no row" from "query failed":
  - `.maybeSingle()` when zero rows is legitimate.
  - `.single()` when zero rows is an error.
  - After a delete, `.select('id')` and verify `data.length > 0`. A stale id returning "deleted" silently is a bug.
- Spine vs side-panel queries: spine queries (the data the page is about) throw into the route error boundary. Side-panel queries (counters, secondary stats) capture to Sentry with a stage tag, fall back to `0` or `[]`, keep rendering. Never `data ?? []` blanket fallback.

### UI quality

- Three-tab core layout (Chat, Analytics, Cortex) is the canonical shape for `apps/id`. Approvals live in the Chat sidebar. Settings is a modal triggered from the avatar.
- Suite apps render the Floating Pill from `@kinetiks/ui`. Minimal when standalone, full when connected to Kinetiks core.
- Every interactive element has hover and focus states paired. Never ship one without the other on shared primitives.
- Keyboard navigation works: tab order is correct, Enter and Escape behave, focus is visible.
- Forms use `react-hook-form` with Zod schemas. Inline error messages. Submit disabled during pending state.
- Loading states are skeletons, not spinners, except for in-flight LLM responses (Chat uses streaming token rendering).
- Empty states are warm and actionable. Never blank. Never a stock illustration.
- Confidence is a prominent ring or arc visual everywhere autonomy is shown.
- Dark mode is supported from day one. Both modes look intentional, not derived.

### Accessibility

- Semantic HTML first. `<button>` for actions, `<a>` for navigation. No nested interactive elements.
- ARIA labels where semantic HTML is not enough. Toggles carry `aria-pressed`. Active nav carries `aria-current`.
- Loading regions: `aria-busy="true" aria-live="polite" aria-label="Loading X"`.
- Color contrast meets WCAG AA. No status conveyed by color alone - status pills always pair color with a text label ("Pending", "Approved", "Rejected").

### Security

- Never trust client input. Always validate server-side.
- RLS policies are the primary access control. Every new user-owned table has explicit policies in the same migration. Default-deny is a policy decision, document it explicitly.
- Service role usage is flagged in the PR with a written justification. Keep the scope narrow.
- Always scope by `kinetiks_accounts.id`, never `auth.users.id`. The two are not interchangeable. Cartographer, Archivist, Marcus, and Oracle all key off `account_id`. Mixing the two is the most common Cortex bug shape.
- All `kinetiks_*` context tables store payloads in a `data` jsonb column with a sibling `confidence_score` column. Never expect top-level fields on these tables. The manifest builder, the Operators, and Marcus all read this shape.
- Never log secrets, OAuth tokens, encrypted blobs, or full prompt text.
- File uploads validate MIME type and size, go through a signed upload flow. No direct-to-storage from client code.
- OAuth tokens for connections are stored encrypted in `kinetiks_connections` using `KINETIKS_ENCRYPTION_KEY`. Decrypted only inside Edge Functions and the Agent Runtime, never in client or feature code.
- Template variables in agent prompts go through `@kinetiks/lib/template-vars` whitelist validator. Never `.replace()` jsonb directly.

### Performance

- Ship small bundles. `dynamic` imports for heavy client-only components (chart canvas, editor, Cortex tree explorer).
- Images: Next `Image`, proper sizing, modern formats. Reserve space to avoid CLS.
- Long-running agent work runs in Edge Functions or queued workers, never in a Server Action waiting for the user.
- Cache aggressively at the Metric Cache layer. Do not re-query GA4 on every Marcus turn.

### Testing

- Utilities and pure functions: unit tests (Vitest), colocated as `foo.ts` plus `foo.test.ts`.
- RLS: **pgTAP tests are mandatory** for every new user-owned table. Live in `supabase/tests/`. Cross-tenant tests with two seeded accounts are the most important; do not break them.
- API routes and Server Actions: integration tests against a test Supabase instance.
- Synapse Proposals: contract tests verify the shape on both sides of every app-to-Cortex boundary.
- Marcus engine: snapshot tests for the evidence brief shape, and behavioral tests for the sparse-data conversational mode.
- Approval System: state-machine tests for every transition, including expiry and confidence-driven auto-decisions.
- Critical user flows: Playwright E2E. The cross-account isolation test is the one that must never break.
- Coverage is not the goal, confidence is. If you change something non-trivial, write a test that would have caught the bug.

### Logging and observability

- Use `console.error` only with structured context, never bare strings, and only in dev paths.
- Sentry captures errors on web, desktop, Edge Functions, and any worker.
- PostHog tracks product events. `posthog.identify(kinetiksAccountId, { role, app })` on login.
- Every AI call writes an `ai_calls` row via `@kinetiks/ai/router`. Never import `@anthropic-ai/sdk` directly in feature code.
- Every approval decision, every Proposal merge, every override writes to the Learning Ledger. The Ledger is append-only - never delete entries.

---

## Design

The Kinetiks design language is set: clean, confident, modern - Linear, Vercel, Raycast tier. Not startup-generic, not enterprise-boring.

- **Brand colors:** `#6C5CE7` (Kinetiks purple, primary), `#00CEC9` (teal, secondary), `#FAFAFA` light bg, `#0F0F1A` dark bg.
- **Typography:** distinctive modern typefaces (Satoshi, Cabinet Grotesk, General Sans tier). Not Inter, not Arial.
- **Tokens** live in `@kinetiks/ui/src/tokens.ts`. Tailwind config imports the token object. Every component reads from tokens, never raw hex or rem.
- **shadcn/ui is the base.** Customize tokens, do not fight the components.
- **Generous whitespace.** Cards for summaries, timelines for the Ledger, ring/arc for confidence.
- **Three tabs at the top of `apps/id`.** Chat, Analytics, Cortex. Approvals in the Chat sidebar. Settings in a modal.
- **No em dashes** in copy or generated text. Use regular dashes, colons, or restructure.
- **Microinteractions on state changes** (approval accepted, score update, goal progress). Subtle motion only - nothing that feels like it is trying.

Before building a new component: check if shadcn has it, check if `@kinetiks/ui` already exports it. Reusable across apps -> `@kinetiks/ui`. App-specific -> colocate.

---

## Next.js Patterns

- Routes live in each app's `src/app/`. Use route groups for layout gating.
- Server Components by default. Add `"use client"` only when hooks, browser APIs, or interactive handlers require it.
- Server Actions for mutations where they fit. API routes for webhooks, public-facing endpoints, MCP endpoints, and the Synapse Proposal ingest endpoints.
- `loading.tsx` and `error.tsx` for every route segment that fetches data.
- All env vars validated via `@kinetiks/lib/env` with Zod on boot. Never read `process.env.X` directly in feature code. Missing required vars are a startup failure, not a runtime surprise. Verify Vercel deploys with `/api/health` after every env change.

---

## Supabase Patterns

### Access control

- JWT carries the Kinetiks account context via the Custom Access Token Hook. RLS reads the account claim from `auth.jwt()`. No per-request subqueries to `kinetiks_accounts`.
- Every user-owned table requires explicit RLS in the same migration. Service role usage is flagged.
- The auth boundary is `kinetiks_accounts.id`. Never use `auth.users.id` as the scoping key in feature code, even when they happen to be 1:1 today.

### Migrations

- Live in `supabase/migrations/`, timestamp-prefixed. Apply locally first, run `pnpm db:types`, commit migration plus types together.
- Never hand-edit production. Migrations are the source of truth.
- pgTAP tests for RLS ship in the same PR as the migration.
- Check constraints on enum columns must be updated **before** adding new enum values. UNIQUE constraints are required for upsert; every context layer table needs `UNIQUE(account_id)`.

### State machines

- Shared enforcement module in `@kinetiks/cortex/state-machines.ts` with `canTransition({ entity, from, to, actor })`.
- Every status-bearing entity routes through it: Approvals, Proposals, Goals, Harvest sequences, Dark Madder articles, agent runs.
- Three-layer enforcement for any status with security implications:
  1. Server action calls `canTransition()` before write.
  2. Postgres trigger enforces the same logic as a backstop.
  3. RLS policy denies writes that would bypass the trigger.
- One-way transitions (an approval going from `approved` to anything else, a Ledger entry being mutated) are denied at all three layers.

### Realtime

- Supabase Realtime is used for command delivery and approval status updates (Synapse listens; user UI subscribes).
- Channels are scoped per `account_id`. Cross-account leakage is a critical bug.
- Realtime subscribers re-resolve auth on reconnect. A stale token must trigger a fresh sign-in flow, not a silent fail.

### Storage

- Bucket layout per spec. Signed-upload flow only: sign-upload API -> PUT to signed URL -> confirm-upload API writes the row. Never accept direct-to-storage from client code.

---

## AI Patterns

**All AI calls go through `@kinetiks/ai/router`.** Never import `@anthropic-ai/sdk` directly in feature code, in an Edge Function, in the Agent Runtime, or anywhere else. The router handles model selection, rate limiting, retry, structured logging to `ai_calls`, and PII guards.

- Prompts live in `@kinetiks/ai/prompts.ts`, pinned and versioned in git.
- Each task maps to a model in router config. Haiku for evidence-brief generation, action extraction, classification, lightweight rewrites. Sonnet for primary response generation, judgment, synthesis. Opus reserved for high-stakes drafting and budget proposal generation.
- Every call logs to `ai_calls`: task, model, input/output tokens, latency, success, error, attempt number. One row per Anthropic call (every retry attempt is its own row).
- On transient error, retry once with the same model. On persistent failure, surface a friendly user-safe error. **Never silently fall back** to a different model - that masks regressions.
- Distinguish `configuration_error` (missing keys, missing required context) from `rate_limited` (real throttling). Configuration errors map to 500 and go to Sentry. Rate limits map to 429 and do not go to Sentry.
- Tool descriptions are the most important part of the agent system. Write them for an LLM, not a developer: when to use, what is returned, what the limitations are. If Marcus cannot understand a tool from its description, it will not use it correctly.
- Prompt placeholder typos surface as `AITaskError('missing_prompt')` from the router before the call hits Anthropic. Add an entry to `PROMPT_PLACEHOLDERS` alongside every new prompt.
- AI metadata is typed. `AITaskMetadata` is primitives plus string arrays only. Never `Record<string, unknown>` - it is too easy to leak PII or full prompt content into `ai_calls.metadata`.

### PII rules in prompts

- Never pass a contact's email, phone number, or full address into any prompt. First name plus last initial only.
- Never pass raw OAuth tokens, encrypted blobs, or service role keys into a prompt.
- Never pass free-text private notes into Slack-surfaced or email-surfaced agent output. Structured data only.

---

## Marcus Engine Patterns

The Marcus engine is the most opinionated system in the product. The v2 architecture is the result of a multi-cycle rewrite; the rules below are non-optional.

- **Pre-analysis evidence brief, not post-generation validation.** A Haiku call builds a structured evidence brief from the user's question and the available Cortex data. The brief is placed adjacent to the user's question in the Sonnet call. Validation that fires after the response is the wrong abstraction: by then the bad output already exists.
- **System prompt is persona only, ~300 tokens.** Behavioral rules, anti-sycophancy, anti-verbosity, the no-em-dashes rule. No data, no tool list, no operating instructions buried 800 lines deep.
- **Action generation is a separate Haiku call.** The Sonnet response body is structurally filtered so it cannot promise actions. Actions are generated by a second Haiku pass against the same evidence brief and emit through the Approval System. **One pass, one place.** A Plan-1-era post-hoc action extractor running alongside the Plan-2 generator is the bug shape that produces double action footers.
- **False promises are a trust-critical failure.** Marcus never says "I've queued briefs to Harvest" unless the corresponding action has been emitted, accepted by the Approval System, and routed via Synapse. Silence is better than a false promise.
- **Sparse-data conversational mode is required.** When the manifest indicates low-confidence or empty Cortex data, Marcus advises conversationally with the data it does have, asks what the user can share, and does not refuse. "I cannot recommend a growth strategy without fundamental data" is a failure mode, not a safe answer.
- **Thread memory is in `kinetiks_thread_memory`.** Cross-message context goes there, not in the system prompt and not in the in-memory session state.
- **Sycophancy and verbosity are behavioral, not stylistic.** They require hard constraints at the prompt level. Post-hoc filtering does not catch them.

---

## Approval System Patterns

The Approval System is the most critical system in the product. Get this wrong and the agent-native model breaks.

- **Approval gates actions, not analysis.** Reading data, building briefs, generating insights - none of these need approval. Anything that changes external state or spends money does.
- **Confidence-based autonomy.** Day one is everything-approved. Trust earns over time, contracts on mistakes. The contraction rule is durable: a single user override at high confidence drops the threshold for that action class. See `docs/specs/approval-system-spec.md` for the math.
- **Oracle-generated budget proposals are the highest-bar approval class** and **never auto-approved**, regardless of confidence history. Budget moves money.
- **Every approval decision writes to the Learning Ledger.** Append-only. The Ledger feeds confidence scoring and Oracle calibration. Deleting a Ledger entry is denied at three layers (server action, trigger, RLS).
- **An action without an approval record cannot execute.** The Agent Runtime checks the approval state before tool invocation. A missing approval is treated as a `rejected` decision, not as a permissive default.
- **Approvals expire.** Default expiry per action class lives in `@kinetiks/cortex/state-machines.ts`. Expired approvals are not silently re-issued; the action returns to the user.
- **Marcus never hard-sells app activations and never overrides approvals on the user's behalf.** Recommendations are backed by user-specific data or they are not made.

---

## Synapse Patterns

Synapse is the contract between suite apps and Cortex. See `docs/platform-contract.md` for the full spec.

- **Apps never write to `kinetiks_*` tables directly.** All cross-app data flow goes through Synapse Proposals. The only exception is the Synapse handler itself, which is the canonical writer.
- **Proposals are typed and versioned.** The Proposal contract types live in `@kinetiks/types`. The contract is append-only without a versioned migration; breaking changes require a `synapse_version` bump in the platform contract.
- **`evaluateProposal()` takes a full Proposal object, not an id.** This is the most common integration mistake.
- **Proposal merges are layer-aware.** Scalar fields are sacred (last-write-wins is wrong; Archivist arbitrates by confidence). Array fields are additive (proposals add, never replace, unless explicitly tagged as a replace).
- **Apps register capabilities at boot** via the Synapse capability descriptor. A capability not registered is not callable from Cortex. Never inline capability shape in a command handler.
- **Commands route via Realtime, scoped per `account_id`.** Cross-account command delivery is a critical bug.

---

## Tool Registry & Agent Runtime Patterns

The 2026 platform layer. Building it now.

- **Every tool registers at boot** with name, description (LLM-readable), input schema (Zod), output schema (Zod), per-account availability resolver, and approval class.
- **The Agent Runtime is the only invoker.** Feature code does not call tools directly. Tests double-mock the runtime, not individual tools.
- **Tool calls are logged.** Every invocation emits a `tool_calls` row with task id, agent id, tool name, account id, latency, success, error. PII rules for `ai_calls` apply identically here.
- **Tools that mutate external state declare an approval class.** The runtime enforces approval before the call.
- **The Metric Cache is shaped by tool behavior.** Cache key is `(account_id, tool_name, normalized_input_hash)`. Stale-while-revalidate is acceptable; never block a Marcus turn on a slow integration.
- **Background agents are described by a system prompt and a tool whitelist.** Adding an agent equals registering one record, not writing imperative orchestration code.

---

## Connection Framework Patterns

- All external OAuth runs through the Connection Framework (`@kinetiks/cortex/connections`). We never implement OAuth ourselves outside this module.
- Tokens are encrypted at rest with `KINETIKS_ENCRYPTION_KEY`. Decryption happens only in Edge Functions and the Agent Runtime, never in client code or feature code.
- Provider config lives in `packages/cortex/connections/providers/`. Adding a new provider is config plus an extractor, never feature-coupled glue.
- `registerExtractor()` is mandatory at the end of provider config. A provider without a registered extractor is dead weight - this is the current Critical Gap.
- On reconnect failure, set `kinetiks_connections.status = 'expired'` and surface a banner in the connections UI. Never retry indefinitely.

---

## Slack Integration Patterns

- Slack is **never critical path.** Every Server Action completes its DB work first, acks to the user, then enqueues the Slack send.
- All outbound Slack sends go through the dispatcher in `@kinetiks/ai/slack-dispatcher`. Never call `chat.postMessage` directly from a Server Action.
- All inbound interactions verify the signing secret, reject replays older than 5 minutes, ack within 3 seconds, then enqueue.
- Workers reuse the same Server Actions the web UI uses. No parallel business logic in the Slack path.
- Every Slack card has a deep link to the web app. Slack-only state is a footgun.

---

## Database Changes Checklist

Every database change follows this checklist:

1. Write the migration SQL in `supabase/migrations/` with a descriptive timestamped name.
2. Apply locally against a dev Supabase project.
3. Run `pnpm db:types` to regenerate `packages/supabase/src/types.ts`.
4. Write or update RLS policies in the same migration. Never as a follow-up.
5. Write pgTAP tests in `supabase/tests/` for any new user-owned table. Cross-tenant test included.
6. Update check constraints **before** adding new enum values.
7. Add `UNIQUE(account_id)` on every new context-layer table that supports upsert.
8. Test with at least two seeded accounts, both an admin user and a member, before committing.
9. Update the seed script if the table needs seed data.
10. Commit migration, types, policies, and tests in a single PR.

Never hand-edit the production database.

---

## Definition of Done

A task is not done until all of the following are true:

- Feature works end-to-end in a local dev environment with the Floating Pill connected (for suite-app features) and with the Approval System engaged (for any external-state action).
- Loading, error, and empty states implemented.
- Keyboard accessible, focus states visible, dark mode rendered intentionally.
- Responsive for any view a user touches.
- RLS policies in place and pgTAP-tested for any new user-owned table. Cross-tenant test passes.
- State machine enforced at server action plus Postgres trigger plus RLS for any status-bearing entity.
- Synapse Proposal shape verified on both sides if the change crosses an app boundary.
- TypeScript compiles with zero errors. Lint passes with zero warnings.
- Unit tests added or updated where appropriate.
- Playwright test added or updated for any critical flow change.
- Approval System gates verified for any external-state action.
- Learning Ledger entries fire on state-changing actions.
- `ai_calls` rows fire for every AI invocation. `tool_calls` rows fire for every Agent Runtime invocation.
- PostHog product events fire on user actions per spec.
- Sentry captures on all error paths with the canonical context shape.
- Commit history is clean (squash WIP if needed).
- PR opened with full description. Screenshots or Loom for any UI change. Self-reviewed before requesting review.
- Compared against the relevant spec section and the platform contract before marking complete.

If any of these are skipped, the task is not done, it is in progress.

---

## Lessons (to be filled as we ship)

This section accumulates Kinetiks-specific scars from real review and real bugs. Each entry should name the failure shape, the durable rule, and where the rule lives in code. Add entries here when a class of bug recurs or a review surfaces a pattern.

Seed entries from the Marcus engine v2 cycle:

### 1. Post-generation validation is the wrong abstraction for semantic LLM problems

Plan 1 wrapped Marcus output in a `DataAvailabilityManifest` validator, regex checks, and a Haiku rewrite loop. None of it worked, because the failure was that the response was generated against the wrong evidence in the first place. Plan 2 moved the manifest to a pre-generation Haiku call producing a structured evidence brief placed adjacent to the user's question. **Rule:** semantic LLM behavior is shaped by what the model sees before generating, not by checks run after. Validation belongs at structural layers (action emission, approval gating), not at semantic layers.

### 2. Cortex tables use a `data` jsonb column, not top-level fields

The Marcus manifest builder bug shape was: query `kinetiks_voice` instead of `kinetiks_context_voice`, expect top-level fields rather than the `data` jsonb shape with `confidence_score` sibling, and pass `auth.users.id` instead of `kinetiks_accounts.id`. **Rule:** all `kinetiks_context_*` tables follow the `(account_id, data jsonb, confidence_score float, ...)` shape. Read through `@kinetiks/cortex/context-readers`, never raw selects from feature code.

### 3. False promises are worse than silence

Marcus saying "I've queued briefs to Harvest" without an actual approved action emitted is a trust-critical failure. The fix was structural: action generation is a separate Haiku pass with structural filtering on the response body. **Rule:** the response body cannot make claims about state changes. State-change language is only legal when emitted through the action channel and confirmed by Approval.

### 4. Sycophancy and verbosity are behavioral, not stylistic

These cannot be filtered out post-hoc. They show up as patterns the model is rewarded for and have to be unlearned at the prompt level. **Rule:** the Marcus persona prompt carries explicit anti-sycophancy and anti-verbosity rules with examples. Style filters in the rewrite loop did not help.

(Add entries below as new scars accumulate.)

---

## Red Flags - Never Do These

- Commit to `main`
- Commit secrets or `.env*` files
- Use `any` to make a type error go away, or `@ts-ignore` without a comment and a follow-up
- Call `@anthropic-ai/sdk` directly instead of going through `@kinetiks/ai/router`
- Write to `kinetiks_*` tables from a suite app instead of going through Synapse
- Bypass the Approval System for an action that mutates external state
- Hardcode a metric list when an agent with tools should reason about what to query
- Ship a static CRON pipeline when an agent with tools would be more flexible
- Skip RLS because "we'll add it later"
- Skip pgTAP because "the Playwright test covers it"
- Use `auth.users.id` as the scoping key in Cortex code
- Read top-level fields from `kinetiks_context_*` tables instead of the `data` jsonb shape
- Let Marcus claim an action has been queued before it has been approved and emitted
- Let the response body promise actions instead of going through action generation
- Refuse to advise when Cortex data is sparse instead of using sparse-data conversational mode
- Let `console.error` ship to production. Use Sentry with the canonical context shape.
- Interpolate raw PostgREST messages into a UI response or a toast
- Pass a contact email, phone, or address into an LLM prompt
- Pass an OAuth token or service role key into an LLM prompt
- Store an OAuth token unencrypted, or decrypt outside an Edge Function or the Agent Runtime
- Write `{{variable}}` substitution without going through `@kinetiks/lib/template-vars`
- Read `process.env.X` directly instead of importing from `@kinetiks/lib/env`
- Block a Server Action on a Slack send, a connector call, or any external API
- Delete a Learning Ledger entry, or mutate one in place
- Use em dashes in copy or in any generated text the user sees
- Build 8 shallow pages instead of 3 deep ones, or use "Coming in Phase 2" as an excuse for missing core logic
- Mark a feature complete without comparing to the spec doc
- Merge your own PR without approval unless explicitly told otherwise

---

## Asking for Help

If you are stuck, blocked by ambiguity, or about to make a meaningful product decision the spec does not cover:

- Leave a comment in the PR flagging it.
- Or open `QUESTIONS.md` at the repo root with a running list.
- Do not silently pick a direction on something consequential.

If a task feels larger than described, break it down and propose the smaller pieces before starting.

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Crawling
FIRECRAWL_API_KEY=

# Enrichment
PEOPLE_DATA_LABS_API_KEY=

# OAuth (data connections)
GA4_CLIENT_ID=
GA4_CLIENT_SECRET=
GSC_CLIENT_ID=
GSC_CLIENT_SECRET=
STRIPE_SECRET_KEY=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
META_ADS_ACCESS_TOKEN=
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=

# Email (system identity)
GOOGLE_WORKSPACE_CLIENT_ID=
GOOGLE_WORKSPACE_CLIENT_SECRET=
MICROSOFT_365_CLIENT_ID=
MICROSOFT_365_CLIENT_SECRET=

# Email (transactional)
RESEND_API_KEY=

# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://kinetiks.ai
KINETIKS_ENCRYPTION_KEY=
```

All keys must be set on Vercel for every app. Missing keys cause silent failures. Verify with `/api/health` after every env change.

---

## Related Documents

- **`docs/README.md`** - map of the docs folder. Read first if unfamiliar.
- **`docs/kinetiks-product-spec-v3.md`** - the canonical product spec
- **`docs/platform-contract.md`** - how apps, integrations, and agents plug into Kinetiks
- **`docs/kinetiks-core-architecture-v2.md`** - the agent-native architecture (tool layer, agent runtime, insight store, approval membrane)
- **`docs/kinetiks-roadmap.md`** - strategic priorities and timeline
- **`docs/collaborative-workspace-spec.md`** - desktop app interaction model (split-panel collaboration, presence, task drawer with kill switch)
- **`docs/specs/approval-system-spec.md`** - Approval System architecture (the most critical system)
- **`docs/specs/cross-app-command-router-spec.md`** - command routing
- **`docs/specs/analytics-goals-engine-spec.md`** - Oracle architecture, goals
- **`docs/specs/agent-communication-layer-spec.md`** - email, Slack, calendar
- **`docs/specs/marcus-engine-v2-plan.md`** - Marcus engine architecture (current)
- **`docs/specs/marcus-v2-testing-playbook.md`** - manual testing playbook for the v2 engine
- **`docs/specs/programs-spec.md`** - Programs / Workflows / Tasks hierarchy (formerly "Platform Addendum")
- **`docs/specs/autopilot-spec.md`** - GTM Autopilot specification
- **`docs/specs/sneaky-spec.md`** - founder-only meta-agent that produces Claude-Code-ready feature proposals
- **`docs/specs/spec-addendum-chat-ux.md`** - Chat tab UX patterns and Marcus product-suite intelligence (intended to be merged into v3 — that merge is still pending)

Historical reference (do not build from):
- **`docs/archive/marcus-conversation-quality-plan.md`** - Plan 1 for the Marcus engine, superseded by `marcus-engine-v2-plan.md`

Per-app `CLAUDE.md` files at `apps/{code}/CLAUDE.md` document each app's internal architecture, tables, Operators, Synapse capabilities, and current state. Read those when working inside a specific app. Read this file for cross-cutting rules.

---

## Current Phase

Check the active milestone or ask Zack. Work the phase tasks in order. Cross-phase work needs explicit approval.

The current focus is the 2026 platform layer: Tool Registry, Agent Runtime, Metric Cache, Insight Store, and the first real integration (GA4) end-to-end. Marcus answering "how is my traffic?" with real data through tools is the proof point. Everything else queues behind it.
