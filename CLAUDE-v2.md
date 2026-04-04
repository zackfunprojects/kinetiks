# CLAUDE.md - Kinetiks AI Monorepo

> **This is the single source of truth for the entire Kinetiks AI codebase.**
> Read this file completely before every task. It contains the monorepo structure, shared architecture, data model, agent system, conventions, and rules that govern all apps.
> This file lives at the ROOT of the monorepo. Each app (apps/id, apps/dm, etc.) may have its own supplementary CLAUDE.md for app-specific context, but THIS file is the authority.
> For the full product vision, read `docs/kinetiks-product-spec-v3.md`.

---

## Project Overview

Kinetiks AI is a GTM operating system. The core product is the Kinetiks desktop app (Electron + web at kinetiks.ai) - a three-tab interface (Chat, Analytics, Cortex) where users manage their entire go-to-market operation through natural language conversation with their named GTM system, approve agent work, track cross-app performance, and define their business identity and goals.

The suite apps (Dark Madder for content, Harvest for outbound, Hypothesis for landing pages, Litmus for PR) are specialized tools that work standalone OR as part of the Kinetiks suite. When connected to Kinetiks, they share the business identity (Context Structure), coordinate through the agent system (Cortex/Synapse/Operator), and report into unified analytics.

**Apps-first model:** Users can sign up for any individual app and use it without ever touching Kinetiks. Every app signup creates a Kinetiks ID and Context Structure behind the scenes. Kinetiks is the orchestration layer users opt into when they want cross-app intelligence, unified analytics, and the conversational command interface.

**The system identity:** When a user connects to Kinetiks, they name their GTM system (freeform text - "Kit", "Archer", etc.). This name is what talks to them in Chat, appears in Slack, sends emails, and shows up in approvals. The underlying intelligence engine is Marcus (fourth Cortex Operator), but the user never sees that name.

**Company:** Kinetiks AI (this IS the company)
**Author:** Zack Holland

---

## Monorepo Structure

```
kinetiks/
  apps/
    id/                        # kinetiks.ai - Kinetiks core app (Chat, Analytics, Cortex)
    desktop/                   # Electron wrapper for the Kinetiks desktop app
    dm/                        # dm.kinetiks.ai - Dark Madder (content engine)
    hv/                        # hv.kinetiks.ai - Harvest (outbound engine)
    ht/                        # ht.kinetiks.ai - Hypothesis (landing page engine)
    lt/                        # lt.kinetiks.ai - Litmus (PR engine)
  packages/
    types/                     # @kinetiks/types - Context Structure, Proposal, Routing, Brand, Goal types
    ui/                        # @kinetiks/ui - Floating pill, shared components, design tokens
    supabase/                  # @kinetiks/supabase - Clients (browser/server/admin), auth middleware
    synapse/                   # @kinetiks/synapse - Synapse interface, template, Proposal builder helpers
    ai/                        # @kinetiks/ai - Claude API wrapper, shared prompt utilities
    mcp/                       # @kinetiks/mcp - MCP server for Claude Code / AI agent integration
    sentinel/                  # @kinetiks/sentinel - Shared validation, quality gates
  supabase/
    migrations/                # ALL database migrations (shared DB), numbered sequentially
    seed.sql                   # Dev seed data
    functions/                 # Supabase Edge Functions (Cortex CRON, Archivist CRON, Oracle CRON, etc.)
  docs/                        # All spec documents (PRDs, architecture docs, addenda)
    kinetiks-product-spec-v3.md  # THE product spec - read this for full product vision
  turbo.json                   # Turborepo pipeline config
  pnpm-workspace.yaml          # Workspace definition
  CLAUDE.md                    # THIS FILE - root-level authority
  .env.local                   # Shared env vars (gitignored)
```

### Package Resolution

Every app imports shared code via workspace packages:

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

In code: `import { FloatingPill } from '@kinetiks/ui'`
In code: `import type { Proposal, ContextStructure, Goal } from '@kinetiks/types'`

### Vercel Deployment

Each app is a separate Vercel project pointing to its subfolder:
- `apps/id` deploys to kinetiks.ai (was id.kinetiks.ai, now the main app domain)
- `apps/dm` deploys to dm.kinetiks.ai
- `apps/hv` deploys to hv.kinetiks.ai
- `apps/ht` deploys to ht.kinetiks.ai
- `apps/lt` deploys to lt.kinetiks.ai

Root `turbo.json` defines the build pipeline. Push to main rebuilds only apps with changes (Turborepo remote caching).

### One Supabase Project

All apps share a single Supabase project. Tables use app prefixes for ownership:
- `kinetiks_*` tables - owned by the core Kinetiks product (Context Structure, Proposals, Ledger, Goals, Analytics, Approvals, etc.)
- `dm_*` tables - owned by Dark Madder (articles, drafts, keywords, editorial calendar)
- `hv_*` tables - owned by Harvest (prospects, sequences, pipeline, contacts)
- `ht_*` tables - owned by Hypothesis (pages, tests, templates)
- `lt_*` tables - owned by Litmus (journalists, articles, mentions, campaigns, pitches)

RLS policies ensure users can only access their own data. Service role used only by Edge Functions (Cortex, Archivist, Oracle, Synapses).

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Desktop:** Electron (wraps the Next.js web app)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (Postgres + Auth + Realtime + Edge Functions + Storage)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514 for agents, claude-haiku-4-5-20251001 for lightweight tasks)
- **Styling:** Tailwind CSS 4
- **Crawling:** Firecrawl API (website extraction) or Cloudflare /crawl endpoint
- **Enrichment:** People Data Labs (contact data)
- **Email:** Resend (transactional); Google Workspace / Microsoft 365 (system identity email)
- **Analytics integrations:** GA4 (OAuth), Google Search Console (OAuth), Stripe (API key)
- **Hosting:** Vercel (web apps); Electron auto-update for desktop
- **Slack:** Slack Bolt for JavaScript (system bot identity)
- **Package manager:** pnpm

---

## Architecture Overview

### The Three-Layer Agent System

Every piece of intelligence in Kinetiks flows through three layers:

**Layer 3 - Cortex:** The core intelligence engine. Lives in this project. Maintains the Context Structure, processes Proposals, routes learnings, scores confidence. Has four Operators: the Cartographer (intake), the Archivist (data quality), Marcus (conversational intelligence / the engine behind the named system), and the Oracle (analytics intelligence).

**Layer 2 - Synapse:** One per Kinetiks App. The membrane between an app and the shared identity. Each app has exactly one Synapse deployed as an Edge Function. The Synapse template lives in this project. App-specific Synapses are deployed from each app's repo but follow the interface defined here.

