# CLAUDE.md - Kinetiks AI Monorepo

> **This is the single source of truth for the entire Kinetiks AI codebase.**
> Read this file completely before every task. It contains the monorepo structure, architecture, data model, agent system, conventions, and rules that govern all apps.
> For how apps, integrations, and agents plug into the platform, read `docs/platform-contract.md`.
> For the full product vision, read `docs/kinetiks-product-spec-v3.md`.

---

## Project Overview

Kinetiks AI is a GTM operating system. The core product is the Kinetiks app (web at kinetiks.ai + Electron desktop) - a three-tab interface (Chat, Analytics, Cortex) where users manage their entire go-to-market operation through natural language conversation with their named AI system.

**The 2026 architecture:** The LLM is the orchestration layer, not a feature on top. Marcus (the conversational engine) and background intelligence agents have tool access to all connected data sources and apps. They reason about what data to query, what patterns matter, and what actions to take. The approval system gates consequential actions. The system gets smarter over time through the Learning Ledger.

**Apps-first model:** Users can sign up for any suite app and use it standalone. Every signup creates a Kinetiks ID behind the scenes. Kinetiks is the orchestration layer users opt into when they want cross-app intelligence and the conversational command interface.

**The system identity:** Users name their GTM system (freeform - "Kit", "Archer", etc.). This name talks to them in Chat, appears in Slack, sends emails, shows up in approvals. The underlying engine is Marcus, but the user never sees that name.

**Company:** Kinetiks AI
**Author:** Zack Holland

---

## Current State (What Actually Exists)

### Built and Real

| Component | Files | LOC | Status |
|-----------|-------|-----|--------|
| **Kinetiks Core (apps/id)** | 290 | 37k | Phases 1-6 complete. Chat, Analytics, Cortex, Cartographer, Archivist, Marcus v2, Oracle schemas, approvals, agent comms, connections framework |
| **Harvest (apps/hv)** | 214 | 26k | Full UI built (Greenhouse/Field/Market). Needs end-to-end workflow fixes. |
| **Desktop (apps/desktop)** | 4 | 200 | Electron skeleton (main, tray, notifications, preload) |
| **Shared packages** | 94 | 13k | types, ui, supabase, synapse, ai, mcp, cortex, sentinel - all functional |
| **Database** | 28 migrations | - | Core + Marcus + Harvest schemas with RLS |

### Not Yet Built

| Component | Notes |
|-----------|-------|
| **Dark Madder (apps/dm)** | Exists as standalone repo, needs monorepo migration |
| **Hypothesis (apps/ht)** | Not started |
| **Litmus (apps/lt)** | Not started |
| **Tool registry + agent runtime** | The 2026 platform layer - next to build |
| **Integration extractors** | Connection framework exists (9 providers, OAuth, encryption) but zero actual data flows |

### The Critical Gap

The connections system has 9 providers defined with OAuth and encryption, but `registerExtractor()` is never called. The Oracle has types and schemas but no data flowing into it. Marcus can't reference real metrics. The intelligence layer has no fuel. **Building the tool infrastructure and first real integrations is the highest priority.**

---

## Monorepo Structure

```
kinetiks/
  apps/
    id/                          # kinetiks.ai - Core app (Chat, Analytics, Cortex)
    desktop/                     # Electron wrapper for desktop app
    hv/                          # hv.kinetiks.ai - Harvest (outbound engine)
    dm/                          # dm.kinetiks.ai - Dark Madder (content engine) [to be migrated]
    ht/                          # ht.kinetiks.ai - Hypothesis (landing pages) [future]
    lt/                          # lt.kinetiks.ai - Litmus (PR engine) [future]
  packages/
    types/                       # @kinetiks/types - All shared types
    ui/                          # @kinetiks/ui - Floating pill, shared components
    supabase/                    # @kinetiks/supabase - DB clients, auth middleware
    synapse/                     # @kinetiks/synapse - App-to-Cortex communication
    ai/                          # @kinetiks/ai - Claude API wrapper, prompt utilities
    mcp/                         # @kinetiks/mcp - MCP server for Claude Code integration
    sentinel/                    # @kinetiks/sentinel - Content review, brand safety
    cortex/                      # @kinetiks/cortex - Cortex primitives, Operator Profile
  supabase/
    migrations/                  # ALL database migrations (shared DB)
    seed.sql
    functions/                   # Supabase Edge Functions
  docs/
    platform-contract.md         # How apps/integrations/agents plug in [THE REFERENCE]
    kinetiks-product-spec-v3.md  # Full product vision
    specs/                       # System specs (approval, command router, analytics, comms)
  turbo.json
  pnpm-workspace.yaml
  CLAUDE.md                      # THIS FILE
```

