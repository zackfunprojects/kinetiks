# CLAUDE.md - Kinetiks AI Monorepo

Operating instructions for Claude (and Claude Code) working on the Kinetiks AI codebase.

Read this at the start of every session. Then check `docs/kinetiks-product-spec-v3.md` for the full product spec, `docs/platform-contract.md` (plus `docs/Kinetiks Contract Addendum.md`) for how apps, integrations, and agents plug into the platform, and `design/kinetiks-design-spec.md` for anything visual.

---

## Source of truth

**`docs/kinetiks-product-spec-v3.md` is the canonical product spec.** It supersedes:
- Any earlier `kinetiks-product-spec*.md` files
- The original "Platform Addendum" (now `docs/specs/programs-spec.md`, content elaborated and brought under v3)
- The `kinetiks-terminal-spec-v2.md` (now at `docs/archive/legacy/terminal/`)
- Any spec referenced as "v1" or "v2" in chat history

Older files are kept under `docs/archive/` (superseded but referenced from current docs) and `docs/legacy/` (older iterations, retired product directions, binary `.docx` originals) as historical reference. **Never build from them.** Any conflict, the v3 spec wins. If the v3 spec is wrong, flag it in a PR or in `QUESTIONS.md`, do not work around it.

**`docs/platform-contract.md` is the canonical contract for everything that plugs into Kinetiks.** Apps, integrations, agents, tools - all conform. If a contract change is needed, update the contract first, then the implementations.

**`docs/Kinetiks Contract Addendum.md` is part of the canonical contract.** It introduces the Pattern Library, Authority Grants, Operator Workflows, and multi-user placeholder schema. The platform contract version bumps with its merger. Every app, integration, and agent built or updated after the merge conforms to it. Read it before any work on Patterns, Authority, internal app workflows, or Implosion.

**`design/kinetiks-design-spec.md` is the canonical design spec.** Every visual decision - tokens, typography, components, light/dark, motion, the application shell - is decided there. Implementation tokens live in `packages/ui/styles/kinetiks-tokens.css`, imported once at the root of every app. It supersedes all prior design guidance, including any color palettes or font recommendations in older docs.

**Subsystem specs in `docs/specs/` are authoritative within their scope.** Examples: `approval-system-spec.md` for Approval, `cross-app-command-router-spec.md` for command routing, `marcus-engine-v2-plan.md` for the Marcus engine. They never contradict the v3 spec, the platform contract, the Kinetiks Contract Addendum, or the design spec; if they do, the higher-level doc wins.

**Bootstrap files.** Several canonical sources named above are referenced before they may exist on disk in early sessions:

- `design/kinetiks-design-spec.md`
- `packages/ui/styles/kinetiks-tokens.css`
- `docs/Kinetiks Contract Addendum.md`
- `packages/lib/` (the `@kinetiks/lib` workspace - explicitly marked TBD below)

If any of these paths do not yet exist at the start of a session, the first task is to create the file as a stub at the named path and surface a question to Zack rather than silently working around the absence. Do not invent design rules, token values, or contract content; bootstrap stubs are placeholders that say "this file is canonical, contents to follow."

---

## Project Overview

Kinetiks AI is a GTM operating system. The product is the Kinetiks core app (web at kinetiks.ai plus an Electron desktop wrapper), a three-tab interface (Chat, Analytics, Cortex) where users run their entire go-to-market operation by talking to a named AI system.

**The architecture position:** the LLM is the orchestration layer, not a feature on top. Marcus (the conversational engine) and the background intelligence agents have tool access to every connected data source and every suite app. They reason about what to query, what patterns matter, and what to act on. The Approval System gates consequential actions. The system gets smarter over time through the append-only Learning Ledger.

**The apps-first model.** Every suite app (Harvest, Dark Madder, Hypothesis, Implosion, Litmus, Adventure) ships as a standalone product first. Each signup creates a Kinetiks ID behind the scenes. Kinetiks is the universal control plane that users opt into when they want cross-app intelligence and the conversational command interface. App-level changes that do not touch shared packages or the Synapse interface do not break the system.

**The system identity.** Users name their GTM system at setup (freeform - "Kit", "Archer", whatever). That name speaks in Chat, sends emails, posts in Slack, owns approval requests. The underlying engine is Marcus, but the user never sees that name in product surfaces.

**The 2027 trust architecture.** Three structures together make Kinetiks safe enough for real spend and real outreach delegation: the **Pattern Library** is the system's evidence (what it has learned, exportable, visible at any time), **Authority Grants** are the unit of trust (scoped, time-bounded, plain-language, revocable), and **Operator Workflows** are the mechanism (intra-app agent coordination with explicit handoffs and approval checkpoints). The customer's relationship with the system is one of earned, granular, observable, revocable trust. See `docs/Kinetiks Contract Addendum.md`.

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
| **Implosion (apps/im)** | AI ads product. Schedules after Hypothesis, before Litmus. First app that requires the Kinetiks Contract Addendum structures end-to-end (Pattern Library reads/writes, Authority Grants, internal Operator Workflows for its eight Operators). |
| **Litmus (apps/lt)** | Not started |
| **Adventure (apps/av)** | Scoping (creative GTM: OOH, events, sponsorships, unconventional) |
| **Tool registry + agent runtime** | The 2026 platform layer - next to build |
| **Pattern Library** | Phase 1 of the Kinetiks Contract Addendum. New table `kinetiks_pattern_library`, Pattern Type Registry, `query_patterns` tool, Archivist write path, export/import endpoints. Ships before Implosion - Harvest and Dark Madder can emit patterns from existing operational data. |
| **Authority Grants** | Phase 4 of the Kinetiks Contract Addendum. New table `kinetiks_authority_grants`, Action Class Registry, new Authority Agent Operator, new `authority_grant_proposal` approval class, authority resolution flow in the Agent Runtime, per-class LLM judgment budgets. Ships closer to Implosion launch. |
| **Operator Workflows extension** | Phase 3 of the Kinetiks Contract Addendum. `WorkflowTask` gains `target_type` and `target_app`, optional `operator_registry` on app manifests, runtime distinction between cross-app and internal dispatch. Ships when Implosion is being scoped. |
| **Integration extractors** | Connection framework exists (9 providers, OAuth, encryption) but zero actual data flows |
| **`@kinetiks/lib`** | Shared utilities home (state machines, env, pagination, format helpers, template vars). Does not exist yet; create as the first task that needs it. |

### The Critical Gap

The connections system has 9 providers defined with OAuth and encryption, but `registerExtractor()` is never called. The Oracle has types and schemas but no data flowing into it. Marcus cannot reference real metrics. The intelligence layer has no fuel. **Building the tool infrastructure and the first real integrations is the highest priority.**

---

## How We Work

**Think before you code.** For any non-trivial task, write a short plan first: what you are building, why, what could break, what is the smallest testable slice. Wait for explicit approval before producing code. This is doubly true for anything touching Cortex, the Approval System, Marcus, the Pattern Library, or Authority Grants.

**Incremental and verifiable.** Small commits that each do one thing. You should be able to describe every commit in one sentence. If you cannot, it is doing too much.