**Layer 1 - Operator:** App-internal agents doing work. These do NOT live in this project. They live in each app's repo. They never touch the Kinetiks ID directly.

### Communication Rules (ABSOLUTE - NEVER VIOLATE)

1. Operators never touch Cortex. They report to their Synapse only.
2. Synapses talk only to the Cortex and their own Operators. Never to other Synapses.
3. Cortex talks only to Synapses and its own Operators (Cartographer, Archivist, Marcus, Oracle).
4. All intelligence crosses the app boundary via Proposal (up), Routing Event (down), or Command (down).
5. User-entered data always wins over AI-generated data. Always.
6. Everything is logged in the Learning Ledger with full attribution.

---

## Navigation & Application Architecture

### The Kinetiks Desktop App

The primary product is an Electron desktop app wrapping the Next.js web app at kinetiks.ai. Both desktop and web share the same codebase. Environment detection determines platform-specific features (system tray, native notifications, keyboard shortcuts).

### Layout (Mirrors Claude Desktop)

**Top bar:** Three tabs - **Chat** | **Analytics** | **Cortex**. Settings/profile avatar on the right.

**Left sidebar (Chat tab only):** Toggles between two panels:
- **Chat History** - Thread list, searchable, new chat button. Like Claude desktop's chat list.
- **Approvals** - Pending approval queue. Toggled like Claude desktop's Projects toggle.

**Main area (Chat tab):** Conversation interface with the user's named system. Message input, streaming responses, markdown rendering, rich content blocks, action cards.

**Analytics tab:** Full-width analytics dashboard powered by the Oracle. No sidebar. Cross-app KPI scoreboard, goal tracking, trend visualization.

**Cortex tab:** Internal sub-navigation on the left side with sections: Identity, Goals, Integrations, Ledger. Main area shows selected section.

**Settings modal:** Triggered by profile/avatar icon in top bar. Opens as overlay. Contains: Account, Organization, Billing, API Keys, Notifications, Team/Seats, Danger Zone.

### Domain Structure

| Domain | Type | Purpose |
|--------|------|---------|
| kinetiks.ai | App + Marketing | Kinetiks core app (desktop + web) and platform marketing |
| darkmadder.com | Marketing | Dark Madder landing page. CTA links to signup with ?from=dark_madder |
| dm.kinetiks.ai | App | Dark Madder web app |
| hv.kinetiks.ai | App | Harvest web app |
| ht.kinetiks.ai | App | Hypothesis web app |
| lt.kinetiks.ai | App | Litmus web app |

### Shared Auth (Single Session Across All Subdomains)

One Supabase Auth project. The session cookie domain is set to `.kinetiks.ai` so it's shared across all subdomains. Log in once at kinetiks.ai, authenticated everywhere. Each app's Next.js middleware checks the shared session - if not authenticated, redirect to kinetiks.ai/login?redirect={current_app_url}.

**Implementation:**
- Supabase client configured with `cookieOptions: { domain: '.kinetiks.ai' }`
- Each app's middleware reads the same session cookie
- Token refresh handled by whichever app the user is currently in
- Logout from any app clears the shared cookie (logs out everywhere)

### User Journeys

**Path A - App-first (most users):**
1. User discovers Dark Madder via darkmadder.com
2. Signs up - redirected to kinetiks.ai/signup?from=dark_madder
3. Brief education screen: "Dark Madder is powered by a business intelligence layer..."
4. Account creation, Kinetiks ID assigned (codename)
5. Cartographer onboarding framed for content: "Let's learn your voice"
6. Redirect to dm.kinetiks.ai - user is in Dark Madder, standalone
7. No system naming, no email/Slack connection, no desktop app
8. Kinetiks upgrade path available later via floating pill and nurture emails

**Path B - Kinetiks-first (power users):**
1. User signs up at kinetiks.ai
2. Account creation, Kinetiks ID assigned
3. Name your GTM system (freeform text)
4. Connect email (Google Workspace / Microsoft 365)
5. Connect Slack
6. Cartographer onboarding: "Let's build your business identity so [system name] can get to work"
7. Download desktop app
8. Activate first app(s)
9. Land in Chat tab with proactive greeting

**Upgrade path (Path A → full Kinetiks):**
1. Standalone user clicks through to Kinetiks setup
2. Names their system, connects email, connects Slack
3. Downloads desktop app
4. Existing Context Structure carries over - no re-onboarding
5. Floating pill in their app now shows system name and full Kinetiks integration

---

## apps/id/ Directory Structure (Kinetiks Core App)

