# Kinetiks Platform Contract

> **Read this before building anything that connects to Kinetiks.**
> This is the contract between the Kinetiks core platform and everything that plugs into it: apps (Harvest, Dark Madder, Litmus, Hypothesis, future apps), integrations (GA4, Stripe, GSC, any data source), and intelligence agents.
> If you follow this contract, your thing works with Marcus, the Oracle, the approval system, the analytics tab, and every other app — automatically. If you don't, it's an island.

---

## Architecture Overview

Kinetiks is a GTM operating system. The core platform at kinetiks.ai provides:

- **Marcus** — A conversational AI strategist with tool access to all connected sources and apps
- **Cortex** — The intelligence layer (Context Structure, Operator Profiles, proposals, routing)
- **Oracle** — Analytics intelligence (insight store, metric cache, goal tracking)
- **Approval System** — Confidence-based gating for consequential agent actions
- **Learning Ledger** — Append-only log of every agent action, approval, and outcome

Everything plugs in through **tools**. Integrations expose data-access tools. Apps expose capability tools. Agents use tools to reason and act. Marcus uses tools to answer questions and orchestrate work.

```
Marcus (conversational) + Background Agents (autonomous)
        │
        ▼
   Tool Registry  ← every integration, app, and platform capability
        │
   ┌────┴─────────────────────────┐
   │                              │
Integration Tools            App Tools
(GA4, Stripe, GSC,          (Harvest, Dark Madder,
 Ads, CRM, Social)           Litmus, Hypothesis)
```

**One Supabase project.** All apps share a single Supabase instance. Tables use app prefixes (`hv_*`, `dm_*`, `lt_*`, `ht_*`). The core uses `kinetiks_*` tables. RLS enforced everywhere.

**One monorepo.** All apps live in `apps/` and share code via `packages/`. Each app deploys to its own Vercel project (`hv.kinetiks.ai`, `dm.kinetiks.ai`, etc.).

---

## What You're Building: Quick Reference

| I'm building... | Read sections... |
|---|---|
| A new Kinetiks app (like Litmus, Hypothesis) | §1 App Contract, §2 Synapse, §3 Tools, §5 Database, §7 UI |
| A new integration/data source (like PostHog) | §4 Integration Contract, §3 Tools, §5 Database |
| A new intelligence agent | §6 Agent Contract, §3 Tools |
| A feature inside an existing app | §2 Synapse, §3 Tools, §7 UI, §8 Conventions |

---

## §1. App Contract

Every Kinetiks app implements this contract. No exceptions.

### 1.1 App Manifest

Every app has a manifest file at `apps/<prefix>/src/manifest.ts` that declares what the app is and what it can do:

```typescript
import type { KineticsAppManifest } from '@kinetiks/types';

export const manifest: KineticsAppManifest = {
  // Identity
  key: 'harvest',                    // Internal key. Lowercase, snake_case.
  prefix: 'hv',                      // 2-letter prefix for tables and routes.
  display: {
    name: 'Harvest',
    tagline: 'Outbound engine',      // One line, shown in app switcher
    description: 'Prospect research, personalized outreach, and pipeline management.',
    color: '#27AE60',                // Brand color (hex)
    icon: 'sprout',                  // Lucide icon name
  },
  url: 'https://hv.kinetiks.ai',

  // Context Structure access
  context: {
    readLayers: ['org', 'products', 'voice', 'customers', 'competitive'],
    writeLayers: ['customers', 'competitive'],
  },

  // Capabilities — what this app can do, described for Marcus
  capabilities: [
    {
      key: 'prospect_research',
      description: 'Find and enrich sales prospects that match the ICP',
      commands: ['find_prospects', 'enrich_contacts', 'score_leads'],
      requiredContext: ['customers.personas'],
    },
    {
      key: 'outreach_sequences',
      description: 'Build and execute personalized outreach email sequences',
      commands: ['create_sequence', 'draft_email', 'launch_sequence'],
      requiredContext: ['voice', 'products'],
    },
    {
      key: 'pipeline_management',
      description: 'Track and manage sales pipeline and deals',
      commands: ['update_deal', 'get_pipeline_status'],
      requiredContext: ['customers'],
    },
  ],

  // Status endpoint for health checks
  statusEndpoint: '/api/hv/status',
};
```

