# CLAUDE.md - Kinetiks AI Monorepo

> **This is the single source of truth for the entire Kinetiks AI codebase.**
> Read this file completely before every task. It contains the monorepo structure, shared architecture, data model, agent system, conventions, and rules that govern all apps.
> This file lives at the ROOT of the monorepo. Each app (apps/id, apps/dm, etc.) may have its own supplementary CLAUDE.md for app-specific context, but THIS file is the authority.

---

## Project Overview

Kinetiks AI is a marketing data platform with an intelligence layer. The core product is the Kinetiks ID at id.kinetiks.ai - users plug their business data in, the system cleans and organizes it into an 8-layer Context Structure, and that identity powers every app in the ecosystem: Dark Madder (content), Harvest (outbound), Hypothesis (landing pages), Litmus (PR).

The codebase is a Turborepo monorepo. One repo, one Supabase project, shared packages, separate Vercel deployments per app.

**Company:** Kinetiks AI (this IS the company - not a product under another entity)
**Author:** Zack Holland

---

## Monorepo Structure

```
kinetiks/
  apps/
    id/                        # id.kinetiks.ai - Kinetiks ID (core product)
    dm/                        # dm.kinetiks.ai - Dark Madder (content engine)
    hv/                        # hv.kinetiks.ai - Harvest (outbound engine)
    ht/                        # ht.kinetiks.ai - Hypothesis (landing page engine)
    lt/                        # lt.kinetiks.ai - Litmus (PR engine)
  packages/
    types/                     # @kinetiks/types - Context Structure, Proposal, Routing, Brand types
    ui/                        # @kinetiks/ui - Floating pill, shared components, design tokens
    supabase/                  # @kinetiks/supabase - Clients (browser/server/admin), auth middleware
    synapse/                   # @kinetiks/synapse - Synapse interface, template, Proposal builder helpers
    ai/                        # @kinetiks/ai - Claude API wrapper, shared prompt utilities
  supabase/
    migrations/                # ALL database migrations (shared DB), numbered sequentially
    seed.sql                   # Dev seed data
    functions/                 # Supabase Edge Functions (Cortex CRON, Archivist CRON, etc.)
  docs/                        # All spec documents (PRDs, architecture docs, addenda)
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
In code: `import type { Proposal, ContextStructure } from '@kinetiks/types'`

### Vercel Deployment

Each app is a separate Vercel project pointing to its subfolder:
- `apps/id` deploys to id.kinetiks.ai
- `apps/dm` deploys to dm.kinetiks.ai
- `apps/hv` deploys to hv.kinetiks.ai
- `apps/ht` deploys to ht.kinetiks.ai
- `apps/lt` deploys to lt.kinetiks.ai

Root `turbo.json` defines the build pipeline. Push to main rebuilds only apps with changes (Turborepo remote caching).

### One Supabase Project

All apps share a single Supabase project. Tables use app prefixes for ownership:
- `kinetiks_*` tables - owned by the ID product (Context Structure, Proposals, Ledger, etc.)
- `dm_*` tables - owned by Dark Madder (articles, drafts, keywords, editorial calendar)
- `hv_*` tables - owned by Harvest (prospects, sequences, pipeline, contacts)
- `ht_*` tables - owned by Hypothesis (pages, tests, templates)
- `lt_*` tables - owned by Litmus (journalists, articles, mentions, campaigns, pitches)

RLS policies ensure users can only access their own data. Service role used only by Edge Functions (Cortex, Archivist, Synapses).

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (Postgres + Auth + Realtime + Edge Functions + Storage)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514 for agents, claude-haiku-4-5-20251001 for lightweight tasks)
- **Styling:** Tailwind CSS 4
- **Crawling:** Firecrawl API (website extraction) or Cloudflare /crawl endpoint
- **Enrichment:** People Data Labs (contact data)
- **Email:** Resend (transactional)
- **Analytics integrations:** GA4 (OAuth), Google Search Console (OAuth), Stripe (API key)
- **Hosting:** Vercel
- **Package manager:** pnpm

---

## Architecture Overview

### The Three-Layer Agent System

Every piece of intelligence in Kinetiks flows through three layers:

**Layer 3 - Cortex:** The core ID agent system. Lives in this project. Maintains the Context Structure, processes Proposals, routes learnings, scores confidence. Has two Operators: the Cartographer (intake) and the Archivist (data quality).

**Layer 2 - Synapse:** One per Kinetiks App. The membrane between an app and the shared ID. Each app has exactly one Synapse deployed as an Edge Function. The Synapse template lives in this project. App-specific Synapses are deployed from each app's repo but follow the interface defined here.

**Layer 1 - Operator:** App-internal agents doing work. These do NOT live in this project. They live in each app's repo. They never touch the Kinetiks ID directly.

### Communication Rules (ABSOLUTE - NEVER VIOLATE)

1. Operators never touch the Kinetiks ID. They report to their Synapse only.
2. Synapses talk only to the Cortex and their own Operators. Never to other Synapses.
3. The Cortex talks only to Synapses and its own Operators (Cartographer, Archivist).
4. All intelligence crosses the app boundary via Proposal (up) or Routing Event (down).
5. User-entered data always wins over AI-generated data. Always.
6. Everything is logged in the Learning Ledger with full attribution.

---

## Navigation, Auth & URL Architecture

### Domain Structure

Marketing sites live on their own domains for brand strength. Apps live on kinetiks.ai subdomains for shared auth.

| Domain | Type | Purpose |
|--------|------|---------|
| kinetiks.ai | Marketing | Kinetiks platform landing page |
| darkmadder.com | Marketing | Dark Madder landing page. CTA links to id.kinetiks.ai/signup?from=dark_madder |
| (TBD per app) | Marketing | Each app has its own marketing domain |
| id.kinetiks.ai | App | Kinetiks ID - dashboard, onboarding, billing, integrations, settings |
| dm.kinetiks.ai | App | Dark Madder |
| hv.kinetiks.ai | App | Harvest |
| ht.kinetiks.ai | App | Hypothesis |
| lt.kinetiks.ai | App | Litmus |

### Shared Auth (Single Session Across All Subdomains)

One Supabase Auth project. The session cookie domain is set to `.kinetiks.ai` so it's shared across all subdomains. Log in once at id.kinetiks.ai, authenticated everywhere. Each app's Next.js middleware checks the shared session - if not authenticated, redirect to id.kinetiks.ai/login?redirect={current_app_url}.

**Implementation:**
- Supabase client configured with `cookieOptions: { domain: '.kinetiks.ai' }`
- Each app's middleware reads the same session cookie
- Token refresh handled by whichever app the user is currently in
- Logout from any app clears the shared cookie (logs out everywhere)

### New User Journey (Coming From an App Landing Page)

1. User visits darkmadder.com (marketing site)
2. Clicks "Get Started" CTA
3. Redirected to `id.kinetiks.ai/signup?from=dark_madder`
4. Brief education screen (10 sec read): "Dark Madder is powered by Kinetiks. We're going to spend 15 minutes learning your business so everything we create sounds like you. Your Kinetiks ID also powers other growth tools you can activate later."
5. Account creation (email + password or OAuth)
6. Kinetiks ID assigned (e.g., copper-fox)
7. Cartographer onboarding begins at `id.kinetiks.ai/onboarding?from=dark_madder`
   - Framing adapted: "Let's learn your voice so your content sounds like you"
   - Same comprehensive process regardless of entry point
8. After onboarding completes: redirect straight to `dm.kinetiks.ai` - NO dashboard tour, no delay, the user came for Dark Madder, get them there
9. The `from` param is stored in the account record so the system knows which app to activate first

### New User Journey (Coming Directly to kinetiks.ai)

1. User visits kinetiks.ai (platform marketing site)
2. Clicks "Get Started"
3. Lands on `id.kinetiks.ai/signup` (no `from` param)
4. Education screen: "Kinetiks is a marketing data platform. Build your business identity once, and it powers every tool in the ecosystem."
5. Account creation + ID assignment
6. Cartographer onboarding at `id.kinetiks.ai/onboarding`
   - Generic framing: "Let's build your business identity"
7. After onboarding: lands on `id.kinetiks.ai` dashboard with app launcher showing available apps
8. User chooses which app to activate first

### Advanced User Daily Flow

Power users with multiple active apps open `id.kinetiks.ai` first each morning. The dashboard is their command center:

- Confidence score (prominent)
- App launcher cards (active apps with status summaries, inactive apps with "Activate" CTAs)
- Recent activity feed (proposals accepted, learnings routed, confidence changes)
- Pending items (escalated proposals needing user decision)
- Connection status (data sources, last sync times)
- Suggestions (what would improve the ID next)
- Cross-app KPIs (eventually - traffic, reply rates, conversions, press mentions across all apps)

From the dashboard, they click into whichever app needs attention. Direct links: dm.kinetiks.ai, hv.kinetiks.ai, etc.

### The Floating Pill (In-App Kinetiks Presence)

Every app has a floating pill anchored to the bottom-left corner. This is a shared React component built in the Kinetiks ID project and imported by every app. It's the Kinetiks ID's presence inside the app without being intrusive.

**Collapsed state (default):** Small pill showing the Kinetiks logo or the user's ID codename. Always visible, never in the way.

**Expanded state (on click):** Panel slides up showing:
- ID codename + confidence score
- 2-3 most relevant suggestions for this app
- Pending proposals from this app's Synapse
- Recent learnings routed TO this app
- Quick links: "View full ID", "Billing", "Integrations"
- Other apps (not yet activated = gentle cross-sell, activated = direct link)

**"View full ID" click:** Opens id.kinetiks.ai (in same tab or new tab based on user preference). Full dashboard with complete Context Structure, Learning Ledger, all connections, billing, settings.

**App switcher:** The expanded pill also serves as the app switcher. Active apps show as clickable icons/links. No need to go through the ID dashboard to switch between apps.

### What Lives in the ID Product (NOT in Individual Apps)

The ID product at id.kinetiks.ai owns these system-wide functions:

- **Billing:** One subscription, one payment method, all app access managed here. Individual apps never handle billing.
- **Integrations/Connections:** GA4, GSC, Stripe, CRM, social accounts, email platforms. Connected once in the ID, data flows to all apps that need it.
- **Context Structure editor:** View and edit all 8 layers. Accept or dismiss escalated proposals.
- **Learning Ledger:** Full audit trail of every proposal, routing, and data change.
- **Data imports:** Upload content libraries, contact lists, brand assets. Archivist cleans, apps receive.
- **Settings:** Account settings, API keys (BYOK), notification preferences, danger zone (delete account).
- **App management:** Activate/deactivate apps, view app-specific Synapse status.

Individual apps are pure product experiences. They don't have their own billing pages, their own integration setup, or their own account settings. That all lives in the ID.

---

## apps/id/ Directory Structure (Kinetiks ID Product)

```
apps/id/
  src/
    app/                          # Next.js App Router pages
      (auth)/
        login/page.tsx            # Login - shared across all subdomains via .kinetiks.ai cookie
        signup/page.tsx           # Signup - reads ?from=dark_madder param for framing + redirect
        callback/route.ts        # OAuth callback handler
      (dashboard)/
        layout.tsx                # Dashboard shell with sidebar
        page.tsx                  # Home: confidence score, app launcher, activity, suggestions
        context/
          page.tsx                # Full Context Structure viewer/editor
          [layer]/page.tsx        # Per-layer detail view
        ledger/page.tsx           # Learning Ledger viewer
        connections/page.tsx      # Data source connections manager (GA4, GSC, Stripe, etc.)
        imports/page.tsx          # Import manager (content, contacts, brand assets)
        billing/page.tsx          # Subscription management, payment methods, invoices
        apps/page.tsx             # App management - activate/deactivate, Synapse status
        settings/page.tsx         # Account settings, API keys (BYOK), notifications, danger zone
      onboarding/
        page.tsx                  # Cartographer onboarding experience
      api/
        cortex/
          evaluate/route.ts       # Proposal evaluation endpoint
          route/route.ts          # Routing engine endpoint
        cartographer/
          crawl/route.ts          # Website crawl + extraction
          analyze/route.ts        # Content/asset analysis
          conversation/route.ts   # Guided conversation handler
          calibrate/route.ts      # Voice calibration exercises
        archivist/
          clean/route.ts          # On-demand cleaning pass
          import/route.ts         # Import processing pipeline
        synapse/
          pull/route.ts           # Synapse reads Context Structure
          propose/route.ts        # Synapse submits Proposal
        connections/
          ga4/route.ts            # GA4 OAuth flow + data pull
          gsc/route.ts            # GSC OAuth flow + data pull
          stripe/route.ts         # Stripe connection + data pull
          social/route.ts         # Social account connections
        webhooks/
          stripe/route.ts         # Stripe webhook receiver
    components/
      ui/                         # Shared UI primitives
      dashboard/                  # Dashboard-specific components
      onboarding/                 # Cartographer onboarding components
      context/                    # Context Structure display components
      floating-pill/              # The Kinetiks pill - exported as shared component for all apps
        FloatingPill.tsx          # Main pill component (collapsed/expanded states)
        PillPanel.tsx             # Expanded panel (score, suggestions, app switcher)
        AppSwitcher.tsx           # App icons with direct links
        PendingProposals.tsx      # Escalated items needing user attention
      billing/                    # Billing and subscription components
      app-launcher/               # App cards for the dashboard (active, inactive, activate CTA)
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
        extract-voice.ts          # Voice analysis from copy
        conversation.ts           # Adaptive question engine
        calibrate.ts              # Voice calibration exercise logic
      archivist/
        dedup.ts                  # Deduplication engine
        normalize.ts              # Format normalization
        gap-detect.ts             # Gap detection + suggestion generation
        quality-score.ts          # Per-entry quality scoring
        import-pipeline.ts        # Import parsing + cleaning
      ai/
        claude.ts                 # Claude API wrapper with retry/error handling
        prompts/                  # All system prompts organized by agent
          cartographer.ts
          archivist.ts
          cortex-evaluate.ts
          voice-calibrate.ts
      connections/
        ga4.ts                    # GA4 API client
        gsc.ts                    # GSC API client
        stripe.ts                 # Stripe API client
      utils/
        id-generator.ts           # Random codename generator (copper-fox, blue-llama)
        seeds.ts                  # Seeds currency logic
    types/
      context.ts                  # Context Structure layer types
      proposal.ts                 # Proposal schema types
      routing.ts                  # Routing Event types
      connections.ts              # Data connection types
      brand.ts                    # Brand layer type definitions
  supabase/
    migrations/                   # All SQL migrations (numbered)
    seed.sql                      # Dev seed data
    functions/                    # Supabase Edge Functions
      cortex-cron/index.ts        # CRON: process Proposal queue (60s)
      archivist-cron/index.ts     # CRON: deep cleaning pass (6h)
      expire-cron/index.ts        # CRON: expiration sweep (1h)