```
apps/id/
  src/
    app/                          # Next.js App Router pages
      (auth)/
        login/page.tsx            # Login
        signup/page.tsx           # Signup - reads ?from= param
        callback/route.ts        # OAuth callback handler
      (app)/
        layout.tsx                # App shell: top tabs (Chat/Analytics/Cortex) + settings avatar
        chat/
          layout.tsx              # Chat layout: left sidebar (threads + approvals toggle) + main area
          page.tsx                # Default chat view (new or most recent thread)
          [threadId]/page.tsx     # Specific thread view
        analytics/
          layout.tsx              # Analytics layout: full-width, no sidebar
          page.tsx                # Analytics dashboard (Oracle-powered scoreboard)
        cortex/
          layout.tsx              # Cortex layout: left sub-nav + main area
          identity/page.tsx       # Context Structure viewer/editor (8 layers)
          identity/[layer]/page.tsx  # Per-layer detail view
          goals/page.tsx          # Goals manager (OKRs + KPI targets)
          integrations/page.tsx   # Kinetiks apps + external tools + email/Slack/calendar
          ledger/page.tsx         # Learning Ledger viewer
      onboarding/
        page.tsx                  # Cartographer onboarding experience
      setup/
        page.tsx                  # Kinetiks setup flow (name system, connect email, connect Slack)
      api/
        cortex/
          evaluate/route.ts       # Proposal evaluation endpoint
          route/route.ts          # Routing engine endpoint
        cartographer/
          crawl/route.ts          # Website crawl + extraction
          analyze/route.ts        # Content/asset analysis
          conversation/route.ts   # Guided conversation handler
          calibrate/route.ts      # Voice calibration exercises
          auto-answer/route.ts    # AI-generated answers for onboarding questions
        archivist/
          clean/route.ts          # On-demand cleaning pass
          import/route.ts         # Import processing pipeline
        marcus/
          chat/route.ts           # Conversation endpoint (streaming)
          extract/route.ts        # Action extraction pipeline
          brief/route.ts          # Generate scheduled brief on-demand
          command/route.ts        # Cross-app command routing endpoint
          slack/events/route.ts   # Slack event webhook (messages, mentions)
          slack/interact/route.ts # Slack interactivity (button clicks)
        oracle/
          metrics/route.ts        # Metric ingestion endpoint (Synapses report here)
          goals/route.ts          # Goal progress calculation
          insights/route.ts       # On-demand insight generation
          alerts/route.ts         # Alert management
        synapse/
          pull/route.ts           # Synapse reads Context Structure
          propose/route.ts        # Synapse submits Proposal
          command/route.ts        # Synapse receives command from Marcus
        approvals/
          list/route.ts           # List pending approvals
          action/route.ts         # Approve/reject with metadata
          classify/route.ts       # Classify approval type (quick/review/strategic)
        connections/
          ga4/route.ts            # GA4 OAuth flow + data pull
          gsc/route.ts            # GSC OAuth flow + data pull
          stripe/route.ts         # Stripe connection + data pull
          social/route.ts         # Social account connections
          email/route.ts          # Google Workspace / M365 email connection
          slack/route.ts          # Slack workspace connection
        goals/
          crud/route.ts           # Goal CRUD operations
          progress/route.ts       # Goal progress snapshot
        webhooks/
          stripe/route.ts         # Stripe webhook receiver
    components/
      ui/                         # Shared UI primitives
      app-shell/                  # Top-level app shell (tab bar, settings trigger)
        TabBar.tsx                # Chat | Analytics | Cortex tabs
        SettingsModal.tsx         # Settings overlay
      chat/                       # Chat tab components
        ChatSidebar.tsx           # Left sidebar (thread list + approvals toggle)
        ThreadList.tsx            # Thread history list
        ChatArea.tsx              # Main conversation area
        MessageBubble.tsx         # Message rendering with markdown + rich content
        MessageInput.tsx          # Input area with file attachment support
        ActionCard.tsx            # Structured action result cards in conversation
      approvals/                  # Approval components
        ApprovalPanel.tsx         # Approval queue panel (sidebar toggle)
        ApprovalCard.tsx          # Individual approval card (quick/review/strategic variants)
        InlineEditor.tsx          # Inline editing within approval cards
        RejectReasonInput.tsx     # Rejection reason capture
        ApprovalBadge.tsx         # Badge count indicator
      analytics/                  # Analytics tab components
        AnalyticsDashboard.tsx    # Main analytics view
        GoalCard.tsx              # Individual goal progress card
        KPIScoreboard.tsx         # Cross-app KPI display
        TrendChart.tsx            # Time-series trend visualization
        FunnelView.tsx            # Full-funnel visualization
      cortex/                     # Cortex tab components
        CortexNav.tsx             # Left sub-navigation (Identity, Goals, Integrations, Ledger)
        IdentityView.tsx          # Context Structure display
        LayerCard.tsx             # Per-layer summary card
        LayerEditor.tsx           # Per-layer edit interface
        ConfidenceRing.tsx        # Confidence score visualization
        GoalsManager.tsx          # Goal creation and management
        GoalEditor.tsx            # Individual goal editor
        IntegrationsView.tsx      # Apps + external tools + system connections
        LedgerTimeline.tsx        # Learning Ledger display
      onboarding/                 # Cartographer onboarding components
        StepWrapper.tsx           # Unified card layout with step counter
        DotProgress.tsx           # Dot progress indicator
        AiFillBanner.tsx          # "Let AI fill this step" banner
        SparkleButton.tsx         # Per-field AI fill button
      setup/                      # Kinetiks setup flow components
        NameSystem.tsx            # Name your GTM system step
        ConnectEmail.tsx          # Email connection step
        ConnectSlack.tsx          # Slack connection step
        DownloadDesktop.tsx       # Desktop app download step
      floating-pill/              # The Kinetiks pill - exported as shared component for all apps
        FloatingPill.tsx          # Main pill component (collapsed/expanded states)
        PillPanel.tsx             # Expanded panel (score, suggestions, app switcher)
        AppSwitcher.tsx           # App icons with direct links
        PendingProposals.tsx      # Escalated items needing user attention
        QuickChat.tsx             # In-pill chat input
      billing/                    # Billing components (inside settings modal)
    lib/
      supabase/
        client.ts                 # Supabase browser client
        server.ts                 # Supabase server client
        admin.ts                  # Supabase admin client (service role)
        middleware.ts             # Auth middleware
      cortex/
        evaluate.ts               # 5-step Proposal evaluation logic
        conflict.ts               # Conflict detection engine
        route.ts                  # Routing logic with relevance gating
        confidence.ts             # Confidence scoring engine
        expire.ts                 # Expiration sweeper
      cartographer/
        crawl.ts                  # Website crawl orchestration
        extract-brand.ts          # Brand extraction from HTML/CSS
        extract-org.ts            # Org/product extraction
        extract-voice.ts         # Voice analysis from copy
        extract-positioning.ts    # Competitive/market positioning extraction
        conversation.ts           # Adaptive question engine
        calibrate.ts              # Voice calibration exercise logic
      archivist/
        dedup.ts                  # Deduplication engine
        normalize.ts              # Format normalization
        gap-detect.ts             # Gap detection + suggestion generation
        quality-score.ts          # Per-entry quality scoring
        import-pipeline.ts        # Import parsing + cleaning
      marcus/
        engine.ts                 # Core conversation pipeline (intent -> context -> generate -> extract)
        intent.ts                 # Intent classifier (strategic, tactical, support, data, command, implicit intel)
        context-assembly.ts       # Token-budgeted context loading per intent type
        action-extractor.ts       # Post-response Haiku call for Proposals, briefs, follow-ups
        command-router.ts         # Cross-app command parsing and routing
        brief-generator.ts        # Daily/weekly/monthly brief content generation
        scheduler.ts              # CRON management for scheduled communications
        thread-manager.ts         # Thread CRUD, titling, search
        docs-search.ts            # Documentation knowledge base search
      oracle/
        aggregator.ts             # Metric aggregation from Synapses
        goal-tracker.ts           # Goal progress calculation
        pattern-detector.ts       # Anomaly and trend detection
        insight-generator.ts      # Cross-app insight generation (uses Claude)
        alert-engine.ts           # Alert creation and routing to Marcus
        metric-schema.ts          # Unified metric schema definitions
      approvals/
        classify.ts               # Classify approval type (quick/review/strategic)
        confidence-gate.ts        # Confidence-based auto-approval logic
        learning-loop.ts          # Extract training signals from approval decisions
        brand-gate.ts             # Brand consistency check before approval creation
        quality-gate.ts           # Best practices check before approval creation
      slack/
        bot.ts                    # Slack Bolt app initialization
        events.ts                 # Event handlers (message.im, app_mention)
        blocks.ts                 # Block Kit message builders
        sync.ts                   # Thread sync between Slack and web
      email/
        connect.ts                # Google Workspace / M365 OAuth connection
        send.ts                   # Send email as system identity
        receive.ts                # Process received emails, extract intelligence
      ai/
        claude.ts                 # Claude API wrapper with retry/error handling
        prompts/                  # All system prompts organized by agent
          cartographer.ts
          archivist.ts
          cortex-evaluate.ts
          voice-calibrate.ts
          marcus-core.ts          # Marcus persona + rules (the engine behind the named system)
          marcus-extract.ts       # Action extraction prompt
          marcus-brief.ts         # Brief generation prompts (daily, weekly, monthly)
          marcus-command.ts       # Command parsing and routing prompts
          oracle-insights.ts      # Insight generation prompts
          oracle-patterns.ts      # Pattern detection prompts
          approval-brand.ts       # Brand consistency validation prompt
      connections/
        ga4.ts                    # GA4 API client
        gsc.ts                    # GSC API client
        stripe.ts                 # Stripe API client
      goals/
        schema.ts                 # Goal type definitions and validation
        mapping.ts                # Goal-to-app and goal-to-metric mapping logic
      utils/
        id-generator.ts           # Random codename generator (copper-fox, blue-llama)
        seeds.ts                  # Seeds currency logic
    types/
      context.ts                  # Context Structure layer types
      proposal.ts                 # Proposal schema types
      routing.ts                  # Routing Event types
      command.ts                  # Command types (action, query, configuration)
      approval.ts                 # Approval types (quick, review, strategic)
      goal.ts                     # Goal types (KPI target, OKR)
      analytics.ts                # Analytics metric types
      connections.ts              # Data connection types
      brand.ts                    # Brand layer type definitions
  supabase/
    migrations/                   # All SQL migrations (numbered)
    seed.sql                      # Dev seed data
    functions/                    # Supabase Edge Functions
      cortex-cron/index.ts        # CRON: process Proposal queue (60s)
      archivist-cron/index.ts     # CRON: deep cleaning pass (6h)
      expire-cron/index.ts        # CRON: expiration sweep (1h)
      oracle-metrics/index.ts     # CRON: pull metrics from Synapses (varies by metric type)
      oracle-insights/index.ts    # CRON: generate cross-app insights (daily)
      oracle-alerts/index.ts      # CRON: check for anomalies (15min)
      marcus-daily/index.ts       # CRON: daily morning brief generation + delivery
      marcus-weekly/index.ts      # CRON: weekly digest generation
      marcus-monthly/index.ts     # CRON: monthly review generation
      marcus-followup/index.ts    # CRON: check + deliver scheduled follow-ups (5min interval)
```