### Package Resolution

```json
{
  "dependencies": {
    "@kinetiks/types": "workspace:*",
    "@kinetiks/ui": "workspace:*",
    "@kinetiks/supabase": "workspace:*",
    "@kinetiks/synapse": "workspace:*",
    "@kinetiks/ai": "workspace:*"
  }
}
```

### Vercel Deployment

Each app deploys separately:
- `apps/id` → kinetiks.ai
- `apps/hv` → hv.kinetiks.ai
- `apps/dm` → dm.kinetiks.ai
- `apps/ht` → ht.kinetiks.ai
- `apps/lt` → lt.kinetiks.ai

### One Supabase Project

All apps share a single Supabase project. Tables use app prefixes:
- `kinetiks_*` - core platform (Context Structure, Proposals, Ledger, Goals, Insights, etc.)
- `hv_*` - Harvest
- `dm_*` - Dark Madder
- `ht_*` - Hypothesis
- `lt_*` - Litmus

RLS enforced on every user-owned table. Service role used only by Edge Functions.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Desktop:** Electron
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (Postgres + Auth + Realtime + Edge Functions + Storage)
- **AI:** Anthropic Claude API (Sonnet for agents/analysis, Haiku for lightweight tasks)
- **Styling:** Tailwind CSS + Geist font stack
- **Crawling:** Firecrawl API
- **Enrichment:** People Data Labs
- **Email:** Resend (transactional), Google Workspace / Microsoft 365 (system identity)
- **Analytics integrations:** GA4, GSC, Stripe, Google Ads, Meta Ads, HubSpot, social platforms
- **Hosting:** Vercel (web), Electron auto-update (desktop)
- **Slack:** Slack Bolt
- **Package manager:** pnpm

---

## Architecture

### The Agent-Native Model

Kinetiks is not a traditional SaaS with AI bolted on. The intelligence layer IS the product.

**Tools, not pipelines.** Every integration, app, and platform capability exposes tools that agents can invoke. Marcus queries GA4 directly via tools when a user asks about traffic. Background agents browse competitor websites via tools when monitoring the landscape. No hardcoded metric extractors, no static CRON pipelines.

**Agents with reasoning, not scripts with configs.** Background intelligence agents have system prompts that define their mission and tool access. They decide what to query, what patterns matter, and what to surface. Adding a new intelligence capability = writing a new system prompt + registering the agent.

**Approval gates actions, not analysis.** Agents can read any data freely. Actions that change external state (sending email, publishing content, creating campaigns) go through the confidence-based approval system.

### Core Components

**Marcus** — The conversational AI engine behind the user's named system. Has tool access to all connected data sources and apps. Reasons about what the user needs, queries data live, orchestrates cross-app actions. Not a chatbot reading pre-assembled context - a strategist with tools.

**Tool Registry** — Central registry of all tools available to agents. Integration tools (GA4, Stripe, etc.), app tools (Harvest, Dark Madder, etc.), and platform tools (web search, context reading, insight storage). Per-account tool availability based on what's connected.

**Agent Runtime** — Executes background intelligence agents within safety boundaries. Handles tool resolution, approval gating, cost tracking, error recovery, and logging.

**Insight Store** — Where agents write their discoveries. Insights are first-class objects with type, severity, evidence, and suggested actions. Marcus reads undelivered insights and weaves them into conversation. The analytics tab displays them. Notifications push urgent ones.

**Metric Cache** — Write-through cache for data source query results. When an agent queries GA4, the result is cached. Subsequent queries hit the cache. Shaped by agent behavior, not by a predefined metric list.

### The Three-Layer Agent System

**Layer 3 - Cortex:** Core intelligence. Context Structure, Proposals, routing, confidence scoring. Four Operators: Cartographer (intake), Archivist (quality), Marcus (conversation/orchestration), Oracle (analytics intelligence).

**Layer 2 - Synapse:** One per app. The membrane between an app and the core. Pulls context, submits proposals, receives routing events, reports metrics. See `docs/platform-contract.md` §2.

**Layer 1 - Operator:** App-internal agents. Live in each app's directory. Report to their Synapse only.

### Communication Rules (ABSOLUTE)

1. Operators never touch Cortex. They report to their Synapse only.
2. Synapses talk only to the Cortex and their own Operators. Never to other Synapses.
3. Cortex talks only to Synapses and its own Operators.
4. All intelligence crosses the app boundary via Proposal (up), Routing Event (down), or Tool call (down).
5. User-entered data always wins over AI-generated data. Always.
6. Everything is logged in the Learning Ledger with full attribution.