**The `capabilities` array is critical.** This is how Marcus knows what your app can do. When a user says "help me find warm prospects," Marcus scans all app manifests for matching capabilities. If your app doesn't declare its capabilities, Marcus can't use it.

Write descriptions as if you're telling a smart colleague what this app does. Be specific. "Manage outreach" is too vague. "Build and execute personalized outreach email sequences" tells Marcus exactly when to reach for this app.

### 1.2 Required Capabilities

Every app MUST implement:

| Capability | Why | How |
|---|---|---|
| **Status endpoint** | Health checks, connection verification | `GET /api/<prefix>/status` returns `{ healthy: boolean, version: string, features: string[] }` |
| **Metric reporting** | Oracle tracks app performance | Report metrics via Synapse (§2.3) or app tools (§3) |
| **Approval handling** | Consequential actions need approval | Actions flagged `requiresApproval: true` go through the approval system |

### 1.3 App Directory Structure

```
apps/<prefix>/
  src/
    manifest.ts              # App manifest (§1.1) — REQUIRED
    tools.ts                 # Tools this app exposes to the platform (§3) — REQUIRED
    synapse.ts               # Synapse preset (§2) — REQUIRED
    app/                     # Next.js App Router
      layout.tsx
      page.tsx
      api/
        <prefix>/            # All API routes under /api/<prefix>/
          status/route.ts    # Health check — REQUIRED
          ...
    components/
    lib/
      supabase/
        server.ts            # Can use shared @kinetiks/supabase or inline
        admin.ts
  package.json
  tsconfig.json
  tailwind.config.ts
```

### 1.4 Package Dependencies

Apps import from shared packages:

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

Only import what you use. `@kinetiks/types` and `@kinetiks/synapse` are required for every app. The others are optional.

---

## §2. Synapse (App ↔ Core Communication)

Synapse is the membrane between your app and the Kinetiks core. It handles three things:

### 2.1 Pulling Context

Your app reads the user's business identity from the Context Structure:

```typescript
import { createSynapse } from '@kinetiks/synapse';
import { harvestPreset } from '@kinetiks/synapse/presets';

const synapse = createSynapse(harvestPreset);

// Pull layers your app has read access to
const context = await synapse.pullContext(accountId, ['voice', 'products', 'customers']);

// Use context.layers.voice to personalize outreach
// Use context.layers.customers.personas to match prospects to ICP
```