### apps/desktop/ Structure (Electron Wrapper)

```
apps/desktop/
  src/
    main/
      index.ts                    # Electron main process
      tray.ts                     # System tray management
      notifications.ts            # Native notification bridge
      shortcuts.ts                # Keyboard shortcut registration
      auto-update.ts              # Auto-update logic
      deep-links.ts               # kinetiks:// protocol handler
    preload/
      index.ts                    # Preload script (bridge between main and renderer)
  electron-builder.yml            # Build configuration (macOS, Windows, Linux)
  package.json
```

The Electron app loads the web app from kinetiks.ai (production) or localhost (dev). The preload script exposes native APIs (notifications, system tray, file access) to the renderer process.

---

## Database Schema

All tables live in the `public` schema in the shared Kinetiks Supabase project. RLS policies enforce that users can only access their own data. Edge Functions use the service role for cross-user operations.

### Core Tables (Existing - Unchanged)

```sql
-- Kinetiks accounts
kinetiks_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  codename text NOT NULL UNIQUE,          -- 'copper-fox', 'blue-llama'
  display_name text,
  system_name text,                       -- User's chosen name for their GTM system ('Kit', 'Archer', etc.)
  from_app text,                          -- which app they signed up from (dark_madder, harvest, etc.)
  kinetiks_connected boolean DEFAULT false, -- has the user completed full Kinetiks setup?
  onboarding_complete boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- 8 Context Structure layer tables (same pattern, different jsonb schemas)
kinetiks_context_org (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{}',
  confidence_score numeric(5,2) DEFAULT 0,
  source text NOT NULL,                    -- 'user_explicit', 'user_implicit', 'cartographer', 'synapse:{app}'
  source_detail text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
-- Repeat pattern for: kinetiks_context_products, kinetiks_context_voice,
-- kinetiks_context_customers, kinetiks_context_narrative,
-- kinetiks_context_competitive, kinetiks_context_market, kinetiks_context_brand
-- IMPORTANT: Each table MUST have UNIQUE(account_id) for upsert({ onConflict: "account_id" }) to work.

-- Proposal queue (unchanged)
kinetiks_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,
  source_operator text,
  target_layer text NOT NULL,
  action text NOT NULL CHECK (action IN ('add', 'update', 'escalate')),
  confidence text NOT NULL CHECK (confidence IN ('validated', 'inferred', 'speculative')),
  payload jsonb NOT NULL,
  evidence jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'accepted', 'declined', 'escalated', 'expired', 'superseded'
  )),
  decline_reason text,
  expires_at timestamptz,
  submitted_at timestamptz DEFAULT now(),
  evaluated_at timestamptz,
  evaluated_by text
)

-- Learning Ledger (append-only audit trail, unchanged)
kinetiks_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  event_type text NOT NULL,
  source_app text,
  source_operator text,
  target_layer text,
  detail jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
)

-- Routing Events (unchanged)
kinetiks_routing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  target_app text NOT NULL,
  source_proposal_id uuid REFERENCES kinetiks_proposals,
  payload jsonb NOT NULL,
  relevance_note text,
  delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)

-- Data connections (unchanged)
kinetiks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  provider text NOT NULL,
  status text DEFAULT 'pending',
  credentials jsonb,
  last_sync_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
)

-- Imports (unchanged)
kinetiks_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  import_type text NOT NULL,
  file_path text,
  status text DEFAULT 'pending',
  stats jsonb DEFAULT '{}',
  target_app text,
  created_at timestamptz DEFAULT now()
)

-- Confidence scores (unchanged)
kinetiks_confidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  org numeric(5,2) DEFAULT 0,
  products numeric(5,2) DEFAULT 0,
  voice numeric(5,2) DEFAULT 0,
  customers numeric(5,2) DEFAULT 0,
  narrative numeric(5,2) DEFAULT 0,
  competitive numeric(5,2) DEFAULT 0,
  market numeric(5,2) DEFAULT 0,
  brand numeric(5,2) DEFAULT 0,
  aggregate numeric(5,2) DEFAULT 0,
  updated_at timestamptz DEFAULT now()
)

-- Registered Synapses (unchanged)
kinetiks_synapses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  app_name text NOT NULL,
  app_url text,
  status text DEFAULT 'active',
  read_layers text[] DEFAULT '{}',
  write_layers text[] DEFAULT '{}',
  capabilities text[] DEFAULT '{}',       -- NEW: what commands this Synapse can handle
  realtime_channel text,
  activated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
)

-- Billing (unchanged)
kinetiks_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  stripe_customer_id text,
  plan text DEFAULT 'free',
  plan_status text DEFAULT 'active',
  current_period_end timestamptz,
  seeds_balance integer DEFAULT 0,
  payment_method_last4 text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Marcus threads (unchanged)
kinetiks_marcus_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  title text,
  channel text DEFAULT 'web',
  slack_thread_ts text,
  pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Marcus messages (unchanged)
kinetiks_marcus_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES kinetiks_marcus_threads NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  channel text DEFAULT 'web',
  extracted_actions jsonb,
  context_used jsonb,
  created_at timestamptz DEFAULT now()
)

-- Marcus schedules (unchanged)
kinetiks_marcus_schedules (...)
-- Marcus alerts (unchanged)
kinetiks_marcus_alerts (...)
-- Marcus follow-ups (unchanged)
kinetiks_marcus_follow_ups (...)
-- App activations (unchanged)
kinetiks_app_activations (...)
```