```

---

## Database Schema

All tables live in the `public` schema in the shared Kinetiks Supabase project. RLS policies enforce that users can only access their own data. The Cortex Edge Functions use the service role for cross-user operations (Proposal evaluation, routing).

### Core Tables

```sql
-- Kinetiks accounts
kinetiks_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  codename text NOT NULL UNIQUE,          -- 'copper-fox', 'blue-llama'
  display_name text,
  from_app text,                          -- which app they signed up from (dark_madder, harvest, etc.)
  onboarding_complete boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- 8 Context Structure layer tables (same pattern, different jsonb schemas)
kinetiks_context_org (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  confidence_score numeric(5,2) DEFAULT 0,
  source text NOT NULL,                    -- 'user_explicit', 'user_implicit', 'cartographer', 'synapse:{app}'
  source_detail text,                      -- specific operator or extraction method
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
-- Repeat pattern for: kinetiks_context_products, kinetiks_context_voice,
-- kinetiks_context_customers, kinetiks_context_narrative,
-- kinetiks_context_competitive, kinetiks_context_market, kinetiks_context_brand

-- Proposal queue
kinetiks_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,                -- 'dark_madder', 'harvest', 'litmus', 'hypothesis'
  source_operator text,                    -- 'watchtower', 'quill', etc.
  target_layer text NOT NULL,              -- 'org', 'products', 'voice', etc.
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
  evaluated_by text                        -- 'cortex', 'user', 'archivist'
)