**Rules:**
- Only request layers declared in your manifest's `readLayers`
- Cache aggressively (context doesn't change every request)
- Handle missing/partial data gracefully — a new user may have empty layers

### 2.2 Submitting Proposals

Your app can propose changes to the Context Structure. For example, Harvest discovers a new competitor during prospect research and proposes adding it to the competitive layer:

```typescript
await synapse.submitProposal(accountId, {
  targetLayer: 'competitive',
  action: 'enrich',
  confidence: 0.75,
  payload: {
    competitors: [{
      name: 'NewCo',
      website: 'https://newco.com',
      positioning: 'AI-powered analytics for SMBs',
      strengths: ['Lower price point', 'Simpler onboarding'],
      weaknesses: ['No enterprise features'],
    }],
  },
  evidence: [{
    source: 'harvest_prospect_research',
    detail: 'Found 12 prospects mentioning NewCo as alternative during enrichment',
  }],
});
```

**Rules:**
- Only propose to layers declared in your manifest's `writeLayers`
- Proposals go through the Cortex evaluation pipeline (confidence scoring, conflict detection, optional human approval)
- Scalar fields in the Context Structure are sacred — you can propose additions to arrays (new competitors, new personas) but not overwrite scalar values (company name, industry)
- Include evidence. Proposals without evidence are rejected.

### 2.3 Reporting Metrics

Your app reports its metrics via Synapse for the Oracle to track:

```typescript
await synapse.reportMetrics(accountId, [
  { key: 'hv_emails_sent', value: 147, period: '2026-04-08', periodType: 'daily' },
  { key: 'hv_reply_rate', value: 0.12, period: '2026-04-08', periodType: 'daily' },
  { key: 'hv_meetings_booked', value: 3, period: '2026-04-08', periodType: 'daily' },
]);
```

**Rules:**
- Metric keys must start with your app prefix (`hv_`, `dm_`, `lt_`, `ht_`)
- Report at least daily for active metrics
- Use consistent period types (daily is the standard; hourly only if the data meaningfully changes that fast)
- Metrics are additive to the metric cache — they don't replace what integrations report

### 2.4 Synapse Preset

Every app defines a Synapse preset at `packages/synapse/src/presets/<app>.ts`:

```typescript
// packages/synapse/src/presets/harvest.ts

import type { SynapseConfig } from '../types';

export const harvestPreset: Partial<SynapseConfig> = {
  appName: 'harvest',
  baseUrl: process.env.KINETIKS_ID_URL || 'https://kinetiks.ai',
  readLayers: ['org', 'products', 'voice', 'customers', 'competitive'],
  writeLayers: ['customers', 'competitive'],
  filterProposal: (data) => {
    // Block internal operational data from becoming proposals
    const BLOCKED_KEYS = new Set(['email_draft', 'email_body', 'sequence', 'enrichment_raw']);
    const hasBlocked = Object.keys(data).some(k => BLOCKED_KEYS.has(k));
    if (hasBlocked) return { shouldPropose: false };
    return { shouldPropose: true, proposal: buildProposal(data) };
  },
  handleRoutingEvent: async (event) => {
    // Handle events routed from Cortex (e.g., new customer persona discovered)
  },
};
```

### 2.5 Sentinel Review

Before your app sends content externally (emails, social posts, pitches), submit it to Sentinel for brand safety and compliance review:

```typescript
const review = await synapse.submitReview(accountId, {
  content_type: 'outreach_email',
  content: emailBody,
  contact_email: prospect.email,
  org_domain: prospect.company_domain,
});

if (review.verdict === 'blocked') {
  // Don't send. Show the user why.
} else if (review.verdict === 'flagged') {
  // Send but flag for human review.
}
```

---

## §3. Tools (Exposing Capabilities to Agents)

Every app and integration exposes tools that Marcus and background agents can use. This is how the platform discovers what's possible.

### 3.1 Tool Definition

```typescript
// apps/<prefix>/src/tools.ts

import type { AgentTool } from '@kinetiks/types';

export const tools: AgentTool[] = [
  {
    name: '<prefix>_<action>',          // e.g., 'hv_find_prospects'
    description: '...',                  // Written for an LLM. Be specific.
    parameters: {
      type: 'object',
      properties: { /* JSON Schema */ },
      required: ['...'],
    },
    isConsequential: false,             // true if this changes external state
    autoApproveThreshold: null,         // null = always needs human approval
    execute: async (params, ctx) => {
      // Implement the tool
      // ctx.accountId is available
      // Return structured data the agent can reason about
    },
  },
];
```

### 3.2 Tool Naming Convention

```
<prefix>_<verb>_<noun>

Examples:
  hv_find_prospects
  hv_create_sequence
  hv_get_pipeline_status
  dm_draft_article
  dm_get_content_performance
  lt_find_journalists
  lt_draft_pitch
  ht_create_landing_page
  ht_get_test_results
```

### 3.3 Tool Description Quality

**This is the most important part.** Marcus decides which tools to call based on descriptions. Bad descriptions = Marcus never uses your tool or uses it wrong.

```typescript
// BAD — too vague, Marcus won't know when to use it
{
  name: 'hv_get_data',
  description: 'Get data from Harvest',
}

// GOOD — specific, Marcus knows exactly when this is useful
{
  name: 'hv_get_sequence_performance',
  description: 'Get performance metrics for outreach sequences including open rates, reply rates, bounce rates, and meeting conversion by sequence. Can filter by date range and sequence status. Use this when the user asks about outreach performance, email effectiveness, or sequence results.',
}
```

**Rules for descriptions:**
- Write as if briefing a smart colleague who's never used your app
- Include what data is returned, not just what the tool does
- Include when the tool should be used ("Use this when...")
- If the tool has important limitations, state them
- 2-4 sentences is the sweet spot

### 3.4 Consequential vs Read-Only Tools

```typescript
// Read-only: no approval needed, agents call freely
{ name: 'hv_get_pipeline_status', isConsequential: false }
{ name: 'hv_find_prospects', isConsequential: false }
{ name: 'dm_get_content_performance', isConsequential: false }

// Consequential: goes through approval system
{ name: 'hv_create_sequence', isConsequential: true, autoApproveThreshold: null }
{ name: 'hv_send_email', isConsequential: true, autoApproveThreshold: null }
{ name: 'dm_publish_article', isConsequential: true, autoApproveThreshold: null }
{ name: 'lt_send_pitch', isConsequential: true, autoApproveThreshold: null }
```

**If a tool changes external state (sends an email, publishes content, creates a campaign, modifies a deal), it MUST be marked `isConsequential: true`.** No exceptions. The approval system exists to keep agents safe. Don't bypass it.

### 3.5 Tool Return Values

Tools return structured data that agents reason about. Return useful, complete information:

```typescript
// BAD — agent can't do much with this
return { success: true };

// GOOD — agent can analyze, compare, recommend
return {
  sequences: [
    {
      id: 'seq_123',
      name: 'Q2 Enterprise Outreach',
      status: 'active',
      contacts_enrolled: 234,
      emails_sent: 891,
      open_rate: 0.42,
      reply_rate: 0.11,
      meetings_booked: 8,
      started_at: '2026-03-15',
    },
    // ...
  ],
  summary: {
    total_sequences: 3,
    total_contacts: 567,
    average_reply_rate: 0.09,
    best_performing: 'Q2 Enterprise Outreach',
  },
};
```

### 3.6 Tool Registration

Tools are registered at app startup. The platform discovers them automatically:

```typescript
// apps/id/src/lib/tools/register-all.ts

import { toolRegistry } from './registry';
import { harvestTools } from './apps/harvest';
import { darkMadderTools } from './apps/dark-madder';
import { ga4Tools } from './integrations/ga4';
import { stripeTools } from './integrations/stripe';
import { platformTools } from './platform';

// Platform tools — always available
toolRegistry.registerPlatformTools(platformTools);

// App tools — available when app is active for the account
toolRegistry.registerAppTools('harvest', harvestTools);
toolRegistry.registerAppTools('dark_madder', darkMadderTools);

// Integration tools — available when source is connected
toolRegistry.registerIntegrationTools('ga4', ga4Tools);
toolRegistry.registerIntegrationTools('stripe', stripeTools);
```

---

## §4. Integration Contract (Data Sources)

Integrations are external data sources (GA4, Stripe, GSC, etc.). They plug in by providing tools and a connection handler.

### 4.1 Integration Structure

```
apps/id/src/lib/integrations/providers/<provider>/
  tools.ts                # Tools this integration exposes
  connection.ts           # OAuth/API key setup + health check
  index.ts                # Re-exports
```

### 4.2 Connection Handler

```typescript
// apps/id/src/lib/integrations/providers/ga4/connection.ts

import type { IntegrationConnection } from '@kinetiks/types';

export const ga4Connection: IntegrationConnection = {
  key: 'ga4',
  displayName: 'Google Analytics 4',
  description: 'Website traffic, user behavior, conversions, and traffic sources',
  category: 'analytics',
  authType: 'oauth',
  oauthConfig: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    pkce: true,
  },

  async healthCheck(credentials): Promise<{ healthy: boolean; message: string }> {
    // Make a minimal API call to verify credentials work
    // Return { healthy: false, message: 'Token expired' } if not
  },
};
```

### 4.3 Integration Tools

Same format as app tools (§3), but scoped to data access:

```typescript
// apps/id/src/lib/integrations/providers/ga4/tools.ts

export const ga4Tools: AgentTool[] = [
  {
    name: 'ga4_query',
    description: 'Query Google Analytics 4 for any combination of metrics and dimensions. Supports sessions, users, pageviews, events, conversions, bounce rate, session duration, and any custom metrics. Can break down by source, medium, campaign, page, country, device, and custom dimensions. Use this whenever you need website traffic or behavior data.',
    parameters: { /* ... */ },
    isConsequential: false,
    execute: async (params, ctx) => {
      // 1. Get decrypted credentials for this account
      // 2. Call GA4 Data API
      // 3. Cache the result
      // 4. Return structured data
    },
  },
];
```

### 4.4 What Makes a Good Integration

The best integrations give agents flexible tools, not predefined reports:

```typescript
// BAD — too rigid, can only get predefined data
{
  name: 'ga4_get_weekly_report',
  description: 'Get the standard weekly traffic report',
}

// GOOD — flexible, agent queries what it needs
{
  name: 'ga4_query',
  description: 'Query GA4 for any metric/dimension combination...',
  parameters: {
    metrics: { type: 'array', description: 'Any GA4 metrics...' },
    dimensions: { type: 'array', description: 'Any GA4 dimensions...' },
    date_range: { /* ... */ },
    filters: { /* ... */ },
  },
}
```

Give the agent power. It's smarter than a static report.

---

## §5. Database Conventions

### 5.1 Table Naming

All tables prefixed by app:

| App | Prefix | Example |
|-----|--------|---------|
| Kinetiks core | `kinetiks_` | `kinetiks_insights`, `kinetiks_goals` |
| Harvest | `hv_` | `hv_contacts`, `hv_sequences` |
| Dark Madder | `dm_` | `dm_articles`, `dm_keywords` |
| Litmus | `lt_` | `lt_journalists`, `lt_pitches` |
| Hypothesis | `ht_` | `ht_pages`, `ht_tests` |

### 5.2 Required Tables

Every app needs at minimum:

```sql
-- Status/health table for the status endpoint
create table <prefix>_status (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references auth.users not null,
  status text not null default 'active',
  last_active_at timestamptz default now(),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

### 5.3 RLS is Mandatory

Every user-owned table MUST have Row Level Security:

```sql
alter table <prefix>_<table> enable row level security;

create policy "Users can read own data"
  on <prefix>_<table> for select
  using (user_id = auth.uid());

-- Or for account-scoped tables:
create policy "Users can read own account data"
  on <prefix>_<table> for select
  using (account_id = auth.uid());
```

**Never bypass RLS with the service role key in client-side code.** Service role is for Edge Functions and server-side admin operations only.

### 5.4 Migrations

All migrations live in `supabase/migrations/` at the monorepo root. Numbered sequentially across all apps:

```
supabase/migrations/
  00001_core_tables.sql
  ...
  00013_harvest_tables.sql
  00014_hv_style_presets.sql
  ...
  00029_litmus_tables.sql          # new app gets the next number
```

Never modify an existing migration. Always add new ones.

---

## §6. Agent Contract

Intelligence agents run in the background, analyze data, and produce insights.

### 6.1 Agent Definition

```typescript
// apps/id/src/lib/agents/<agent-key>.ts

import type { AgentConfig } from '@kinetiks/types';

export const myAgent: AgentConfig = {
  key: 'performance_analyst',              // Unique, snake_case
  name: 'Performance Analyst',
  model: 'claude-sonnet-4-20250514',       // Sonnet for analysis, Haiku for routine monitoring
  maxToolCalls: 30,                        // Cost guardrail
  requiresApproval: false,                 // true if agent takes consequential actions
  toolCategories: ['platform', 'integration', 'app'],  // what tools it can access
  systemPrompt: `...`,                     // See §6.2
};
```

### 6.2 System Prompt Quality

The system prompt IS the agent. It defines personality, focus, and judgment. Write it like you're onboarding a senior analyst.

**Must include:**
- What the agent's role is (one sentence)
- What data sources it should check
- What it should look for (specific patterns, not "find insights")
- How to evaluate significance (not everything is an insight)
- What format to store insights in
- What NOT to do (avoid noise, don't store trivial findings)

**Example structure:**

```
You are a [role] for a GTM team.
Your job is to [specific mission].

You have access to:
- [List available tool categories and what they provide]

On each run:
1. [First thing to check]
2. [Second thing to check]
3. [How to evaluate findings]
4. [When to store an insight vs skip]

Quality bar: Only store insights that would change a decision.
[Specific example of a good insight]
[Specific example of what NOT to store]
```

### 6.3 Insight Quality

Agents store insights via the `store_insight` platform tool. Quality requirements:

```typescript
// GOOD insight — specific, actionable, grounded in data
{
  type: 'opportunity',
  severity: 'important',
  summary: 'Organic traffic from "developer tools" keywords converts at 3.2x your average rate (14% vs 4.3%), driven by 3 blog posts published in March. This traffic segment grew 47% week-over-week. Recommend: have Dark Madder write a follow-up series on developer tooling topics.',
  evidence: {
    source: 'ga4',
    metrics: { segment_conversion: 0.14, average_conversion: 0.043, traffic_growth: 0.47 },
    timeframe: 'last 7 days vs previous 7 days',
    pages: ['/blog/dev-tools-guide', '/blog/api-best-practices', '/blog/sdk-comparison'],
  },
  suggested_action: {
    app: 'dark_madder',
    command: 'draft_content_brief',
    params: { topic_cluster: 'developer tools', target_count: 3 },
  },
}

// BAD insight — vague, no data, not actionable
{
  type: 'info',
  severity: 'info',
  summary: 'Traffic is looking good this week.',
}
```

**The bar:** Would a human CMO forward this insight to their team? If not, don't store it.

---

## §7. UI Conventions

### 7.1 Design System

All apps use the shared Kinetiks design system:

- **Fonts:** Geist Sans + Geist Mono
- **Styling:** Tailwind CSS with CSS custom properties for theming
- **Dark mode:** Required. Use CSS custom properties, not Tailwind dark: variants
- **Components:** Import shared components from `@kinetiks/ui` where available
- **Mobile-first:** All primary actions in thumb zone. Test on mobile.

### 7.2 Floating Pill

Every app connected to Kinetiks shows the floating pill (`@kinetiks/ui/floating-pill`). For standalone users, it shows a minimal upgrade CTA. For connected users, it shows the system name, approval count, and quick-chat access.

```typescript
import { FloatingPill } from '@kinetiks/ui';

// In your app's root layout:
<FloatingPill />
```

### 7.3 Auth

Apps authenticate via the shared Kinetiks ID cookie (`.kinetiks.ai` domain). Users sign in once at kinetiks.ai, the cookie is shared across all subdomains.

For standalone users (not connected to Kinetiks), apps can create a Kinetiks ID behind the scenes during signup. Every app signup creates a Kinetiks account.

### 7.4 Navigation

Apps own their own internal navigation. The floating pill provides cross-app navigation. Don't build your own app switcher.

### 7.5 Settings

App-specific settings live inside the app. Billing, account, and Kinetiks-wide settings live at kinetiks.ai/settings. Don't duplicate billing UI in your app.

---

## §8. Code Conventions

### 8.1 TypeScript

- Strict mode. No `any`. No type assertions without a comment explaining why.
- Import types from `@kinetiks/types` for shared types.
- Define app-specific types in your app's `lib/` directory.

### 8.2 Server Components by Default

Use React Server Components for everything that doesn't need client interactivity. Only add `"use client"` when you need `useState`, `useEffect`, or event handlers.

### 8.3 API Routes

All API routes under `/api/<prefix>/`:

```
apps/hv/src/app/api/hv/contacts/route.ts    ✅
apps/hv/src/app/api/contacts/route.ts        ❌ (missing prefix)
```

### 8.4 Error Handling

Never blank screens. Every error state has:
- A visual indicator (not just console.error)
- A recovery action (retry, reload, contact support)
- Graceful degradation (show cached data when live data fails)

### 8.5 Commits

Conventional commits. One logical change per commit.

```
feat(harvest): add bulk enrichment pipeline
fix(dm): prevent duplicate article slugs
refactor(types): add MetricCapability to integration types
chore: update dependencies
```

### 8.6 Testing

- Unit tests for business logic (scoring, gating, computation)
- Integration tests for API routes
- Test critical constraints (e.g., no unauthorized data access, approval required for consequential actions)

---

## §9. The Approval System

Any tool or action marked `isConsequential: true` goes through the approval system before execution.

### 9.1 How It Works

1. Agent (Marcus or background) decides to call a consequential tool
2. Instead of executing, the platform creates an approval request
3. The request appears in the user's approval queue (Chat sidebar, notifications, Slack)
4. User approves, edits, or rejects
5. On approval, the tool executes with the approved parameters
6. Result is logged to the Learning Ledger

### 9.2 Confidence Escalation

Over time, the system earns trust:
- **Day 1:** All consequential actions require human approval
- **Over time:** Approval patterns build confidence scores
- **Eventually:** Low-risk, high-confidence actions can auto-approve (but user can always override)

### 9.3 What Needs Approval

| Always needs approval | Never needs approval |
|---|---|
| Sending an email | Reading data from any source |
| Publishing content | Querying metrics |
| Creating a campaign/sequence | Generating drafts (not sending) |
| Modifying a deal/pipeline | Analyzing performance |
| Posting to social | Browsing competitor websites |
| Sending a PR pitch | Storing an insight |

**Rule of thumb:** If it leaves the Kinetiks system and touches the outside world, it needs approval.

---

## §10. Adding a New App (Checklist)

When you build a new Kinetiks app, verify each of these:

- [ ] App directory at `apps/<prefix>/` with Next.js App Router
- [ ] `manifest.ts` with complete capabilities declared
- [ ] `tools.ts` with all capabilities exposed as tools
- [ ] Synapse preset at `packages/synapse/src/presets/<app>.ts`
- [ ] `filterProposal` function blocks internal operational data from becoming proposals
- [ ] `handleRoutingEvent` function handles events from Cortex
- [ ] All API routes under `/api/<prefix>/`
- [ ] Status endpoint at `/api/<prefix>/status`
- [ ] Database tables prefixed with `<prefix>_`
- [ ] RLS enabled on every user-owned table
- [ ] Migrations added to `supabase/migrations/` (next sequential number)
- [ ] Floating pill mounted in root layout
- [ ] Auth via shared Kinetiks ID cookie
- [ ] Dark mode working
- [ ] Mobile-responsive
- [ ] Consequential tools marked with `isConsequential: true`
- [ ] Sentinel review for any externally-sent content
- [ ] Error states defined (no blank screens)
- [ ] Analytics events instrumented
- [ ] Tests for critical business logic

---

## §11. Adding a New Integration (Checklist)

- [ ] Provider directory at `apps/id/src/lib/integrations/providers/<provider>/`
- [ ] `connection.ts` with OAuth/API key config + health check
- [ ] `tools.ts` with flexible query tools (not rigid predefined reports)
- [ ] Tool descriptions written for LLM consumption (specific, when-to-use)
- [ ] Tools registered in `apps/id/src/lib/tools/register-all.ts`
- [ ] Provider added to `ConnectionProvider` union in `@kinetiks/types`
- [ ] Provider definition added to `apps/id/src/lib/connections/providers.ts`
- [ ] OAuth flow tested (connect, token refresh, revocation detection)
- [ ] Health check tested (valid credentials, expired credentials, revoked credentials)
- [ ] Connection UI card added to settings
- [ ] Rate limiting handled in tool execution (don't exceed provider limits)
- [ ] Errors return useful messages (not raw API errors)
- [ ] Cached results where appropriate (don't re-query for identical requests)

---

## §12. Adding a New Agent (Checklist)

- [ ] Agent config at `apps/id/src/lib/agents/<agent-key>.ts`
- [ ] System prompt is specific, actionable, and includes quality bar
- [ ] `maxToolCalls` set to a reasonable limit (cost guardrail)
- [ ] `model` chosen appropriately (Sonnet for analysis, Haiku for monitoring)
- [ ] `toolCategories` only includes what the agent actually needs
- [ ] Agent registered in scheduler
- [ ] Tested: agent produces useful insights with real data
- [ ] Tested: agent stops gracefully at maxToolCalls
- [ ] Tested: agent handles missing data sources (some accounts won't have GA4)
- [ ] Cost estimated per run and documented

---

## §13. Types Reference

Core types used across the platform. Import from `@kinetiks/types`.

### Context Layers

```typescript
type ContextLayer = 'org' | 'products' | 'voice' | 'customers' | 'narrative' | 'competitive' | 'market' | 'brand';
```

### Agent Tool

```typescript
interface AgentTool {
  name: string;                              // <prefix>_<verb>_<noun>
  description: string;                       // Written for LLM consumption
  parameters: JSONSchema;                    // JSON Schema for tool input
  isConsequential: boolean;                  // Requires approval?
  autoApproveThreshold: number | null;       // Confidence threshold for auto-approve
  execute: (params: unknown, ctx: ToolContext) => Promise<unknown>;
}

interface ToolContext {
  accountId: string;
  userId: string;
  tier: 'free' | 'standard' | 'pro' | 'enterprise';
}
```

### Insight

```typescript
interface Insight {
  type: 'anomaly' | 'trend' | 'correlation' | 'opportunity' | 'risk' | 'recommendation';
  severity: 'info' | 'notable' | 'important' | 'urgent';
  summary: string;                           // Natural language, ready to show user
  evidence: Record<string, unknown>;         // Structured data backing the insight
  suggested_action?: {
    app: string;
    command: string;
    params: Record<string, unknown>;
  };
}
```

### App Manifest

```typescript
interface KineticsAppManifest {
  key: string;
  prefix: string;
  display: { name: string; tagline: string; description: string; color: string; icon: string };
  url: string;
  context: { readLayers: ContextLayer[]; writeLayers: ContextLayer[] };
  capabilities: AppCapability[];
  statusEndpoint: string;
}

interface AppCapability {
  key: string;
  description: string;                       // Written for Marcus — be specific
  commands: string[];                        // Tool names this capability uses
  requiredContext: string[];                  // What context layers are needed
}
```

### Integration Connection

```typescript
interface IntegrationConnection {
  key: string;
  displayName: string;
  description: string;
  category: ProviderCategory;
  authType: 'oauth' | 'api_key' | 'webhook';
  oauthConfig?: OAuthConfig;
  healthCheck: (credentials: DecryptedCredentials) => Promise<{ healthy: boolean; message: string }>;
}
```

---

## §14. What the Core Gives You for Free

When you follow this contract, your app/integration/agent automatically gets:

| Capability | How |
|---|---|
| **Marcus can use your app** | Your tools are in Marcus's tool list. Users can ask Marcus to do things with your app. |
| **Cross-app intelligence** | Oracle correlates your metrics with data from every other app and integration. |
| **Approval system** | Consequential actions are gated. Users trust the system. |
| **Context Structure** | Your app reads rich business identity (voice, brand, customers, competitive, etc.) without building its own onboarding. |
| **Sentinel review** | Content safety and brand compliance for anything you send externally. |
| **Learning Ledger** | Every action logged. The system gets smarter over time. |
| **Analytics tab** | Your metrics show up in the unified dashboard. |
| **Background intelligence** | Agents analyze your data alongside everything else. |
| **Desktop notifications** | Insights about your app reach users via the desktop app. |
| **Slack integration** | Marcus can discuss your app's data and take actions in Slack. |

You don't build any of this. You implement the contract. The platform does the rest.