### New Tables

```sql
-- Goals
kinetiks_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  name text NOT NULL,                     -- "Generate 50 qualified leads per month"
  type text NOT NULL CHECK (type IN ('kpi_target', 'okr')),
  metric text NOT NULL,                   -- The measurable quantity
  target_value numeric,                   -- The target number
  target_period text CHECK (target_period IN ('weekly', 'monthly', 'quarterly', 'annual')),
  current_value numeric DEFAULT 0,        -- Auto-populated by Oracle
  contributing_apps text[] DEFAULT '{}',  -- Which apps contribute to this goal
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  progress_status text DEFAULT 'on_track' CHECK (progress_status IN ('on_track', 'behind', 'ahead', 'at_risk')),
  parent_goal_id uuid REFERENCES kinetiks_goals, -- For OKR key results linking to objectives
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Goal progress snapshots (time-series, populated by Oracle)
kinetiks_goal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES kinetiks_goals NOT NULL,
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  value numeric NOT NULL,
  snapshot_at timestamptz DEFAULT now()
)

-- Approvals (the queue that users interact with)
kinetiks_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,               -- Which app generated this
  source_operator text,                   -- Which agent
  approval_type text NOT NULL CHECK (approval_type IN ('quick', 'review', 'strategic')),
  title text NOT NULL,                    -- "Follow-up email to Jane at Acme Corp"
  description text,                       -- Brief context
  preview jsonb NOT NULL,                 -- Full content preview (structure depends on type)
  deep_link text,                         -- URL to open this in the source app for full editing
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'auto_approved')),
  confidence_score numeric(5,2),          -- System's confidence in this action
  auto_approved boolean DEFAULT false,    -- Did the confidence gate auto-approve this?
  user_edits jsonb,                       -- Diff of what the user changed before approving
  rejection_reason text,                  -- Required when rejected
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  acted_at timestamptz                    -- When the user approved/rejected
)

-- Approval autonomy thresholds (per-account, per-action-category)
kinetiks_approval_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  action_category text NOT NULL,          -- 'outbound_email', 'content_publish', 'social_post', etc.
  auto_approve_threshold numeric(5,2) DEFAULT 100, -- Confidence needed for auto-approval (100 = never auto)
  override_rule text CHECK (override_rule IN ('always_approve', 'always_ask', 'confidence_based')),
  approval_rate numeric(5,2) DEFAULT 0,   -- Historical approval rate for this category
  edit_rate numeric(5,2) DEFAULT 0,       -- How often the user edits before approving
  last_rejection_at timestamptz,          -- Recency of last rejection (affects confidence)
  UNIQUE(account_id, action_category)
)

-- Analytics metrics (time-series, populated by Oracle from Synapse reports)
kinetiks_analytics_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,               -- Which app reported this
  metric_name text NOT NULL,              -- 'emails_sent', 'reply_rate', 'posts_published', etc.
  metric_value numeric NOT NULL,
  metric_period text NOT NULL,            -- 'daily', 'weekly', 'monthly'
  period_start timestamptz NOT NULL,
  metadata jsonb DEFAULT '{}',            -- Additional context (segment, campaign, etc.)
  recorded_at timestamptz DEFAULT now()
)

-- Oracle insights (generated insights, delivered through Marcus)
kinetiks_oracle_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  insight_type text NOT NULL,             -- 'anomaly', 'trend', 'recommendation', 'correlation'
  severity text DEFAULT 'info',           -- 'info', 'warning', 'urgent'
  title text NOT NULL,
  body text NOT NULL,
  supporting_data jsonb NOT NULL,         -- The metrics/evidence behind the insight
  source_apps text[] DEFAULT '{}',        -- Which apps' data contributed
  related_goals uuid[],                   -- Which goals this relates to
  delivered boolean DEFAULT false,        -- Has Marcus delivered this to the user?
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
)

-- System identity (email, Slack, calendar connections for the named system)
kinetiks_system_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  email_provider text,                    -- 'google_workspace', 'microsoft_365'
  email_address text,                     -- The system's email address (kit@acme.com)
  email_credentials jsonb,                -- Encrypted OAuth tokens
  slack_workspace_id text,
  slack_bot_user_id text,
  slack_channels text[] DEFAULT '{}',     -- Channels the system has joined
  calendar_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
```

### Context Layer JSON Schemas

Each layer table stores structured data in the `data` jsonb column. These are the canonical schemas:

**Org Layer:**
```json
{
  "company_name": "string",
  "legal_entity": "string | null",
  "industry": "string",
  "sub_industry": "string | null",
  "stage": "pre-revenue | early | growth | scale",
  "founded_year": "number | null",
  "geography": "string",
  "team_size": "string | null",
  "funding_status": "string | null",
  "website": "string",
  "description": "string"
}
```

**Products Layer:**
```json
{
  "products": [{
    "name": "string",
    "description": "string",
    "value_prop": "string",
    "pricing_model": "free | freemium | paid | enterprise",
    "pricing_detail": "string | null",
    "features": ["string"],
    "differentiators": ["string"],
    "target_persona": "string | null"
  }]
}
```