-- Learning Ledger (append-only audit trail)
kinetiks_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  event_type text NOT NULL,                -- 'proposal_accepted', 'proposal_declined', 'routing_sent',
                                           -- 'user_edit', 'archivist_clean', 'expiration', 'import'
  source_app text,
  source_operator text,
  target_layer text,
  detail jsonb NOT NULL,                   -- full event context
  created_at timestamptz DEFAULT now()
)

-- Routing Events
kinetiks_routing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  target_app text NOT NULL,                -- which Synapse receives this
  source_proposal_id uuid REFERENCES kinetiks_proposals,
  payload jsonb NOT NULL,                  -- the routed learning
  relevance_note text,                     -- why this was routed to this app
  delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)

-- Data connections
kinetiks_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  provider text NOT NULL,                  -- 'ga4', 'gsc', 'stripe', 'twitter', etc.
  status text DEFAULT 'pending',           -- 'pending', 'active', 'error', 'revoked'
  credentials jsonb,                       -- encrypted OAuth tokens or API keys
  last_sync_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
)

-- Imports
kinetiks_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  import_type text NOT NULL,               -- 'content_library', 'contacts', 'brand_assets', 'media_list'
  file_path text,                          -- Supabase Storage path
  status text DEFAULT 'pending',           -- 'pending', 'processing', 'complete', 'error'
  stats jsonb DEFAULT '{}',                -- { total: N, imported: N, duplicates: N, errors: N }
  target_app text,                         -- which app this seeds
  created_at timestamptz DEFAULT now()
)