**Evidence, not assertions.** Do not claim something works until you have verified types compile, tests pass, and behavior is correct. "It should work" is not a success state. "Clean compile, all done" is not done.

**Architecture over patches.** When the same kind of bug keeps recurring, the abstraction is wrong, not the implementation. Stop and re-architect rather than adding the next post-hoc validator. The Marcus engine v2 rebuild is the canonical example: post-generation validation could not fix what was a pre-generation evidence problem.

**Innovation through composition.** Every new structure in the Kinetiks Contract Addendum (Pattern Library, Authority Grants, Operator Workflows) is built from existing primitives - Cortex objects, Synapse Proposals, Learning Ledger entries, the Approval System, Programs, Workflows. New work should follow the same principle. If a feature feels like it needs a new architectural concept, surface that as a question before introducing one.

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
    im/                          # im.kinetiks.ai - Implosion (AI ads) [future]
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
    cortex/                      # @kinetiks/cortex - Operators, Context Structure, Proposals, state machines, registries
    lib/                         # @kinetiks/lib - Pure utilities (env, pagination, state machines, format, template vars) [TBD]
  supabase/
    migrations/                  # ALL database migrations (single shared DB)
    seed.sql
    functions/                   # Edge Functions for Cortex Operators (Cartographer, Archivist, Marcus, Oracle, Authority Agent), Synapse handlers, and background jobs
  design/
    kinetiks-design-spec.md      # THE design spec (visual system, tokens, components, light/dark)
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
- `apps/im` -> im.kinetiks.ai
- `apps/lt` -> lt.kinetiks.ai
- `apps/av` -> av.kinetiks.ai

### One Supabase project

All apps share a single Supabase project. Tables use app prefixes:

- `kinetiks_*` - core platform (Context Structure, Proposals, Approvals, Goals, Budgets, Insights, Learning Ledger, Thread Memory, Accounts, **Pattern Library**, **Authority Grants**)
- `hv_*` - Harvest
- `dm_*` - Dark Madder
- `ht_*` - Hypothesis
- `im_*` - Implosion
- `lt_*` - Litmus
- `av_*` - Adventure

RLS enforced on every user-owned table. Service role used only by Edge Functions. All `kinetiks_*` and app-prefixed user-owned tables that participate in the 2027 trust architecture (Patterns, Authority Grants, Ledger entries) carry a `team_scope_id: string | null` placeholder column - always null in v1, schema-forward to v2.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Desktop:** Electron with auto-update
- **Language:** TypeScript (strict)
- **Database:** Supabase (Postgres, Auth, Realtime, Edge Functions, Storage)
- **AI:** Anthropic Claude API. Sonnet for primary response generation. Haiku for pre-analysis, action generation, lightweight extraction, rewrite tasks, LLM-judged escalation evaluation.
- **Styling:** Tailwind CSS bound to design tokens in `packages/ui/styles/kinetiks-tokens.css`. Fonts, palette, and typography rules are defined in `design/kinetiks-design-spec.md`.
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

**Approval gates actions, not analysis.** Agents read any data freely. Actions that change external state (sending email, publishing content, creating campaigns, spending money) route through the confidence-based Approval System or an active Authority Grant.

### The five Cortex Operators

- **Cartographer** - intake. Builds the Context Structure from onboarding inputs and connected data.
- **Archivist** - data quality. Validates, deduplicates, evaluates confidence, merges Proposals into the Context Structure. Also the canonical writer for the Pattern Library.
- **Marcus** - conversation and orchestration. The voice behind the user's named system. Reasons live with tool access. Reads from the Pattern Library to ground recommendations.
- **Oracle** - analytics intelligence. Synthesizes metrics, surfaces insights, drafts budget proposals (highest-bar approval, never auto-approved).
- **Authority Agent** - proposes Authority Grants from the Pattern Library, Learning Ledger, and Budget context. Never approves, never executes - the customer always approves. Calibrates proposed shapes over time from approve/edit/reject signal.

### Core platform components

- **Tool Registry** - central registry of all tools available to agents. Per-account availability based on what is connected.
- **Pattern Type Registry** - global registry of every `pattern_type` an app may emit. Declares dimensions schema, valid outcome metrics, read allowlist, decay bounds, LLM-readable description. Patterns whose type is not registered cannot be written. (Per the Kinetiks Contract Addendum §1.3.)
- **Action Class Registry** - global registry of every `action_class` that may appear in an Authority Grant capability. Declares constraint schema, customer-facing template, LLM judgment budget, eligibility for default standing grants. Unregistered action classes cannot be referenced in a grant. (Per the Kinetiks Contract Addendum §2.4.)
- **Agent Runtime** - executes background intelligence agents within safety boundaries (tool resolution, **authority resolution**, approval gating, cost tracking, error recovery, structured logging).
- **Insight Store** - first-class objects with type, severity, evidence, suggested actions. Marcus reads undelivered insights and weaves them into conversation. Analytics surfaces them. Notifications push the urgent ones.
- **Metric Cache** - write-through cache for data source query results. Shaped by agent behavior, not a predefined metric list.
- **Pattern Library** - first-class Cortex structure (peer to Identity, Goals, Budget). Stores empirically validated multi-dimensional signatures with outcome data and confidence. Apps emit patterns via Synapse; Archivist is the canonical writer; all reads go through the `query_patterns` tool. (Per the Kinetiks Contract Addendum §1.)
- **Authority Grants** - first-class Cortex structure (peer to Budget). Scoped, time-bounded, plain-language, customer-approved delegations of action authority. Every action under a grant logs to the Ledger with `grant_id`. Customer can pause, narrow, or revoke at any moment. (Per the Kinetiks Contract Addendum §2.)
- **Approval System** - the most critical safety system. Confidence-based autonomy for actions outside an active grant; grants are the unit of trust for actions inside one. Trust earns over time and contracts when mistakes occur. See `docs/specs/approval-system-spec.md`.
- **Synapse** - the contract by which suite apps communicate with Cortex (Proposals up, commands down, Patterns up). See `docs/platform-contract.md` and `docs/Kinetiks Contract Addendum.md`.
- **Learning Ledger** - append-only record of every approval decision, override, outcome, grant action, pattern observation, and correction. Inputs to confidence scoring, Oracle calibration, Authority Agent proposal calibration, and Pattern decay calibration.

### Three-layer agent system

- **Layer 3 - Cortex.** Core intelligence. Context Structure, Patterns, Authority Grants, Proposals, routing, confidence scoring, the five Operators.
- **Layer 2 - Suite app Operators.** Each app's internal agents (Harvest's Scout, Composer, etc.). Local to the app, but emit Proposals and Patterns up via Synapse. May coordinate among themselves via internal Operator Workflows (per the Kinetiks Contract Addendum §3). The full Operator decomposition for each app lives in that app's own `CLAUDE.md`.
- **Layer 1 - Tools.** The leaf-level capabilities (GA4 query, send email, browse URL, query patterns). Anything an agent invokes.

The absolute communication rules from the original Three-Layer system remain in force: Operators in app A still cannot talk to Operators in app B. Cross-app intelligence still flows via Proposal/Pattern up or Routing Event down. Synapses still do not talk to other Synapses. Operator Workflows are a new addressing mode for an existing primitive; they do not introduce a new communication path.