**Voice Layer:**
```json
{
  "tone": { "formality": 0-100, "warmth": 0-100, "humor": 0-100, "authority": 0-100 },
  "vocabulary": { "jargon_level": "none | light | moderate | heavy", "sentence_complexity": "simple | moderate | complex" },
  "messaging_patterns": [{ "context": "string", "pattern": "string", "performance": "string | null" }],
  "writing_samples": [{ "source": "string", "text": "string", "type": "own | aspirational" }],
  "calibration_data": [{ "exercise": "string", "choice": "A | B", "options": { "A": "string", "B": "string" } }],
  "platform_variants": { "email": {}, "social": {}, "long_form": {}, "pitch": {} }
}
```

**Customers Layer:**
```json
{
  "personas": [{
    "name": "string",
    "role": "string | null",
    "company_type": "string | null",
    "pain_points": ["string"],
    "buying_triggers": ["string"],
    "objections": ["string"],
    "conversion_signals": ["string"]
  }],
  "demographics": { "age_range": "string | null", "geography": "string | null", "company_size": "string | null" },
  "analytics_data": { "top_channels": [], "top_pages": [], "behavior_patterns": [] }
}
```

**Narrative Layer:**
```json
{
  "origin_story": "string | null",
  "founder_thesis": "string | null",
  "why_now": "string | null",
  "brand_arc": "string | null",
  "validated_angles": [{ "angle": "string", "validation_source": "string", "performance": "string | null" }],
  "media_positioning": "string | null"
}
```

**Competitive Layer:**
```json
{
  "competitors": [{
    "name": "string",
    "website": "string | null",
    "positioning": "string",
    "strengths": ["string"],
    "weaknesses": ["string"],
    "narrative_territory": "string | null",
    "last_activity": { "type": "string", "detail": "string", "date": "string" }
  }],
  "positioning_gaps": ["string"],
  "differentiation_vectors": ["string"]
}
```

**Market Layer:**
```json
{
  "trends": [{ "topic": "string", "direction": "rising | falling | stable | emerging", "relevance": "direct | adjacent | background" }],
  "media_sentiment": { "topic": "string", "sentiment": "positive | neutral | negative", "source_count": 0 },
  "llm_representation": { "brand_mentioned": false, "description_accuracy": "string | null", "competitor_ranking": [], "citation_sources": [] },
  "seasonal_patterns": [],
  "regulatory_signals": []
}
```

**Brand Layer:**
```json
{
  "colors": {
    "primary": "string", "secondary": "string", "accent": "string",
    "semantic": { "success": "string", "warning": "string", "error": "string", "info": "string" },
    "neutrals": { "50": "string", "100": "string", "200": "string", "400": "string", "600": "string", "800": "string", "900": "string" }
  },
  "typography": {
    "heading_font": "string", "body_font": "string", "accent_font": "string | null",
    "type_scale": "number", "heading_weight": "string", "body_weight": "string",
    "body_line_height": "number", "heading_line_height": "number"
  },
  "tokens": {
    "border_radius": "sharp | subtle | rounded | pill",
    "spacing_base": "number", "spacing_scale": "string",
    "elevation": "flat | subtle | layered",
    "density": "tight | balanced | airy"
  },
  "imagery": {
    "style": "photography | illustration | 3d | abstract | mixed",
    "treatment": "warm | cool | neutral",
    "subject": "human | product | abstract | lifestyle"
  },
  "motion": { "level": "none | subtle | expressive", "transition_speed": "fast | medium | deliberate" },
  "modes": { "dark_mode_supported": false, "default_mode": "light | dark" },
  "accessibility": { "wcag_level": "AA | AAA", "min_contrast": "number", "min_font_size": "number" },
  "logo": { "wordmark_url": "string | null", "icon_url": "string | null", "monochrome_url": "string | null" },
  "social_visual_id": { "instagram": {}, "linkedin": {}, "twitter": {} }
}
```

---

## Proposal Protocol

### Schema

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