-- Confidence scores (cached, recalculated by Cortex)
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
  aggregate numeric(5,2) DEFAULT 0,        -- weighted average
  updated_at timestamptz DEFAULT now()
)

-- Registered Synapses (apps connected to this Kinetiks ID)
kinetiks_synapses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  app_name text NOT NULL,                  -- 'dark_madder', 'harvest', etc.
  app_url text,                            -- base URL of the app (dm.kinetiks.ai)
  status text DEFAULT 'active',
  read_layers text[] DEFAULT '{}',         -- which layers this app can read
  write_layers text[] DEFAULT '{}',        -- which layers this app can propose to
  realtime_channel text,                   -- Supabase Realtime channel for routing
  activated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
)

-- Billing (managed centrally in the ID product)
kinetiks_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL UNIQUE,
  stripe_customer_id text,
  plan text DEFAULT 'free',                -- 'free', 'starter', 'pro', 'team'
  plan_status text DEFAULT 'active',       -- 'active', 'past_due', 'canceled', 'trialing'
  current_period_end timestamptz,
  seeds_balance integer DEFAULT 0,
  payment_method_last4 text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- App activations (which apps a user has turned on)
kinetiks_app_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  app_name text NOT NULL,                  -- 'dark_madder', 'harvest', etc.
  status text DEFAULT 'active',            -- 'active', 'paused', 'deactivated'
  activated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, app_name)
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
  id: string;                              // uuid, generated on creation
  source_app: string;                      // 'dark_madder' | 'harvest' | 'litmus' | 'hypothesis'
  source_operator: string | null;          // 'watchtower' | 'quill' | etc.
  target_layer: ContextLayer;              // 'org' | 'products' | 'voice' | 'customers' | 'narrative' | 'competitive' | 'market' | 'brand'
  action: 'add' | 'update' | 'escalate';
  confidence: 'validated' | 'inferred' | 'speculative';
  payload: Record<string, any>;            // schema depends on target_layer
  evidence: Evidence[];
  expires_at: string | null;               // ISO timestamp
  submitted_at: string;                    // ISO timestamp
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