---

## Navigation & Application Architecture

### The Kinetiks App

Three tabs: **Chat** (default) | **Analytics** | **Cortex**

- **Chat:** Conversational interface with the named system. Thread history in left sidebar. Approvals toggle in sidebar. Suggestion chips. Slash commands.
- **Analytics:** Insight-forward dashboard. Agent discoveries, goal progress, cross-app performance. Not a chart gallery - an intelligence surface.
- **Cortex:** Business identity management. Context Structure viewer/editor, Goals, Integrations, Learning Ledger.

Settings in a modal (like Claude desktop). Admin stuff never competes with the product.

### Shared Auth

Single session across all subdomains via `.kinetiks.ai` cookie. Users sign in once at kinetiks.ai. Every app reads the same session.

---

## Proposal Protocol

```typescript
interface Proposal {
  id: string;
  source_app: string;
  source_operator: string | null;
  target_layer: ContextLayer;
  action: 'add' | 'update' | 'escalate';
  confidence: 'validated' | 'inferred' | 'speculative';
  payload: Record<string, any>;
  evidence: Evidence[];
  expires_at: string | null;
  submitted_at: string;
}
```

### Evaluation Pipeline (5 steps)

1. **Schema validation** - well-formed? Correct payload for target layer?
2. **Conflict detection** - contradicts user data (decline)? Higher-confidence existing (decline)?
3. **Relevance scoring** - evidence quality, recency, specificity, novelty
4. **Merge** - `add` inserts. `update` refines. `escalate` surfaces to user.
5. **Route** - determine which Synapses need this learning

### Ownership Hierarchy

1. User explicit (typed/uploaded) - SACRED for scalars, ADDITIVE for arrays
2. User implicit (edits, calibration)
3. Validated Proposals (confirmed by outcomes)
4. Inferred Proposals (AI analysis, unconfirmed)
5. Speculative Proposals (patterns, low certainty)

**"Sacred" means scalars, not arrays.** Company name can't be overwritten by AI. But competitor lists, messaging patterns, and personas can be extended by proposals.

---

## Confidence Scoring

| Layer | Weight | Why |
|-------|--------|-----|
| Org | 8% | Foundational but simple |
| Products | 18% | Directly impacts output accuracy |
| Voice | 18% | Difference between AI-generic and sounds-like-me |
| Customers | 14% | Targeting accuracy |
| Narrative | 12% | Storytelling differentiation |
| Competitive | 12% | Positioning quality |
| Market | 10% | Trend relevance |
| Brand | 8% | Visual/asset consistency |

---

## Workflow Rules (CRITICAL - ALWAYS FOLLOW)

### Planning

1. **Plan before building.** Output a numbered plan. Wait for explicit approval.
2. **Scope tightly.** Each plan covers ONE cohesive task.

### Building

3. **One file at a time.** Create or modify one file, verify, then move to the next.
4. **Write complete code.** No placeholders, no TODOs, no skeleton functions.
5. **No dead code.** Every import used. Every function called.
6. **Type everything.** Strict mode. No `any`. No assertions without comment.

### Testing

7. **Test after every file.** Type check, lint, dev server after each change.
8. **Edge cases first.** Errors, empty states, loading states before happy path.

### Code Style

9. **Explicit > clever.** Readable beats short.
10. **Colocate related code.** Component + its type + its hook live together.
11. **Server components by default.** Only "use client" when needed.
12. **RLS is mandatory.** Every table. Never bypass with service role in client code.

### Commits