---

## Git Workflow

**Never commit directly to `main`.**

### Branching

- One branch per task. Branch off `main`, which stays green.
- Naming: `phase-2/tool-registry`, `marcus/evidence-brief-fix`, `harvest/sequence-pause`, `fix/rls-kinetiks-context-voice`, `refactor/synapse-proposal-builder`, `patterns/registry-and-writes`, `authority/agent-and-proposals`.
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
- Cross-app shared types live in `@kinetiks/types`. App-internal types live in the app. The Synapse Proposal contract types, the Pattern type and registry descriptors, the Authority Grant types, the Action Class descriptor, and the Operator descriptor all live in `@kinetiks/types` and are append-only without a versioned migration.

### Error handling

- Every async operation has an error path. No unhandled promise rejections.
- API routes and Server Actions validate inputs with Zod **before touching the database**.
- User-facing errors are friendly and actionable. Internal errors go to Sentry with structured context.
- The Sentry capture shape is fixed:
  ```ts
  Sentry.captureException(err, {
    tags: { route, action, stage, app: 'id' | 'hv' | 'dm' | 'im' | ... },
    user: { id: kinetiksAccountId },
    extra: { proposalId, threadId, toolName, patternId, grantId, /* ids only, no raw payloads */ }
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
- Keyset pagination via `@kinetiks/lib/pagination` on every unbounded list (proposals, ledger entries, insights, approvals, threads, ai_calls, harvest contacts, dark madder articles, patterns, authority grants).
- Distinguish "no row" from "query failed":
  - `.maybeSingle()` when zero rows is legitimate.
  - `.single()` when zero rows is an error.
  - After a delete, `.select('id')` and verify `data.length > 0`. A stale id returning "deleted" silently is a bug.
- Spine vs side-panel queries: spine queries (the data the page is about) throw into the route error boundary. Side-panel queries (counters, secondary stats) capture to Sentry with a stage tag, fall back to `0` or `[]`, keep rendering. Never `data ?? []` blanket fallback.

### UI quality

**The canonical design spec is `design/kinetiks-design-spec.md`.** Read it before touching any UI. All visual decisions - tokens, typography, palette, light/dark, components, motion, per-surface specs (Chat, Approvals, Cortex Identity, Analytics) - live there. Implementation tokens live in `packages/ui/styles/kinetiks-tokens.css` and are imported once at the root of every app. If a value you need is not in tokens, extend the token system there first, then use the new token; never hardcode.

The code-level rules CLAUDE.md enforces (everything else is in the design spec):

- No hardcoded colors, fonts, sizes, radii, shadows, or motion durations in any component. Every value references a `--kt-*` CSS variable.
- `packages/ui` is the only home for primitives. No app implements its own Button, Input, Card, Pill, ConfidenceRing, or Floating Pill - import from `@kinetiks/ui`.
- Forms use `react-hook-form` with Zod schemas. Inline error messages. Submit disabled during pending state.
- Always handle three states: loading, error, empty. Every list, every form, every async view.
- Three-tab shell at the top of `apps/id`: Chat, Analytics, Cortex. Approvals live in the Chat sidebar as a segmented toggle. Settings is a modal triggered from the avatar.
- The Cortex tab carries seven peer sections in the sub-nav: Identity, Goals, Budget, **Patterns**, **Authority**, Integrations, Ledger. (The Kinetiks Contract Addendum adds Patterns and Authority; the existing order is preserved.)
- Suite apps render the Floating Pill from `@kinetiks/ui`. Minimal when standalone, full when connected to Kinetiks core.
- Theme toggle (light/dark) persists to the Supabase user profile, not localStorage. Both modes ship from day one.
- `prefers-reduced-motion` is always respected.

### Accessibility

- Semantic HTML first. `<button>` for actions, `<a>` for navigation. No nested interactive elements.
- ARIA labels where semantic HTML is not enough. Toggles carry `aria-pressed`. Active nav carries `aria-current`.
- Loading regions: `aria-busy="true" aria-live="polite" aria-label="Loading X"`.
- Color contrast meets WCAG AA. No status conveyed by color alone - status pills always pair color with a text label ("Pending", "Approved", "Rejected", "Active", "Paused", "Revoked").

### Security

- Never trust client input. Always validate server-side.
- RLS policies are the primary access control. Every new user-owned table has explicit policies in the same migration. Default-deny is a policy decision, document it explicitly.
- Service role usage is flagged in the PR with a written justification. Keep the scope narrow.
- Always scope by `kinetiks_accounts.id`, never `auth.users.id`. The two are not interchangeable. Cartographer, Archivist, Marcus, Oracle, and the Authority Agent all key off `account_id`. Mixing the two is the most common Cortex bug shape.
- All `kinetiks_*` context tables store payloads in a `data` jsonb column with a sibling `confidence_score` column. Never expect top-level fields on these tables. The manifest builder, the Operators, and Marcus all read this shape. Patterns follow the same shape. **Authority Grants are a hybrid**: queryable lifecycle fields (`status`, `scope_type`, `scope_id`, `parent_grant_id`, `expires_at`, `granted_at`, `revoked_at`, `team_scope_id`, `account_id`) are top-level columns for indexing, RLS, constraints, and the authority-resolution path; `granted_capabilities`, `escalation_triggers`, and `usage_summary` are jsonb. The hybrid is necessary because authority resolution runs on every consequential action and must filter cheaply.
- The `team_scope_id` column is always `null` in v1. Every query filters by `account_id`; `team_scope_id` is an optional additional filter for v2 forward-compat. Never default it to anything else.
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
- Pattern emissions: contract tests verify the dimensions schema and outcome metric validity for every registered pattern type.
- Authority resolution: state-machine tests for every flow (grant covers action, grant fails constraint, grant triggers escalation, no grant falls back to per-tool approval).
- Marcus engine: snapshot tests for the evidence brief shape, and behavioral tests for the sparse-data conversational mode.
- Approval System: state-machine tests for every transition, including expiry, confidence-driven auto-decisions, and authority grant proposal flow.
- Critical user flows: Playwright E2E. The cross-account isolation test is the one that must never break.
- Coverage is not the goal, confidence is. If you change something non-trivial, write a test that would have caught the bug.

### Logging and observability

- Use `console.error` only with structured context, never bare strings, and only in dev paths.
- Sentry captures errors on web, desktop, Edge Functions, and any worker.
- PostHog tracks product events. `posthog.identify(kinetiksAccountId, { role, app })` on login.
- Every AI call writes an `ai_calls` row via `@kinetiks/ai/router`. Never import `@anthropic-ai/sdk` directly in feature code.
- Every approval decision, every Proposal merge, every grant action, every pattern observation, every override writes to the Learning Ledger. The Ledger is append-only - never delete entries.

---

## Design

**The canonical design spec is `design/kinetiks-design-spec.md`.** Read it before touching any UI. Implementation tokens live in `packages/ui/styles/kinetiks-tokens.css` and are imported once at the root of every app.

CLAUDE.md does not duplicate design content. Every visual decision - tokens, palette, typography, light/dark, component shapes, motion, per-surface specs, copywriting tone - is decided in the design spec. If the design spec is silent on something you need, surface a question in `QUESTIONS.md` before deciding; do not invent design rules here.

The only design-adjacent rule CLAUDE.md enforces is structural: never hardcode a color, font, size, radius, shadow, or motion duration in component code. Always reference a `--kt-*` token. The token system is the bridge between the design spec and the codebase.

---

## Next.js Patterns

- Routes live in each app's `src/app/`. Use route groups for layout gating.
- Server Components by default. Add `"use client"` only when hooks, browser APIs, or interactive handlers require it.
- Server Actions for mutations where they fit. API routes for webhooks, public-facing endpoints, MCP endpoints, the Synapse Proposal ingest endpoints, and the Pattern Library export/import endpoints.
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
- Every new table participating in the 2027 trust architecture (Patterns, Authority Grants, Ledger entries, related calibration tables) ships with the `team_scope_id: string | null` column in its first migration. No follow-up migration for v2 - the placeholder is there from day one.

### State machines

- Shared enforcement module in `@kinetiks/lib/state-machines` with `canTransition({ entity, from, to, actor })`.
- Every status-bearing entity routes through it: Approvals, Proposals, Goals, Authority Grants, Patterns, Harvest sequences, Dark Madder articles, agent runs.
- Three-layer enforcement for any status with security implications:
  1. Server action calls `canTransition()` before write.
  2. Postgres trigger enforces the same logic as a backstop.
  3. RLS policy denies writes that would bypass the trigger.
- One-way transitions (an approval going from `approved` to anything else, a Ledger entry being mutated, a revoked grant returning to active) are denied at all three layers.

### Realtime

- Supabase Realtime is used for command delivery and approval status updates (Synapse listens; user UI subscribes). Authority Grant status changes (granted, paused, narrowed, revoked, expired) also propagate via Realtime so any open client surface reflects them.
- Channels are scoped per `account_id`. Cross-account leakage is a critical bug.
- Realtime subscribers re-resolve auth on reconnect. A stale token must trigger a fresh sign-in flow, not a silent fail.

### Storage

- Bucket layout per spec. Signed-upload flow only: sign-upload API -> PUT to signed URL -> confirm-upload API writes the row. Never accept direct-to-storage from client code.

---

## AI Patterns

**All AI calls go through `@kinetiks/ai/router`.** Never import `@anthropic-ai/sdk` directly in feature code, in an Edge Function, in the Agent Runtime, or anywhere else. The router handles model selection, rate limiting, retry, structured logging to `ai_calls`, and PII guards.

- Prompts live in `@kinetiks/ai/prompts.ts`, pinned and versioned in git.
- Each task maps to a model in router config. Haiku for evidence-brief generation, action extraction, classification, lightweight rewrites, LLM-judged escalation evaluation. Sonnet for primary response generation, judgment, synthesis. Opus reserved for high-stakes drafting and budget proposal generation.
- Every call logs to `ai_calls`: task, model, input/output tokens, latency, success, error, attempt number. One row per Anthropic call (every retry attempt is its own row).
- On transient error, retry once with the same model. On persistent failure, surface a friendly user-safe error. **Never silently fall back** to a different model - that masks regressions.
- Distinguish `configuration_error` (missing keys, missing required context) from `rate_limited` (real throttling). Configuration errors map to 500 and go to Sentry. Rate limits map to 429 and do not go to Sentry.
- Tool descriptions are the most important part of the agent system. Write them for an LLM, not a developer: when to use, what is returned, what the limitations are. If Marcus cannot understand a tool from its description, it will not use it correctly. The same standard applies to Pattern Type descriptions and Action Class descriptions in their registries.
- Prompt placeholder typos surface as `AITaskError('missing_prompt')` from the router before the call hits Anthropic. Add an entry to `PROMPT_PLACEHOLDERS` alongside every new prompt.
- AI metadata is typed. `AITaskMetadata` is primitives plus string arrays only. Never `Record<string, unknown>` - it is too easy to leak PII or full prompt content into `ai_calls.metadata`.
- LLM-judged escalation triggers (Authority Grant feature) are budgeted per action class in the Action Class Registry. The router enforces the daily and monthly cap; on exhaustion, the fallback declared on the action class (`structured_only` or `escalate_to_user`) applies. Grants may override the per-class budget within the parent grant's bounds.

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
- **False promises are a trust-critical failure.** Marcus never says "I've queued briefs to Harvest" unless the corresponding action has been emitted, accepted by the Approval System (or covered by an active Authority Grant), and routed via Synapse. Silence is better than a false promise.
- **Sparse-data conversational mode is required.** When the manifest indicates low-confidence or empty Cortex data, Marcus advises conversationally with the data it does have, asks what the user can share, and does not refuse. "I cannot recommend a growth strategy without fundamental data" is a failure mode, not a safe answer.
- **Patterns ground recommendations.** Marcus uses the `query_patterns` tool to read empirical evidence from the Pattern Library before recommending actions or app activations. When recommending Dark Madder, Marcus cites specific Harvest or Implosion patterns that suggest content would amplify what is already working. Recommendations without pattern evidence remain suspect.
- **Patterns are evidence, not response content.** Marcus does not dump raw pattern lists into Chat unless the customer explicitly asks. Patterns enter the evidence brief and shape the reasoning; the response body summarizes the implication, not the statistics.
- **Authority awareness in Chat answers.** When the customer asks "what authority do you have right now?" or "what have you done with that authority today?", Marcus reads from `kinetiks_authority_grants` and the grant usage summaries and answers in plain language. Marcus never modifies grants - that flow always routes through the Authority Agent and a customer approval.
- **Thread memory is in `kinetiks_thread_memory`.** Cross-message context goes there, not in the system prompt and not in the in-memory session state.
- **Sycophancy and verbosity are behavioral, not stylistic.** They require hard constraints at the prompt level. Post-hoc filtering does not catch them.

---

## Approval System Patterns

The Approval System is the most critical safety system in the product. Get this wrong and the agent-native model breaks.

- **Approval gates actions, not analysis.** Reading data, building briefs, generating insights, querying patterns - none of these need approval. Anything that changes external state or spends money does.
- **Confidence-based autonomy.** Day one is everything-approved. Trust earns over time, contracts on mistakes. The contraction rule is durable: a single user override at high confidence drops the threshold for that action class. See `docs/specs/approval-system-spec.md` for the math.
- **Authority Grants extend the Approval System; they do not replace it.** For actions outside any active grant, the existing per-action confidence flow is unchanged. For actions inside an active grant, the grant *is* the approval - the customer's prior approval of the grant covers every action within it. Escalation triggers inside a grant route the specific action back into the per-action approval flow without modifying the grant.
- **Three approval classes by priority:** `budget_proposal` (highest bar, never auto-approved, Oracle-generated), `authority_grant_proposal` (Authority-Agent-generated, peer in prominence to budget), and standard per-action approvals (current confidence-based flow). See `docs/specs/approval-system-spec.md` and the Kinetiks Contract Addendum §2.
- **Budget approvals remain non-negotiable.** A grant authorizes spend up to its envelope, but the envelope itself cannot exceed the approved Budget for the relevant category. If the system would spend beyond the Budget category, that is always a Budget overage approval, not a grant action.
- **Every approval decision writes to the Learning Ledger.** Append-only. The Ledger feeds confidence scoring, Oracle calibration, and Authority Agent proposal calibration. Deleting a Ledger entry is denied at three layers (server action, trigger, RLS).
- **An action without an approval record or an active grant cannot execute.** The Agent Runtime checks authority resolution before tool invocation. A missing approval and no covering grant is treated as a `rejected` decision, not as a permissive default.
- **Approvals expire.** Default expiry per action class lives in `@kinetiks/lib/state-machines`. Expired approvals are not silently re-issued; the action returns to the user. Authority Grants also expire per their `expires_at` field; expired grants do not re-issue.
- **Marcus never hard-sells app activations and never overrides approvals on the user's behalf.** Recommendations are backed by user-specific data (patterns, ledger evidence) or they are not made.

---

## Pattern Library Patterns

See `docs/Kinetiks Contract Addendum.md` §1 for the canonical spec.

- **Apps emit patterns via Synapse.** They never write to `kinetiks_pattern_library` directly. The Archivist is the canonical writer, the same way it is for every other Cortex context table.
- **All pattern reads from agents and suite apps go through the `query_patterns` tool.** Not raw selects. The tool enforces the Pattern Type Registry's `read_apps` allowlist at the boundary. Reads from the Cortex Patterns surface in `apps/id` go through a Server Action that uses the same underlying query helper the tool wraps; the allowlist is enforced server-side either way. No raw selects from any client code, anywhere.
- **Pattern Type Registry is the contract.** Every `pattern_type` value is registered at app boot with a dimensions schema (Zod), valid outcome metrics, read allowlist, decay bounds, and LLM-readable description. Patterns whose type is not registered cannot be emitted, ever.
- **The dimensions schema validates the signature.** An app that emits a malformed pattern fails at write. No silently-stored garbage.
- **User overrides win, always.** `user_starred`, `user_suppressed`, and `user_annotation` are user-entered data and override AI-generated arbitration per the existing Cortex ownership hierarchy. Suppressed patterns are excluded from default reads.
- **Empirical decay is bounded.** Each pattern type declares `initial_decay_days`, `decay_floor_days`, `decay_ceiling_days`, and `calibration_sample_threshold` in its registry entry. The nightly Archivist calibration job cannot move `effective_decay_days` outside those bounds.
- **Patterns are observations, not opinions.** The customer can star, suppress, or annotate, but cannot directly edit `dimensions` or `outcome_value`. Those are empirical and immutable from the UI.
- **Pattern lifecycle is a state machine.** Legal transitions: `emerging → validated` (sample size and confidence cross threshold), `validated → declining` (recent evidence trend reverses or `decay_at` passes without re-validation), `declining → validated` (re-validation), `emerging | validated | declining → archived` (decayed past usefulness, customer-archived, or ICP removed). `archived` is terminal. The Archivist is the sole writer of these transitions and routes through `@kinetiks/lib/state-machines` like every other status-bearing entity.
- **Export and import are first-class.** `/api/cortex/patterns/export` is self-service, authenticated, rate-limited, logged. `/api/cortex/patterns/import` accepts the export schema, conservatively imports with `status: 'emerging'`, halved `confidence_score`, and fresh `effective_decay_days`. The customer's patterns belong to the customer.
- **Patterns compose with the Learning Ledger.** Every action taken because of a pattern logs back to the Ledger with `pattern_id` attached. Every pattern's evidence is itself sourced from Ledger entries. Closed loop, attributable both directions.

---

## Authority Grants Patterns

See `docs/Kinetiks Contract Addendum.md` §2 for the canonical spec.

- **The customer always approves a grant.** The Authority Agent proposes; it never grants and never executes. Approval is a first-class flow alongside Budget approval.
- **Action Class Registry is the contract.** Every `action_class` value is registered at app boot with a constraint schema (Zod), customer-facing template, LLM judgment budget, default-standing-grant eligibility, and whether it requires budget attachment. Unregistered action classes cannot appear in a grant capability.
- **Customer-facing language is enforced at the schema level.** Every `ActionClassDescriptor` carries a `customer_template` string that produces the plain-language sentence from a `constraints` block. The Authority Agent uses these templates for proposal summaries; the Cortex Authority tab uses them in active-grant cards. The customer reads sentences, not types. The literal phrase "Authority Grant" never appears in customer copy.
- **Authority resolution runs before every consequential action.** Sequence: identify `action_class` → find any active grant whose scope applies → narrowest-scope grant wins → check capability constraints, rate limits, spending envelope, escalation triggers → if all pass, execute and log with `grant_id`; if any fails, escalate to the customer with full context; if no grant covers it, fall back to the per-tool `autoApproveThreshold` and standard per-action approval. The Agent Runtime is the only place this logic lives.
- **Nested grants validate recursively.** Workflow-scoped grants nested inside a Program-scoped grant satisfy four rules: capabilities are a subset; constraints are at least as restrictive; spend envelopes do not exceed the parent; expiry does not exceed the parent. The Authority Agent proposes parent and children as a bundle for a single customer review. Editing either side re-validates in real time.
- **Budget remains non-negotiable.** A grant authorizes spend up to its envelope; the envelope itself never exceeds the relevant Budget category. Budget overages always route through Budget approval, regardless of grant status.
- **Every action under a grant emits a Learning Ledger entry with `grant_id` attached.** These are not surfaced individually to the customer; they are aggregated into the grant's `usage_summary` and the periodic digest.
- **Escalation triggers are five types in v1:** `anomaly`, `novelty`, `pacing`, `threshold`, `llm_judged`. The Action Class Registry declares the LLM judgment budget for `llm_judged`; grants may override within parent bounds.
- **Revocation reasons are first-class signal.** When a customer revokes or rejects a grant, the reason is a Learning Ledger entry that calibrates the Authority Agent's next proposal. The agent learns to ask for tighter authority over time when that is what this customer prefers.
- **Default standing grants are opt-in via the app manifest.** Each app declares `default_standing_grants` in its `KineticsAppManifest`. Only action classes flagged `available_in_default_standing_grants: true` are eligible (off by default, never includes spending or external-state classes). Defaults are proposed automatically on first-connect and reviewed at signup; the customer sees a diff if the manifest changes later.
- **Customer reversibility is structural.** Grants can be paused, narrowed, or revoked at any moment. Pause halts new actions immediately. Narrow re-runs validation against in-flight actions. Revoke flips status to `revoked` and writes a Ledger entry.

---

## Operator Workflows Patterns

See `docs/Kinetiks Contract Addendum.md` §3 for the canonical spec.

- **The Workflow primitive is the canonical orchestration shape for both cross-app and intra-app coordination.** The `WorkflowTask` schema carries `target_type: 'cross_app' | 'internal_operator'` and `target_app`. Cross-app dispatch goes through Synapse Routing Event; internal dispatch goes through the executing app's own Operator registry.
- **Programs stay cross-app.** A Program is a cross-app coordination structure that lives in `kinetiks_workflows` / `kinetiks_programs`. An app's internal Workflow is owned by the app and lives in the app's own prefixed tables (e.g. `im_workflows` for Implosion).
- **Operators are registered at app boot.** An `OperatorDescriptor` declares `key`, description, inputs/outputs schema, required tools, required pattern types, and the action classes the Operator may invoke. Unregistered Operators are not addressable from a Workflow task.
- **The Three-Layer communication rules are preserved.** Operators in app A cannot talk to Operators in app B. An internal Workflow in Implosion cannot reference Harvest's Composer as a task target; it must go through a Synapse Routing Event. Synapses still do not talk to other Synapses.
- **When to use a Workflow inside an app.** If the app's internal coordination has conditional branches, parallel-then-merge structure, or internal approval checkpoints, use a Workflow. Linear sequences with no branching stay on the existing scheduled-Operator pattern. Implosion needs internal Workflows; most other apps do not (yet).
- **Apps without internal Workflows omit the `operator_registry` field from their manifest.** Nothing to declare, nothing to validate.

---

## Synapse Patterns

Synapse is the contract between suite apps and Cortex. See `docs/platform-contract.md` for the full spec and `docs/Kinetiks Contract Addendum.md` for the 2027 extensions.

- **Apps never write to `kinetiks_*` tables directly.** All cross-app data flow goes through Synapse Proposals (for identity-shaped Context Structure updates) and Pattern emissions (for empirical signatures). The only exception is the Synapse handler itself, which is the canonical writer.
- **Proposals are typed and versioned.** The Proposal contract types and the Pattern types live in `@kinetiks/types`. The contract is append-only without a versioned migration; breaking changes require a `synapse_version` bump in the platform contract.
- **`evaluateProposal()` takes a full Proposal object, not an id.** This is the most common integration mistake.
- **Proposal merges are layer-aware.** Scalar fields are sacred (last-write-wins is wrong; Archivist arbitrates by confidence). Array fields are additive (proposals add, never replace, unless explicitly tagged as a replace).
- **Patterns are evaluated by the Archivist on emission** for schema validity, statistical soundness, and duplicate/update detection. Novel patterns enter `emerging`; matched patterns update the existing record's evidence.
- **Apps register capabilities at boot** via the Synapse capability descriptor, plus pattern types (Pattern Type Registry), action classes (Action Class Registry), and Operators (Operator Registry, if internal Workflows are used). A capability, pattern type, action class, or Operator not registered is not callable, emittable, or addressable.
- **Commands and Authority Grant status changes route via Realtime, scoped per `account_id`.** Cross-account leakage is a critical bug.

---

## Tool Registry & Agent Runtime Patterns

The 2026 platform layer plus the 2027 extensions.

- **Every tool registers at boot** with name, description (LLM-readable), input schema (Zod), output schema (Zod), per-account availability resolver, and approval class.
- **The Pattern Type and Action Class registries are global; the Operator Registry is per-app, declared in the app manifest** (per the Kinetiks Contract Addendum §3.3). All three follow the same operating model: register at boot, validate on use, fail at boot rather than at runtime when descriptors are inconsistent.
- **The Agent Runtime is the only invoker.** Feature code does not call tools directly. Tests double-mock the runtime, not individual tools.
- **Tool calls are logged.** Every invocation emits a `tool_calls` row with task id, agent id, tool name, account id, latency, success, error, and (where applicable) `grant_id` if the call was authorized by an active Authority Grant. PII rules for `ai_calls` apply identically here.
- **Authority resolution runs before action execution** per the flow in §2.9 of the Kinetiks Contract Addendum (also summarized in Authority Grants Patterns above). Tools that mutate external state declare an `action_class` in addition to their `approval_class`; the runtime resolves whether an active grant covers the call before invoking.
- **Tools that mutate external state declare an approval class.** The runtime enforces approval (or grant coverage) before the call.
- **The Metric Cache is shaped by tool behavior.** Cache key is `(account_id, tool_name, normalized_input_hash)`. Stale-while-revalidate is acceptable; never block a Marcus turn on a slow integration.
- **Background agents are described by a system prompt and a tool whitelist.** Adding an agent equals registering one record, not writing imperative orchestration code.
- **LLM judgment budgets are tracked per (account_id, action_class).** Daily and monthly windows. The router enforces the cap; on exhaustion, the action class's declared fallback applies (`structured_only` or `escalate_to_user`). Grant overrides on `GrantedCapability.llm_judgment_budget_override` are bounded by parent grants.

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
8. Add `team_scope_id text` (nullable, default null) on every new table participating in the 2027 trust architecture (Patterns, Authority Grants, Ledger entries, related calibration tables). No follow-up migration for v2.
9. Test with at least two seeded accounts, both an admin user and a member, before committing.
10. Update the seed script if the table needs seed data.
11. Commit migration, types, policies, and tests in a single PR.

Never hand-edit the production database.

---

## Definition of Done

A task is not done until all of the following are true:

- Feature works end-to-end in a local dev environment with the Floating Pill connected (for suite-app features) and with the Approval System (or active Authority Grant) engaged (for any external-state action).
- Loading, error, and empty states implemented.
- Keyboard accessible, focus states visible, dark mode rendered intentionally.
- Responsive for any view a user touches.
- RLS policies in place and pgTAP-tested for any new user-owned table. Cross-tenant test passes.
- State machine enforced at server action plus Postgres trigger plus RLS for any status-bearing entity (including Authority Grant lifecycle and Pattern lifecycle).
- Synapse Proposal shape verified on both sides if the change crosses an app boundary. Pattern emissions verified against the Pattern Type Registry. Action class references verified against the Action Class Registry.
- For UI surfaces involving authority: customer-facing copy uses the plain-language `customer_template` rendering, not raw constraint fields. The phrase "Authority Grant" does not appear.
- TypeScript compiles with zero errors. Lint passes with zero warnings.
- Unit tests added or updated where appropriate.
- Playwright test added or updated for any critical flow change.
- Approval System gates verified for any external-state action. Authority resolution verified when an active grant could cover the action.
- Learning Ledger entries fire on state-changing actions, with `grant_id` and `pattern_id` attached where applicable.
- `ai_calls` rows fire for every AI invocation. `tool_calls` rows fire for every Agent Runtime invocation, with `grant_id` attached when authorized by a grant.
- PostHog product events fire on user actions per spec.
- Sentry captures on all error paths with the canonical context shape.
- All UI values reference `--kt-*` tokens. No hardcoded colors, fonts, sizes, radii, shadows, or motion durations. Light and dark both rendered per the design spec.
- `team_scope_id` is `null` in every row created by v1 code, and queries treat null as the implicit single-user team.
- Commit history is clean (squash WIP if needed).
- PR opened with full description. Screenshots or Loom for any UI change. Self-reviewed before requesting review.
- Compared against the relevant spec section, the platform contract, and the Kinetiks Contract Addendum (where applicable) before marking complete.
- **Edge Functions deployed and schedule-set.** If the phase added or modified anything under `supabase/functions/`, run `pnpm functions:check` until it reports OK, run `pnpm functions:deploy` if not, and verify every cron schedule exists in `supabase/migrations/*_edge_function_schedules.sql` with the cadence declared in the function's header comment. Code in the repo is not code in production.
- **Environment variables set + inventoried.** Every new env var consumed by a function or route is (a) set in BOTH Supabase (Edge Function env) and Vercel (Node env) where applicable, and (b) added to `docs/operational/env-vars.md` in the same PR. A function that silently falls back on `||` defaults is masking a missed step; verify by reading the function's logs for one real run.
- **Production deploys green.** The latest Production deploy on Vercel must be Ready. `pnpm health` runs every check this section names in one command and fails on the first red signal. If any deploy is failing, fixing it is the next task — not the next phase.

If any of these are skipped, the task is not done, it is in progress.

---

## Lessons (to be filled as we ship)

This section accumulates Kinetiks-specific scars from real review and real bugs. Each entry should name the failure shape, the durable rule, and where the rule lives in code. Add entries here when a class of bug recurs or a review surfaces a pattern.

Seed entries from the Marcus engine v2 cycle:

### 1. Post-generation validation is the wrong abstraction for semantic LLM problems

Plan 1 wrapped Marcus output in a `DataAvailabilityManifest` validator, regex checks, and a Haiku rewrite loop. None of it worked, because the failure was that the response was generated against the wrong evidence in the first place. Plan 2 moved the manifest to a pre-generation Haiku call producing a structured evidence brief placed adjacent to the user's question. **Rule:** semantic LLM behavior is shaped by what the model sees before generating, not by checks run after. Validation belongs at structural layers (action emission, approval gating, authority resolution), not at semantic layers.

### 2. Cortex context tables use a `data` jsonb column; Pattern Library and Authority Grants are hybrid

The Marcus manifest builder bug shape was: query `kinetiks_voice` instead of `kinetiks_context_voice`, expect top-level fields rather than the `data` jsonb shape with `confidence_score` sibling, and pass `auth.users.id` instead of `kinetiks_accounts.id`. **Rule:** all `kinetiks_context_*` tables follow the `(account_id, data jsonb, confidence_score float, ...)` shape. `kinetiks_pattern_library` and `kinetiks_authority_grants` are hybrid: queryable lifecycle fields (status, scope, confidence_score, decay_at, user_starred, etc.) are top-level columns for indexing, RLS, constraints, and the read paths that filter on them; the variable-shape payload (`dimensions` + `outcome_metrics` for patterns; `granted_capabilities` + `escalation_triggers` + `usage_summary` for grants) is jsonb. The hybrid is necessary because the read path for patterns needs indexed access on `(pattern_type, status, applies_to_icp, confidence_score, decay_at)` and the authority resolution path runs on every consequential action and must filter cheaply. Read through `@kinetiks/cortex/context-readers` for context layers, and through `apps/id/src/lib/cortex/patterns/list.ts` (the single shared helper feeding both `query_patterns` and the Cortex Patterns UI) for patterns; never raw selects from feature code.

### 3. False promises are worse than silence

Marcus saying "I've queued briefs to Harvest" without an actual approved action emitted is a trust-critical failure. The fix was structural: action generation is a separate Haiku pass with structural filtering on the response body. **Rule:** the response body cannot make claims about state changes. State-change language is only legal when emitted through the action channel and confirmed by Approval or by an active Authority Grant.

### 4. Sycophancy and verbosity are behavioral, not stylistic

These cannot be filtered out post-hoc. They show up as patterns the model is rewarded for and have to be unlearned at the prompt level. **Rule:** the Marcus persona prompt carries explicit anti-sycophancy and anti-verbosity rules with examples. Style filters in the rewrite loop did not help.

### 5. Cache TTL belongs on the row, not on a generated column

D1's first sketch of `kinetiks_metric_cache` derived `expires_at` from `refreshed_at + stale_after_seconds` via a Postgres generated column. Two states (fresh / stale) instead of three (fresh / stale-usable / hard-miss) and policy-coupled-to-data forever. **Rule:** `kinetiks_metric_cache.expires_at` is a real column set on each write. Marcus needs to hedge on stale answers, so the tool surfaces `cache_status: 'fresh' | 'stale_revalidating' | 'fresh_from_extractor'` in its output. Future per-metric-class TTL changes touch the cache helper, not the schema.

### 6. Marcus tool calls are pre-decided, not multi-turn

D1's step 7.5 (a Haiku that ranks the user message against registered tools, picks zero or one, and either invokes via the Runtime or skips) was deliberately not implemented as a Claude multi-turn `tool_use` loop. **Rule:** one Haiku decides, one Sonnet writes. Bounded token budget, no risk of Sonnet hallucinating a tool name post-generation, and the trace shape stays consistent with v2's "pre-analysis dictates downstream" architecture. Revisit only when a phase needs to compose tool results from multiple sources (D3, GSC + Stripe).

### 7. Cron + Node API split for Deno-incompatible SDKs

Edge Functions run under Deno; `@google-analytics/data` is Node-only. D1's `metric-cache-cron` (Deno) therefore POSTs to `/api/internal/metric-cache/refresh` in apps/id (Node) for every due cache row. **Rule:** any cron that needs a Node-only SDK calls back into apps/id via `INTERNAL_SERVICE_SECRET`-authenticated route. Same pattern as `gmail-sync-cron` → Harvest API. Document the boundary in the cron's code comments and README so future contributors do not waste a day trying to import a Node SDK in Deno.

### 8. "Code in the repo" is not "code in production"

D1 shipped with twelve Edge Functions under `supabase/functions/*` — zero of which had ever been deployed to Supabase. The repo had been treated as the source of truth for what was running, but Edge Functions require an explicit `supabase functions deploy` step. The same gap exists in spirit for any infrastructure that lives outside the Vercel git-push pipeline: Supabase cron schedules, dashboard env vars, Google OAuth consent screens. **Rule:** the Definition of Done for any phase that adds Edge Functions, env-var requirements, or cron schedules MUST include verification that the deployed state matches the repo. Drift is silent and load-bearing: `gmail-sync-cron` not being deployed meant no Gmail replies were being polled in production while the code asserted they were.

**How to check:** `pnpm functions:check` compares the repo's `supabase/functions/*` against the deployed list and exits non-zero on drift. Wire it into CI alongside `pnpm lint` / `pnpm type-check`.

**How to fix:** `pnpm functions:deploy [name ...]` deploys every function in the repo (or only the ones named), using the project ref pinned in the script. Re-runs are idempotent.

**How to extend:** adding a new Edge Function means three steps, all version-controlled: (1) drop it under `supabase/functions/<name>/index.ts`; (2) add a `_kt_schedule_edge_function('<name>', '<cron>', '<name>')` line to the latest `*_edge_function_schedules.sql` migration (or a new follow-up migration); (3) run `pnpm functions:deploy` and `supabase db push --linked`. The deploy script and the cron migration together are the source of truth — `pnpm functions:check` will fail until both sides match the repo.

**Why schedules live in a migration, not the dashboard:** Supabase's Edge Function dashboard does not have a Schedules tab; cron is set up via `pg_cron` + `pg_net` extensions in SQL. Keeping that SQL in a versioned migration means schedules survive environment rebuilds, can be code-reviewed, and the drift script can verify them.

### 9. instrumentation.ts is bundled for both runtimes; structure accordingly

`apps/id/src/instrumentation.ts` runs at server boot in BOTH the Node and Edge runtimes. Anything statically reachable from it is bundled for both — and the Edge bundler cannot handle `node:crypto`, `node:fs`, native gRPC, or anything else Node-only. D1's first push to the D1 branch broke production preview deploys because the new extractor barrel made `instrumentation.ts` transitively reach `webhooks/sign.ts` (bare `crypto` import) and `@google-analytics/data` (gRPC). **Rule:** `instrumentation.ts` is a tiny shim with no Node-only imports. All platform wiring lives in `instrumentation-node.ts`, loaded only inside `if (process.env.NEXT_RUNTIME === "nodejs") { await import("./instrumentation-node"); }`. Note the if-statement form — early-return doesn't tree-shake correctly in Next 14. Two corollaries: every Node-only import in the workspace uses `node:crypto` / `node:fs` / etc (never bare `"crypto"`); and any lazily-loaded native SDK (`@google-analytics/data`, `googleapis`, `google-auth-library`) gets `/* webpackIgnore: true */` on its dynamic import so webpack doesn't try to create an Edge chunk for it.

(Add entries below as new scars accumulate.)

---

## Red Flags - Never Do These

- Commit to `main`
- Commit secrets or `.env*` files
- Use `any` to make a type error go away, or `@ts-ignore` without a comment and a follow-up
- Call `@anthropic-ai/sdk` directly instead of going through `@kinetiks/ai/router`
- Write to `kinetiks_*` tables from a suite app instead of going through Synapse
- Write to `kinetiks_pattern_library` from a suite app or from feature code - the Archivist is the canonical writer; emit via Synapse
- Read patterns with raw selects instead of going through the `query_patterns` tool (which enforces the read allowlist)
- Hardcode a `pattern_type` or `action_class` instead of registering it in the Pattern Type Registry or Action Class Registry
- Reference an unregistered Operator from a Workflow task target
- Skip authority resolution in the Agent Runtime - every consequential action checks for a covering grant before falling back to per-tool approval
- Bypass the Approval System for an action that mutates external state when no active grant covers it
- Auto-approve a Budget proposal under any circumstance, with or without a covering grant
- Define a grant capability whose `action_class` has `always_requires_budget_attachment: true` without attaching it to a Budget category
- Allow a child grant whose capabilities, constraints, spend envelope, or expiry exceed its parent
- Use the literal phrase "Authority Grant" in customer-facing copy. The customer-facing word is "Authority"; render constraints via the action class `customer_template`.
- Default `team_scope_id` to anything other than `null` in v1
- Ship a Workflow that targets a cross-app capability without going through Synapse Routing Event (use `target_type: 'cross_app'`, not a direct in-app dispatch)
- Hardcode a metric list when an agent with tools should reason about what to query
- Ship a static CRON pipeline when an agent with tools would be more flexible
- Skip RLS because "we'll add it later"
- Skip pgTAP because "the Playwright test covers it"
- Use `auth.users.id` as the scoping key in Cortex code
- Read top-level fields from `kinetiks_context_*` tables instead of the `data` jsonb shape
- Let Marcus claim an action has been queued before it has been approved (or covered by an active grant) and emitted
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
- Hardcode a color, font, font-size, radius, shadow, or motion duration in a component instead of using a `--kt-*` token from `packages/ui/styles/kinetiks-tokens.css`
- Use a font, color, or motion value that is not defined in the design spec / token system
- Implement a Button, Input, Card, Pill, ConfidenceRing, or Floating Pill inside an app instead of `packages/ui`
- Ship a UI surface without consulting `design/kinetiks-design-spec.md` first
- Build 8 shallow pages instead of 3 deep ones, or use "Coming in Phase 2" as an excuse for missing core logic
- Mark a feature complete without comparing to the spec doc (and the Kinetiks Contract Addendum, where applicable)
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

- **`design/kinetiks-design-spec.md`** - THE design spec (visual system, tokens, components, light/dark mechanics, Marcus voice in the UI). Implementation in `packages/ui/styles/kinetiks-tokens.css`.
- **`docs/README.md`** - map of the docs folder. Read first if unfamiliar.
- **`docs/kinetiks-product-spec-v3.md`** - the canonical product spec
- **`docs/platform-contract.md`** - how apps, integrations, and agents plug into Kinetiks
- **`docs/Kinetiks Contract Addendum.md`** - THE Kinetiks Contract Addendum (Pattern Library, Authority Grants, Operator Workflows, multi-user placeholders). Part of the canonical contract.
- **`docs/kinetiks-core-architecture-v2.md`** - the agent-native architecture (tool layer, agent runtime, insight store, approval membrane)
- **`docs/kinetiks-roadmap.md`** - strategic priorities and timeline
- **`docs/collaborative-workspace-spec.md`** - desktop app interaction model (split-panel collaboration, presence, task drawer with kill switch)
- **`docs/specs/approval-system-spec.md`** - Approval System architecture (the most critical system)
- **`docs/specs/cross-app-command-router-spec.md`** - command routing
- **`docs/specs/analytics-goals-engine-spec.md`** - Oracle architecture, goals, Budget
- **`docs/specs/agent-communication-layer-spec.md`** - email, Slack, calendar
- **`docs/specs/marcus-engine-v2-plan.md`** - Marcus engine architecture (current)
- **`docs/specs/marcus-v2-testing-playbook.md`** - manual testing playbook for the v2 engine
- **`docs/specs/programs-spec.md`** - Programs / Workflows / Tasks hierarchy (formerly "Platform Addendum")
- **`docs/specs/autopilot-spec.md`** - GTM Autopilot specification
- **`docs/specs/sneaky-spec.md`** - founder-only meta-agent that produces Claude-Code-ready feature proposals
- **`docs/specs/spec-addendum-chat-ux.md`** - Chat tab UX patterns and Marcus product-suite intelligence (intended to be merged into v3; that merge is still pending)

Historical reference (do not build from):
- **`docs/archive/marcus-conversation-quality-plan.md`** - Plan 1 for the Marcus engine, superseded by `marcus-engine-v2-plan.md`

Per-app `CLAUDE.md` files at `apps/{code}/CLAUDE.md` document each app's internal architecture, tables, Operators, Synapse capabilities, pattern types emitted, action classes declared, and current state. Read those when working inside a specific app. Read this file for cross-cutting rules.

---

## Current Phase

Check the active milestone or ask Zack. Work the phase tasks in order. Cross-phase work needs explicit approval.

The current focus is the 2026 platform layer: Tool Registry, Agent Runtime, Metric Cache, Insight Store, and the first real integration (GA4) end-to-end. Marcus answering "how is my traffic?" with real data through tools is the proof point. Everything else queues behind it.

The Kinetiks Contract Addendum subsystems queue behind that work in dependency order: Pattern Type Registry + Pattern Library tables (Phase 1, ships before Implosion - Harvest and Dark Madder can emit on existing data), Empirical Decay Calibration (Phase 2, ~90 days after first patterns emerge), Operator Workflows extension (Phase 3, in time for Implosion scoping), Authority Grants + Authority Agent (Phase 4, closer to Implosion launch), Default Standing Grants and signup flow (Phase 5, with Phase 4).