interface Evidence {
  type: 'article' | 'metric' | 'url' | 'user_action' | 'analytics' | 'conversation';
  value: string;
  context: string;
  date: string | null;
}
```

### Evaluation Pipeline (5 steps)

1. **Schema validation** - well-formed? Correct payload for target layer?
2. **Conflict detection** - contradicts user data (decline)? Higher-confidence existing (decline)? Same-confidence (newer wins)?
3. **Relevance scoring** - evidence quality, recency, specificity, novelty. Below threshold = decline with `low_relevance`.
4. **Merge** - `add` inserts new data. `update` refines existing. `escalate` surfaces to user for approval.
5. **Route** - determine which Synapses need this learning. Targeted, not broadcast. Respect recency throttle.

### Ownership Hierarchy (conflict resolution)

1. User explicit (typed or uploaded) - SACRED for scalar fields, ADDITIVE for arrays/objects
2. User implicit (edits, calibration choices) - strong signal
3. Validated Proposals (confirmed by real outcomes)
4. Inferred Proposals (AI analysis, unconfirmed)
5. Speculative Proposals (patterns, low certainty)

**Critical nuance on "sacred":** User-explicit data is sacred means scalar fields (company_name, industry, description) can never be overwritten by AI proposals. But array fields (messaging_patterns, personas, competitors, trends) and object fields with new keys CAN be extended by proposals. The merge step concatenates arrays and deduplicates, preserving all user entries while allowing new intelligence to accumulate.

---

## Confidence Scoring

### Per-Layer Weights (aggregate = weighted average)

| Layer | Weight | Why |
|-------|--------|-----|
| Org | 8% | Foundational but simple |
| Products | 18% | Directly impacts output accuracy |
| Voice | 18% | Difference between "sounds like AI" and "sounds like me" |
| Customers | 14% | Targeting accuracy |
| Narrative | 12% | Story quality for PR and content |
| Competitive | 8% | Positioning supplements output |
| Market | 8% | Volatile, bonus when present |
| Brand | 14% | Visual output quality |

Score is based on: data points in layer, percentage from user-entered vs inferred sources, data recency, acceptance rate of proposals. User-entered data scores higher than AI-inferred. Exact formula in `lib/cortex/confidence.ts`.

---

## Cortex Operators

### The Cartographer

**Role:** Intake agent. Builds the initial Context Structure. Can be re-invoked.

**Three intelligence modes:**
1. **Crawl + Extract** - user provides URL. Crawl website. Runs 5 extractors in parallel: org/products (Sonnet), voice (Sonnet), brand (CSS parsing + Haiku), social/narrative (regex + Haiku), and competitive/market positioning (Sonnet).
2. **Connected Data** - OAuth/API connections to GA4, GSC, Stripe, CRM, social accounts, email platforms.
3. **Guided Conversation** - 5-8 adaptive questions informed by what's already captured. Voice calibration exercises.

**Runs:** During onboarding. On-demand when user edits ID. Triggered when new data connection added.

### The Archivist

**Role:** Data steward. Keeps the Context Structure clean.

**Functions:** Deduplication, normalization, gap detection, contradiction resolution, expiration management, relationship inference, quality scoring. Also handles the import cleaning pipeline.

**Runs:** Event-triggered after accepted Proposal batches. CRON every 6 hours (deep clean). CRON every hour (expiration sweep). On every import.

### Marcus

**Role:** The conversational intelligence of the system. The engine behind the user's named GTM system. The user never sees the name "Marcus" - they interact with whatever they named their system.

**Voice principles (applied to the named system):**
- **Stoic clarity.** State the situation plainly. No spin, no softening, no performative optimism.
- **Grounded in evidence.** Every recommendation references specific data.
- **Brevity with depth available.** Lead with the conclusion. Expand only if asked.
- **Patient, never pushy.** Suggest, don't demand.
- **Direct, not cold.** Acknowledges difficulty. Celebrates significant wins.
- **Concise.** Bias toward fewer words.
- **No em dashes.** Regular dashes only.

**Never does:** filler phrases, hedging when data exists, over-explaining its own process, exclamation marks (except genuine wins), generic advice, sycophancy.

**Five jobs:**
1. **Strategic advisor** — synthesizes cross-app data for specific, data-grounded direction
2. **Cross-app orchestrator** — coordinates actions across apps via command routing through Synapses
3. **Proactive communicator** — daily briefs, weekly digests, monthly reviews, real-time alerts
4. **Context enrichment** — extracts intelligence from natural conversation, submits Proposals to Cortex
5. **Support/guidance** — knows Kinetiks docs, answers product questions, guides users

**Conversation engine pipeline:** Intent classification → context assembly (token-budgeted per intent type) → conversation history (semantic search + recent) → response generation (Claude Sonnet) → action extraction (Claude Haiku, separate call) → execute actions + deliver response.

**Command routing:** When the user issues a directive, Marcus parses intent, identifies target app(s), translates to specific commands, dispatches through Synapse layer, aggregates results, and presents a unified response. Multi-app commands (touching Harvest AND Dark Madder) are coordinated in parallel.

**Surfaces:**
- Chat tab in the Kinetiks desktop/web app (primary)
- Slack bot (two-way: briefs/alerts out, conversations in)
- System email (outbound briefs with "Reply in Slack" links)
- Floating pill quick-chat in suite apps
- MCP interface for external agent access

### The Oracle

**Role:** Analytics intelligence. Turns raw metrics from every app into strategic insight. Powers the Analytics tab.

**Five jobs:**
1. **Metric aggregation** — Pulls performance data from every app Synapse on schedule. Normalizes into unified schema. Handles missing data, stale syncs, format inconsistencies.
2. **Goal tracking** — Monitors progress toward user-defined goals. Calculates on-track/behind/ahead. Identifies which apps are contributing vs falling short. Projects completion.
3. **Pattern detection** — Watches for anomalies: rate drops, traffic spikes, conversion shifts, velocity changes. Distinguishes signal from noise. Generates alerts for significant events.
4. **Insight generation** — Cross-references metrics across apps to produce actionable insights. "Security angle outperforms cost savings 3:1 in outreach. Content on security gets 2x engagement. Recommend shifting content calendar."
5. **Context enrichment** — Submits Proposals when analytics reveal something that should update the business identity. "ICP should weight Series B more heavily based on 60 days of outreach data."

**Relationships:**
- Oracle → Marcus: provides data and interpretation for analytics questions in Chat. Pushes proactive alerts for delivery.
- Oracle → Archivist: flags data quality issues in metrics.
- Oracle → Cartographer: requests enrichment when Context Structure gaps limit analytics quality.
- Oracle → Synapses: pulls metrics on schedule, pushes insights back as Routing Events.

**Runs:** CRON-scheduled metric pulls (15min for critical KPIs, hourly for standard, daily for slow-moving). Daily insight generation. Event-triggered analysis on significant data arrival. On-demand when Marcus requests data.

---

## ID Generator

Kinetiks IDs use a random two-word codename format: `{adjective}-{animal}`

Examples: copper-fox, blue-llama, quiet-hawk, bright-otter

Generated at account creation. Immutable. Used as the internal identifier. The user-facing name is the "system name" they choose (freeform text, changeable). Implementation in `lib/utils/id-generator.ts`.

---

## Design System

### Brand

- **Primary color:** #6C5CE7 (Kinetiks purple)
- **Secondary:** #00CEC9 (teal)
- **Background:** #FAFAFA (light), #0F0F1A (dark)
- **Fonts:** Distinctive, modern typefaces. NOT Inter, NOT Arial. Think: Satoshi, Cabinet Grotesk, General Sans.
- **Design ethos:** Clean, confident, modern. Not startup-generic. Not enterprise-boring. Think Linear, Vercel, Raycast - that tier of design quality.

### App Design Principles

- **Three-tab layout** at top (Chat | Analytics | Cortex), like Claude desktop's Chat | Cowork | Code
- **Left sidebar in Chat tab** toggles between thread history and approvals (like Claude desktop's Projects toggle)
- **Cortex tab** has its own internal sub-navigation on the left
- **Analytics tab** is full-width, no sidebar
- **Settings modal** - overlay triggered by avatar/profile icon in top bar
- Generous whitespace in all views
- Cards for summaries, timelines for ledger
- Confidence score as a prominent ring/arc visual
- Dark mode supported from day one
- Micro-interactions on state changes (approval accepted, score update, goal progress)
- Desktop-primary (Electron app is the main target)

---

## Workflow Rules (CRITICAL - ALWAYS FOLLOW THESE)

### Planning

1. **Plan before building.** Before writing ANY code, output a numbered plan of what you will create or modify, what each piece does, and what the expected behavior is. Wait for explicit approval.
2. **Scope tightly.** Each plan covers ONE cohesive task.

### Building

3. **One file at a time.** Create or modify one file, verify, then move to the next.
4. **Write complete code.** No placeholders, no TODOs, no skeleton functions. Every function fully implemented.
5. **No dead code.** Every import used. Every function called. Every variable referenced.
6. **Type everything.** This is TypeScript strict mode. No `any`. No type assertions unless absolutely necessary with a comment explaining why.

### Testing

7. **Test after every file.** Run the relevant check (type check, lint, dev server) after creating/modifying each file.
8. **Edge cases first.** Handle errors, empty states, and loading states before the happy path looks pretty.

### Code Style

9. **Explicit > clever.** Readable code beats short code.
10. **Colocate related code.** If a component has a type, a util, and a hook that only it uses, they live next to it.
11. **Server components by default.** Only add "use client" when you need interactivity.
12. **Supabase RLS is mandatory.** Every table must have Row Level Security policies. Never bypass with service role in client code.

### Commits

13. **Conventional commits.** `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`. One logical change per commit.
14. **Commit after each completed task.** Don't batch an entire phase into one commit.

### Build Standards (CRITICAL - NEVER SKIP)

15. **Read specs before building.** Before building ANY feature, read `docs/kinetiks-product-spec-v3.md` and the relevant system spec in `docs/`. The CLAUDE.md describes what exists and how it's structured. The spec docs describe what to build and why. If no spec exists for a feature, ASK before building.
16. **Depth over breadth.** Build fewer features at full depth rather than many as shallow scaffolds.
17. **What "done" means.** A feature is NOT done when it compiles. It is done when: (a) it matches the spec, (b) AI-powered workflows are functional, not stubbed, (c) the UX is designed for the actual use case, (d) it would impress a user, not just pass a type check.
18. **No scaffold products.** Never build a page as "table + create modal + detail panel" without understanding what the feature actually does.
19. **Terminology must clarify, never confuse.** If a user would need to learn your vocabulary to use the app, the vocabulary is wrong.
20. **Compare against spec before marking complete.**

### Anti-patterns (NEVER do these)

- Building a page as generic CRUD without understanding what the feature actually does
- Marking a feature complete without comparing it to the spec doc
- Building 8 shallow pages instead of 3 deep ones
- Using "Coming in Phase 2" as an excuse for missing core logic in the spec
- Skipping the docs/ folder when it contains the actual product requirements
- Saying "Clean compile. All done." when the product doesn't match what was designed

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

# Slack (system bot identity)
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

---

## Implementation Lessons (from prior build sessions)

### Database

- **UNIQUE constraints are required for upsert.** Every context layer table MUST have `UNIQUE(account_id)` for upsert to work. Without it, Supabase returns a silent error.
- **Check constraints on enum columns.** When adding a new value, the DB constraint must be updated first.

### Environment Variables

- **All keys must be set on Vercel.** Missing any causes silent failures.
- **Vercel requires a redeploy** to pick up new env vars.
- **Use `/api/health`** to verify which env vars are set.

### Proposal Pipeline

- **Proposals must pass schema validation.** AI that generates proposals MUST know exact field names for each layer.
- **evaluateProposal() takes a full Proposal object, not an ID.**
- **The merge step concatenates arrays.** Array-field proposals ADD to existing data rather than replacing.

### Error Handling

- **Always include the actual error message in API responses.**
- **MCP client must read 500 response bodies.** Read as text first, then try to parse as JSON.

### AI Prompts

- **Extraction prompts need full schemas.** Include all valid field names for each layer.
- **Auto-answer quality matters.** Answers must be substantive (real competitor names, specific trends).
- **Competitive positioning is implicit.** Tell Claude to look for implicit competitors.

### Conflict Detection

- **"Sacred" means scalars, not arrays.** Scalar overwrites blocked, array fields allow additive proposals.

---

## Phased Build Plan

### Phase 1: Core Shell Restructure
Transform apps/id from sidebar-nav to three-tab layout (Chat | Analytics | Cortex). Chat as default route. Left sidebar with thread history + approvals toggle. Cortex sub-nav (Identity, Goals, Integrations, Ledger). Settings modal. Electron app scaffold in apps/desktop/.

### Phase 2: Approval System
Confidence-based autonomy engine. Approval type classification (quick/review/strategic). Inline approval cards. Learning loop (edits → training signals, rejections → confidence adjustment). Brand consistency gates. Quality gates. Trust contraction on mistakes.

### Phase 3: Cortex Evolution
Goals layer (OKRs + KPI targets). Goal-to-app mapping. Goal editor UI in Cortex tab. System identity setup (name, email, Slack). Integrations view consolidating apps + external tools + system connections.

### Phase 4: Cross-App Command Router
Bidirectional Synapse communication. Command parsing in Marcus. Intent-to-app routing. Multi-app orchestration. Response aggregation. Synapse command handler template.

### Phase 5: Oracle + Analytics Engine
Oracle Operator (metric aggregation, pattern detection, insight generation, goal tracking). Analytics tab dashboard. Cross-app KPI scoreboard. Goal progress visualization. Anomaly alerts. Oracle CRON functions.

### Phase 6: Agent Communication Layer
Google Workspace / Microsoft 365 email integration. System email identity (send/receive). Slack workspace connection. Calendar integration. Email intelligence extraction.

---

## Key Decisions

- **No em dashes.** Use regular dashes (-) in all copy and generated text.
- **Apps-first model.** Users can use any app standalone. Kinetiks is the upgrade, not the prerequisite.
- **System name, not Marcus.** The user names their system. Marcus is the engine underneath. User never sees "Marcus."
- **Three tabs, not sidebar pages.** Chat | Analytics | Cortex. Approvals in the Chat sidebar toggle.
- **Settings in a modal, not a tab.** Like Claude desktop. Admin stuff never competes with the product.
- **Seeds currency** is shared across all Kinetiks Apps. The core app tracks seeds balance.
- **Platform Anthropic key for core, BYOK wired for future.**
- **Supabase Realtime** for routing events and command delivery.
- **Append-only Learning Ledger.** Never delete ledger entries. Ever.
- **User data is sacred - but additive updates are allowed.** Scalar fields sacred, array fields extendable.
- **Floating pill in suite apps.** Minimal for standalone users (upgrade CTA). Full for Kinetiks-connected users (system name, approvals, intelligence, quick-chat).
- **Billing and integrations live in the core app only.** Individual apps never handle billing.
- **Electron desktop app is v1 priority.** Not a later phase. Ships with the core product.
- **Confidence-based autonomy.** Day one: everything requires approval. Over time: system earns right to auto-approve. Trust contracts on mistakes.
- **Four Cortex Operators.** Cartographer (intake), Archivist (quality), Marcus (conversation/orchestration), Oracle (analytics intelligence).

---

## Related Documents (all in docs/)

- **kinetiks-product-spec-v3.md** - THE product spec. Full vision, all sections, all detail.
- **approval-system-spec.md** - Approval system architecture (confidence, learning, quality gates)
- **cross-app-command-router-spec.md** - How Marcus orchestrates across apps
- **analytics-goals-engine-spec.md** - Oracle architecture, KPI model, goal system
- **agent-communication-layer-spec.md** - Email, Slack, calendar integration
- **Kinetiks Agent Architecture & Proposal Protocol v2** - Cortex, Synapse, Operator system
- **Dark Madder Migration Guide** - Surgical port into monorepo
- **Harvest Build Guide** - Web app rebuild with Bloomify logic transplant
- **Marcus Operator Spec** - Conversation engine, persona, Slack integration
- **Marcus Core Prompt** - System prompt file for the codebase