1. User explicit (typed or uploaded) - SACRED, never override
2. User implicit (edits, calibration choices) - strong signal
3. Validated Proposals (confirmed by real outcomes)
4. Inferred Proposals (AI analysis, unconfirmed)
5. Speculative Proposals (patterns, low certainty)

### Lifecycle Statuses

`submitted` -> `accepted` | `declined` | `escalated`
`accepted` -> `expired` | `superseded` (over time)
`escalated` -> `accepted` | `declined` (user decision)

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

### Per-Layer Score Calculation

Score is based on: (a) number of data points in layer, (b) percentage from user-entered vs inferred sources, (c) data recency, (d) acceptance rate of proposals for that layer. User-entered data scores higher than AI-inferred. Exact formula in `lib/cortex/confidence.ts`.

### User-Facing Display

User sees ONE number: "Your Kinetiks ID: copper-fox | 52%"
Below it: suggestions to improve ("Connect GA4 +10%", "Upload writing samples +8%")
Domain scores visible in the Context Structure detail view but not prominently.

---

## Cortex Operators

### The Cartographer

**Role:** Intake agent. Builds the initial Context Structure. Can be re-invoked.

**Three intelligence modes:**
1. **Crawl + Extract** - user provides URL. Crawl website. Extract org, products, voice (from copy), brand (colors, fonts, tokens from CSS/HTML), social links. One URL fills 4-5 layers partially.
2. **Connected Data** - OAuth/API connections to GA4, GSC, Stripe, CRM, social accounts, email platforms. Each connection enriches specific layers with ground truth data.
3. **Guided Conversation** - 5-8 adaptive questions informed by what's already captured. Each question fills multiple layers. Voice calibration exercises (pick-which-you-prefer, upload samples).