13. **Conventional commits.** `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
14. **Commit after each completed task.** Don't batch a whole feature.

### Build Standards (CRITICAL)

15. **Read specs before building.** CLAUDE.md describes structure. Spec docs describe what to build and why.
16. **Depth over breadth.** Fewer features at full depth.
17. **"Done" means:** matches spec + AI workflows functional + UX designed for actual use case + would impress a user.
18. **No scaffold products.** Never "table + modal + panel" without understanding what the feature does.
19. **Read `docs/platform-contract.md` before building anything that plugs into the core.** Apps, integrations, agents - all follow the contract.
20. **Compare against spec before marking complete.**

### Anti-Patterns (NEVER)

- Building a page as generic CRUD without understanding the feature
- Marking complete without comparing to spec
- Building 8 shallow pages instead of 3 deep ones
- "Coming in Phase 2" as excuse for missing core logic
- Skipping docs/ when it contains requirements
- "Clean compile. All done." when the product doesn't match spec
- Hardcoded metric lists when an agent should reason about what to query
- Static CRON pipelines when an agent with tools would be more flexible

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

# App
NEXT_PUBLIC_APP_URL=https://kinetiks.ai
KINETIKS_ENCRYPTION_KEY=

# Slack
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

---

## Implementation Lessons (from prior builds)

### Database
- UNIQUE constraints required for upsert. Every context layer table needs `UNIQUE(account_id)`.
- Check constraints on enum columns must be updated before adding new values.

### Environment Variables
- All keys must be set on Vercel. Missing causes silent failures.
- Vercel requires redeploy to pick up new env vars.
- Use `/api/health` to verify.

### Proposal Pipeline
- Proposals must pass schema validation. AI must know exact field names per layer.
- `evaluateProposal()` takes a full Proposal object, not an ID.
- Merge step concatenates arrays. Array proposals ADD, not replace.

### Error Handling
- Always include actual error message in API responses.
- MCP client must read 500 response bodies.

### AI Prompts
- Extraction prompts need full schemas with all valid field names.
- Competitive positioning is often implicit ("unlike agencies", "no markups").

### Tool Descriptions
- Tool descriptions are the most important part of the agent system. If Marcus can't understand what a tool does from its description, it won't use it correctly.
- Write descriptions for an LLM, not a developer. Include when to use, what's returned, and limitations.

---

## Key Decisions

- **No em dashes.** Use regular dashes in all copy and generated text.
- **Apps-first model.** Any app works standalone. Kinetiks is the upgrade.
- **System name, not Marcus.** User names their system. Marcus is invisible.
- **Three tabs.** Chat | Analytics | Cortex. Approvals in Chat sidebar.
- **Settings in a modal.** Admin never competes with the product.
- **Seeds currency** shared across all apps. Core tracks balance.
- **Supabase Realtime** for routing events and command delivery.
- **Append-only Learning Ledger.** Never delete entries.
- **User data is sacred** for scalars, additive for arrays.
- **Floating pill in suite apps.** Minimal standalone, full when connected.
- **Billing lives in core only.** Apps never handle billing.
- **Confidence-based autonomy.** Day one: everything approved. Over time: earned trust.
- **Four Cortex Operators.** Cartographer, Archivist, Marcus, Oracle.
- **Tools are the universal interface.** Integrations, apps, and platform all expose tools.
- **Agents reason, not scripts execute.** Background agents have prompts + tools, not hardcoded logic.
- **Insights are first-class.** Not chart data. Natural language, actionable, deliverable.
- **Metric cache, not metric store.** Cache what agents query, not predefined metric lists.
- **Approval gates actions, not analysis.** Read freely, act with permission.

---

## What to Build Next

Priority order (see `docs/kinetiks-roadmap.md` for full detail):

1. **Tool infrastructure** - Tool registry, agent executor, metric cache, insight store. Build alongside the first real integration, not in isolation.
2. **GA4 integration** - First integration proving the tool-based architecture end-to-end. Marcus can answer "how's my traffic?" with real data.
3. **Stripe + GSC integrations** - Revenue and search data flowing. The Oracle has real fuel.
4. **Fix Harvest** - End-to-end workflows working. List building, email sending, sequence execution.
5. **Dark Madder migration** - Port from standalone repo into monorepo. Wire Synapse + tools.
6. **Background agents** - Performance analyst, competitive intelligence, strategy advisor.
7. **Billing + Desktop** - Stripe Checkout, seeds, desktop notifications.
8. **Launch Harvest + Dark Madder** - Two real products that pull users into the ecosystem.
9. **Litmus + Hypothesis** - PR and landing pages join the suite.

---

## Related Documents

- **docs/platform-contract.md** - How apps, integrations, and agents plug into Kinetiks. THE reference for building anything that connects to the core.
- **docs/kinetiks-core-architecture-v2.md** - The 2026 agent-native architecture. Tool layer, agent runtime, insight store, approval membrane.
- **docs/kinetiks-roadmap.md** - Strategic roadmap with timeline.
- **docs/kinetiks-product-spec-v3.md** - Full product vision.
- **docs/specs/approval-system-spec.md** - Approval system architecture.
- **docs/specs/cross-app-command-router-spec.md** - Command routing.
- **docs/specs/analytics-goals-engine-spec.md** - Oracle architecture, goals.
- **docs/specs/agent-communication-layer-spec.md** - Email, Slack, calendar.
- **docs/specs/marcus-engine-v2-plan.md** - Marcus conversation engine.
- **docs/specs/marcus-conversation-quality-plan.md** - Marcus quality enforcement.