**Runs:** During onboarding. On-demand when user edits ID. Triggered when new data connection added.

### The Archivist

**Role:** Data steward. Keeps the Context Structure clean.

**Functions:** Deduplication, normalization, gap detection, contradiction resolution, expiration management, relationship inference, quality scoring. Also handles the import cleaning pipeline (parse, validate, dedup, normalize, route).

**Runs:** Event-triggered after accepted Proposal batches. CRON every 6 hours (deep clean). CRON every hour (expiration sweep). On every import.

---

## ID Generator

Kinetiks IDs use a random two-word codename format: `{adjective}-{animal}`

Examples: copper-fox, blue-llama, quiet-hawk, bright-otter

Generated at account creation. Immutable. Used as the human-readable identifier throughout the system. Implementation in `lib/utils/id-generator.ts` with ~50 adjectives and ~50 animals = 2,500 unique combinations (sufficient for early scale).

---

## Design System

### Brand

- **Primary color:** #6C5CE7 (Kinetiks purple)
- **Secondary:** #00CEC9 (teal)
- **Background:** #FAFAFA (light), #0F0F1A (dark)
- **Fonts:** Use distinctive, modern typefaces. NOT Inter, NOT Arial. Think: Satoshi, Cabinet Grotesk, General Sans, or equivalent high-quality variable fonts.
- **Design ethos:** Clean, confident, modern. Not startup-generic. Not enterprise-boring. Feels like a product built by someone who cares about craft. Think Linear, Vercel, Raycast - that tier of design quality.

### Dashboard Design Principles

- Left sidebar navigation (collapsible)
- Content area with generous whitespace
- Cards for layer summaries, not tables
- Confidence score as a prominent ring/arc visual
- Learning ledger as a clean timeline
- Dark mode supported from day one
- Micro-interactions on state changes (score updates, proposal acceptance)
- Mobile-responsive but desktop-primary

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

# Email
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://id.kinetiks.ai
KINETIKS_ENCRYPTION_KEY=          # for encrypting stored OAuth tokens
```

---

## Migration Strategy for Existing Apps

### Dark Madder (9/10 phases built)

Dark Madder has a fully working codebase. The migration is SURGICAL - port the working code into the monorepo and swap the infrastructure layer. Do NOT rewrite product code.

**What stays (copy as-is into apps/dm/):**
- Voice engine (profiling, calibration, tone analysis)
- Content generation pipeline (Claude-powered writing)
- Keyword research system
- Framer CMS publishing integration
- Editorial calendar and content planning
- Learning loop logic (edit tracking, rule extraction)
- Content editor UI
- All content-specific database tables (renamed with dm_ prefix)
- All UI components

**What gets replaced (5-7 days of work):**
1. Auth - remove DM's own Supabase auth. Import `@kinetiks/supabase` middleware. Redirect unauthenticated users to id.kinetiks.ai/login?redirect=dm.kinetiks.ai
2. Onboarding - remove DM's voice profiling wizard. Voice data now comes from the Kinetiks ID Context Structure via the Synapse
3. Voice data source - DM's voice engine reads from `kinetiks_context_voice` (via Synapse pullContext) instead of its own `voice_profiles` table
4. Org/product data source - same pattern, read from Context Structure
5. Add the DM Synapse - fork `@kinetiks/synapse` template, add DM-specific filter logic (promote content performance, voice refinements, SEO patterns; keep drafts, keywords, editorial state internal)
6. Add the floating pill - `import { FloatingPill } from '@kinetiks/ui'` in root layout
7. Remove any billing/settings pages - those live in the ID product now

**Migration sequence:**
```
Step 1: Copy existing DM code into apps/dm/ (1 hour)
Step 2: Update package.json to use workspace packages (30 min)
Step 3: Swap auth to @kinetiks/supabase (half day)
Step 4: Add FloatingPill to root layout (30 min)
Step 5: Build DM Synapse with filter logic (1-2 days)
Step 6: Swap voice/org/customer data to Context Structure reads (1-2 days)
Step 7: Remove DM onboarding, billing, settings pages (half day)
Step 8: Rename DM tables to dm_ prefix, update all queries (half day)
Step 9: Test end-to-end: login via ID, Context Structure loaded, content generation uses Kinetiks voice, Synapse submits Proposals (1 day)
```

### Harvest (Bloomify Chrome Extension - Live)

Harvest is more complex because it's changing form factor (Chrome extension to web app) while also integrating with Kinetiks. The Chrome extension code has valuable logic that ports, but the UI is entirely different.

**What ports from Bloomify (logic, not UI):**
- PDL enrichment pipeline (API calls, data mapping, contact matching)
- Pairing logic (primary target + secondary target selection algorithm)
- Email generation prompts and Claude API integration
- Seeds currency logic
- Gmail compose URL generation
- Batch processing logic

**What gets rebuilt (this IS a rebuild, but with transplanted logic):**
- Web app UI in Next.js (replaces Chrome extension popup)
- Pipeline/deal management (new - Bloomify didn't have this)
- Sequence management (multi-step outreach, not just one-shot)
- Contact database (web-based, not Chrome Storage)
- Prospect research interface (web-based, not triggered by browsing)
- Kinetiks-native from day one (shared auth, Synapse, floating pill)

**Migration sequence:**
```
Step 1: Create apps/hv/ as fresh Next.js app with @kinetiks/* packages (1 day)
Step 2: Port PDL enrichment logic from Bloomify into packages/enrichment/ or apps/hv/lib/ (1 day)
Step 3: Port email generation prompts and Claude integration (half day)
Step 4: Port pairing logic (primary/secondary target algorithm) (half day)
Step 5: Build contact management UI + hv_contacts table (2 days)
Step 6: Build outreach composer (replaces Chrome extension popup) (2 days)
Step 7: Build pipeline view (new feature - deals, stages, outcomes) (2-3 days)
Step 8: Build Harvest Synapse with filter logic (1-2 days)
Step 9: Wire up: ICP from Context Structure, voice from Context Structure, enrichment from shared PDL (1 day)
Step 10: Test end-to-end (1 day)
```

The Bloomify Chrome extension can continue to exist as a lightweight companion that triggers Harvest workflows from the browser. But the primary product is the web app at hv.kinetiks.ai.

---

## Key Decisions

- **No em dashes.** Use regular dashes (-) in all copy and generated text. This is a Zack Holland brand rule.
- **Seeds currency** is shared across all Kinetiks Apps. The ID tracks seeds balance. Individual apps deduct seeds for actions.
- **BYOK model for v1.** Users bring their own API keys for Claude, PDL, etc. Managed tier planned for v2.
- **Supabase Realtime** for routing events. Each registered Synapse gets a dedicated channel.
- **Append-only Learning Ledger.** Never delete ledger entries. Ever. This is the audit trail.
- **User data is sacred.** The Cortex evaluation pipeline must never override user-explicit data. This is Rule 5 of the communication rules and Priority 1 in the ownership hierarchy. Build it as an early-exit condition in the conflict detection step.
- **Own domains for marketing, kinetiks subdomains for apps.** darkmadder.com is the marketing site, dm.kinetiks.ai is the app. CTA on marketing sites links to id.kinetiks.ai/signup?from={app}.
- **Shared auth across subdomains.** One Supabase Auth project, cookie domain `.kinetiks.ai`. Log in once, authenticated everywhere.
- **Post-onboarding goes straight to the app.** No dashboard tour, no ID overview. If a user came from Dark Madder, they land in Dark Madder. The ID dashboard is always accessible via the floating pill.
- **Floating pill, bottom-left, in every app.** Shared React component imported from the Kinetiks ID project. Collapsed by default. Expands to show ID info, suggestions, app switcher, and links to full ID dashboard.
- **Billing and integrations live in the ID product only.** Individual apps never handle billing, data connections, or account settings. All of that is at id.kinetiks.ai.
- **Apps are pure product experiences.** Dark Madder does content. Harvest does outbound. They don't do billing, integrations, or account management. The ID handles all of that.

---

## Phased Build Plan

### Phase 0a: Monorepo Setup (Day 1)
Create kinetiks/ repo. Turborepo config. pnpm-workspace.yaml. packages/ scaffolds (types, ui, supabase, synapse, ai) with package.json and tsconfig. Root CLAUDE.md. Vercel project config for apps/id.

### Phase 0b: Infrastructure (Days 2-4)
Supabase project, shared auth with .kinetiks.ai cookie domain, signup with ?from= param handling, 8-layer Context Structure schema, Proposal + Ledger tables, billing tables, app activation tables, ID generator, Next.js scaffold in apps/id/.

### Phase 1: Cortex Agent (Days 5-7)
Proposal evaluation pipeline (5-step), conflict detection with ownership hierarchy, routing logic with relevance gating + recency throttle, confidence scoring engine (8 layers + aggregate), expiration sweeper CRON.

### Phase 2: Cartographer - Crawl (Days 8-10)
Website crawler integration, brand extraction (colors, fonts, tokens from CSS/HTML), org/product extraction, voice extraction from copy, social profile crawling.

### Phase 3: Cartographer - Conversation (Days 11-13)
Conversational onboarding UI with adaptive question engine, entry-point framing (?from= param), education screen variants, voice calibration exercises, writing sample upload + analysis.

### Phase 4: Data Connections (Days 14-17)
GA4 OAuth + data extraction, GSC integration, Stripe read-only revenue data, CRM import (CSV + OAuth), social account connections, email platform integration.

### Phase 5: Archivist + Imports (Days 18-20)
Archivist Edge Function (dedup, normalize, gap detect, expire, quality score), import pipeline (CSV/JSON/PDF/DOCX parsing), content library analysis, contact cleaning, brand guide parsing.

### Phase 6: Dashboard, Billing, Floating Pill (Days 21-25)
ID dashboard (confidence ring, app launcher, Context Structure viewer, learning ledger), billing page (Stripe integration), connections manager, app management, settings, floating pill component in packages/ui/ (exported for all apps), app switcher.

### Phase 7: Synapse Template + First Test (Days 26-28)
Reusable Synapse template in packages/synapse/, first Synapse deployment (DM Synapse as proof), end-to-end test.

### Phase 8: Dark Madder Migration (Days 29-35)
Copy existing DM into apps/dm/. Surgical migration: swap auth, add Synapse, add pill, swap data sources, remove DM-specific onboarding/billing. See Migration Strategy section above.

### Phase 9: Harvest Build (Days 36-46)
Fresh build in apps/hv/ with transplanted Bloomify logic. Contact management, outreach composer, pipeline view, Harvest Synapse. See Migration Strategy section above.

### Phase 10+: Hypothesis + Litmus
Built fresh in apps/ht/ and apps/lt/. Kinetiks-native from day one. See individual app spec documents.

---

## Related Documents (all in docs/)

- **Kinetiks ID Definitive Product Spec** - the core product vision
- **Kinetiks ID Product Spec Addendum** - navigation, auth, billing, floating pill, user journeys
- **Kinetiks Agent Architecture & Proposal Protocol v2** - Cortex, Synapse, Operator system
- **Kinetiks Corporate Structure Addendum** - Kinetiks AI is the company (not Pandra)
- **Litmus Strategic Architecture v2** - multi-agent PR engine
- **Litmus v3 Kinetiks-Native Update** - Synapse spec, Operator updates, workflows
- **Dark Madder Migration Guide** - surgical port into monorepo
- **Harvest Build Guide** - web app rebuild with Bloomify logic transplant
- **Bloomify Build Docs (legacy)** - Chrome extension build docs, reference for logic port
