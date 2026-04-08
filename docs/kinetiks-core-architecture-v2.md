# Kinetiks Core Platform Architecture v2

> **2026 architecture: the LLM is the orchestration layer, not a feature on top.**
> Agents with tools, not pipelines with configs. The system reasons about what to do, not follows a script.

---

## The Shift

Most "AI products" are traditional software with an LLM bolted on for chat or text generation. Kinetiks should be different. The intelligence layer isn't a feature — it IS the product. Marcus isn't a chatbot that reads pre-assembled context. Marcus is a strategist with tools that can query any data source, reason about what's happening, and orchestrate action across apps.

This means the core platform's job is not to build pipelines that pre-process data for Marcus. It's to give Marcus (and other agents) the right tools, the right context, and the right guardrails.

---

## 1. The Tool Layer

Every integration, app, and data source exposes tools. These are Claude-native tool definitions that any agent in the system can invoke.

### Integration Tools

When a user connects GA4, the system doesn't create a static extractor. It makes GA4's capabilities available as tools:

```typescript
// apps/id/src/lib/tools/integrations/ga4.ts

/**
 * GA4 tools — available to any agent when GA4 is connected.
 * These are Claude tool definitions, not REST endpoints.
 * The agent decides when and how to use them.
 */
export const ga4Tools: AgentTool[] = [
  {
    name: 'ga4_query_metrics',
    description: 'Query Google Analytics 4 for any metric or dimension combination. Use this to understand website traffic, user behavior, conversion data, and traffic sources. You can query sessions, users, pageviews, events, conversions, and any custom dimensions the user has configured.',
    parameters: {
      type: 'object',
      properties: {
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'GA4 metric names (e.g., "sessions", "totalUsers", "conversions", "bounceRate", "averageSessionDuration")',
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'GA4 dimension names for breakdowns (e.g., "sessionSource", "sessionMedium", "pagePath", "country", "deviceCategory")',
        },
        date_range: {
          type: 'object',
          properties: {
            start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            end: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          },
          required: ['start', 'end'],
        },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              dimension: { type: 'string' },
              operator: { type: 'string', enum: ['EXACT', 'CONTAINS', 'BEGINS_WITH', 'REGEX'] },
              value: { type: 'string' },
            },
          },
          description: 'Optional filters to narrow results',
        },
        limit: { type: 'number', description: 'Max rows to return (default 100)' },
      },
      required: ['metrics', 'date_range'],
    },
    // The execute function handles OAuth, rate limits, and error recovery
    execute: async (params, ctx) => { /* calls GA4 Data API */ },
  },
  {
    name: 'ga4_get_realtime',
    description: 'Get real-time active users and what they are doing on the website right now.',
    parameters: { /* ... */ },
    execute: async (params, ctx) => { /* calls GA4 Realtime API */ },
  },
  {
    name: 'ga4_list_custom_dimensions',
    description: 'Discover what custom dimensions and events the user has configured in GA4. Useful for understanding what data is available before querying.',
    parameters: { /* ... */ },
    execute: async (params, ctx) => { /* calls GA4 Admin API */ },
  },
];
```

**The agent decides what to query.** It doesn't pull 12 predefined metrics on a schedule. It looks at the user's goals and context and builds queries that answer real questions.

### App Tools

Each Kinetiks app exposes its capabilities as tools:

```typescript
// Harvest exposes tools like:
export const harvestTools: AgentTool[] = [
  {
    name: 'harvest_find_prospects',
    description: 'Search for prospects matching criteria. Can search by company attributes, job titles, technologies used, recent activity signals, and ICP fit.',
    parameters: { /* ... */ },
    execute: async (params, ctx) => { /* calls Harvest API */ },
  },
  {
    name: 'harvest_get_pipeline',
    description: 'Get current sales pipeline status including deal stages, values, and health indicators.',
    parameters: { /* ... */ },
    execute: async (params, ctx) => { /* calls Harvest API */ },
  },
  {
    name: 'harvest_create_sequence',
    description: 'Create a new outreach sequence. Requires approval before sending.',
    parameters: { /* ... */ },
    execute: async (params, ctx) => { /* calls Harvest API, flags for approval */ },
  },
  {
    name: 'harvest_get_sequence_performance',
    description: 'Get performance data for active sequences including open rates, reply rates, and meeting conversion.',
    parameters: { /* ... */ },
    execute: async (params, ctx) => { /* calls Harvest API */ },
  },
];
```

### Platform Tools

Tools that aren't tied to a specific integration or app:

```typescript
export const platformTools: AgentTool[] = [
  {
    name: 'browse_web',
    description: 'Browse a URL and extract its content. Use for competitor research, market analysis, checking what a company does, reading articles.',
    parameters: {
      url: { type: 'string', description: 'URL to browse' },
      extract: { type: 'string', enum: ['full', 'summary', 'structured'], description: 'How much to extract' },
    },
    execute: async (params, ctx) => { /* headless browser fetch */ },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information about companies, people, trends, or topics.',
    parameters: {
      query: { type: 'string' },
      recency: { type: 'string', enum: ['day', 'week', 'month', 'any'] },
    },
    execute: async (params, ctx) => { /* search API */ },
  },
  {
    name: 'read_context',
    description: 'Read the user\'s business context from the Context Structure. Contains company info, products, voice, customers, narrative, competitive landscape, market data, and brand.',
    parameters: {
      layers: { type: 'array', items: { type: 'string' }, description: 'Which layers to read (org, products, voice, customers, narrative, competitive, market, brand)' },
    },
    execute: async (params, ctx) => { /* reads from Cortex */ },
  },
  {
    name: 'read_goals',
    description: 'Read the user\'s defined goals and current progress.',
    parameters: {},
    execute: async (params, ctx) => { /* reads from goals table */ },
  },
  {
    name: 'store_insight',
    description: 'Store a structured insight that you have discovered. This will be surfaced to the user via Marcus, the analytics tab, or notifications depending on severity.',
    parameters: {
      type: { type: 'string', enum: ['anomaly', 'trend', 'correlation', 'opportunity', 'risk', 'recommendation'] },
      severity: { type: 'string', enum: ['info', 'notable', 'important', 'urgent'] },
      summary: { type: 'string', description: 'Clear, natural language summary of the insight' },
      evidence: { type: 'object', description: 'Structured data backing this insight' },
      suggested_action: { type: 'object', description: 'Optional: what should be done about this' },
    },
    execute: async (params, ctx) => { /* writes to kinetiks_insights */ },
  },
  {
    name: 'get_connected_sources',
    description: 'List what data sources and apps the user has connected, their health status, and when they were last accessed.',
    parameters: {},
    execute: async (params, ctx) => { /* reads connections + app status */ },
  },
];
```

### The Tool Registry

```typescript
// apps/id/src/lib/tools/registry.ts

/**
 * Central registry of all tools available to agents.
 * Tools are registered at startup by integrations, apps, and the platform.
 * Per-account tool availability depends on what's connected.
 */

interface ToolRegistry {
  /** Register tools from an integration (available when connected) */
  registerIntegrationTools(providerKey: string, tools: AgentTool[]): void;

  /** Register tools from an app (available when app is active) */
  registerAppTools(appKey: string, tools: AgentTool[]): void;

  /** Register platform-level tools (always available) */
  registerPlatformTools(tools: AgentTool[]): void;

  /** Get all tools available for a specific account (based on connections + active apps) */
  getToolsForAccount(accountId: string): Promise<AgentTool[]>;

  /** Get tool by name */
  getTool(name: string): AgentTool | undefined;
}
```

**The key insight:** When Marcus (or any agent) starts a task, it gets a tool list tailored to what this specific user has connected. A user with GA4 + Stripe + Harvest gets different tools than a user with just Harvest. The agent adapts its reasoning to what's available.

---

## 2. The Agent Runtime

Agents are goal-directed processes with tool access that run within the Kinetiks system. Some are conversational (Marcus), some are background (intelligence agents), some are triggered (on data change, on schedule, on user action).

### Agent Types

```typescript
// packages/types/src/agent.ts

/**
 * Base agent configuration. All agents share this shape.
 */
export interface AgentConfig {
  /** Unique agent key */
  key: string;
  /** Human-readable name */
  name: string;
  /** System prompt that defines this agent's role and behavior */
  systemPrompt: string;
  /** What tools this agent can use (filtered by account at runtime) */
  toolCategories: ('integration' | 'app' | 'platform' | 'internal')[];
  /** Max tool calls per execution (cost guardrail) */
  maxToolCalls: number;
  /** Model to use */
  model: 'claude-sonnet-4-20250514' | 'claude-haiku-4-5-20251001';
  /** Whether this agent's actions go through the approval system */
  requiresApproval: boolean;
}
```

### Marcus (Conversational Agent)

Marcus is a conversational agent with full tool access. Every message from the user triggers a Claude API call where Marcus has:

- All platform tools (always)
- All integration tools for connected sources
- All app tools for active apps
- Conversation history
- The user's Context Structure (injected, not tool-called, for speed)
- Recent insights (injected)

Marcus reasons about what the user needs, queries data sources as needed, and either answers directly or orchestrates actions. It doesn't read a pre-built context blob — it pulls what it needs.

```typescript
// apps/id/src/lib/marcus/engine.ts (revised)

async function runMarcus(
  accountId: string,
  userMessage: string,
  threadHistory: Message[],
): Promise<MarcusResponse> {
  // 1. Get available tools for this account
  const tools = await toolRegistry.getToolsForAccount(accountId);

  // 2. Build system prompt with injected context
  //    (Context Structure is injected for speed - it's read every turn anyway)
  //    (Recent insights are injected so Marcus can proactively mention them)
  const contextLayers = await loadContextLayers(accountId);
  const recentInsights = await getUndeliveredInsights(accountId, 5);
  const goals = await getActiveGoals(accountId);

  const systemPrompt = buildMarcusPrompt({
    contextLayers,
    recentInsights,
    goals,
    connectedSources: await getConnectedSources(accountId),
    activeApps: await getActiveApps(accountId),
  });

  // 3. Run Claude with tools
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [...threadHistory, { role: 'user', content: userMessage }],
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })),
  });

  // 4. Execute any tool calls
  //    (approval system gates consequential actions)
  const finalResponse = await executeToolCalls(response, tools, accountId);

  // 5. Extract actions from response (proposals, commands, follow-ups)
  const actions = await extractActions(finalResponse);

  return { response: finalResponse, actions };
}
```

### Background Intelligence Agents

These run on schedules or triggers. Each one has a focused mission, a system prompt, and tool access.

```typescript
// apps/id/src/lib/agents/competitive-intel.ts

export const competitiveIntelAgent: AgentConfig = {
  key: 'competitive_intel',
  name: 'Competitive Intelligence',
  systemPrompt: `You are a competitive intelligence analyst for a GTM team.
Your job is to monitor the competitive landscape and surface actionable insights.

You have access to:
- The user's competitive layer (known competitors, positioning)
- Web browsing (to check competitor websites, social, content)
- The user's own metrics (to compare performance)

On each run:
1. Read the competitive layer to understand known competitors
2. Browse each competitor's website for changes (pricing, features, positioning, new content)
3. Check if any competitor changes create opportunities or threats
4. Store insights for anything notable

Be specific. "Competitor X launched a new pricing tier that undercuts your mid-tier by 30%" is useful.
"Competitors are active" is not.

Only store insights that would change a decision. Don't create noise.`,
  toolCategories: ['platform', 'integration'],
  maxToolCalls: 20,
  model: 'claude-sonnet-4-20250514',
  requiresApproval: false, // intelligence only, no actions
};
```

```typescript
// apps/id/src/lib/agents/performance-analyst.ts

export const performanceAnalystAgent: AgentConfig = {
  key: 'performance_analyst',
  name: 'Performance Analyst',
  systemPrompt: `You are a performance analyst for a GTM team.
Your job is to analyze connected data sources and find patterns that matter.

You have access to all connected analytics, revenue, and app data.

On each run:
1. Check what data sources are connected
2. Query recent data (last 7 days vs previous 7 days)
3. Look for: significant changes, emerging trends, cross-source correlations
4. Check goal progress and forecast trajectory
5. Store insights for anything the user should know

Focus on the "so what." Don't report that sessions are up 5%. Report that
sessions from organic search are up 40% driven by three blog posts,
and this traffic converts at 2x the rate of paid — so double down on content.

Connect dots across sources. Revenue data + traffic data + outreach data
together tell a story that none of them tells alone.`,
  toolCategories: ['platform', 'integration', 'app'],
  maxToolCalls: 30,
  model: 'claude-sonnet-4-20250514',
  requiresApproval: false,
};
```

```typescript
// apps/id/src/lib/agents/strategy-advisor.ts

export const strategyAdvisorAgent: AgentConfig = {
  key: 'strategy_advisor',
  name: 'Strategy Advisor',
  systemPrompt: `You are a GTM strategy advisor.
Your job is to synthesize all available intelligence into strategic recommendations.

You run weekly. You have access to:
- All stored insights from other agents
- The user's goals and progress
- All connected data sources
- The user's Context Structure
- Web browsing for market research

On each run:
1. Read all insights generated since your last run
2. Read goal progress
3. Synthesize into a strategic assessment: what's working, what's not, what to do
4. Generate 2-3 specific, actionable recommendations
5. Each recommendation should reference specific data and suggest specific actions

This feeds the weekly strategy brief (Hero tier) and Marcus's strategic context.`,
  toolCategories: ['platform', 'integration', 'app'],
  maxToolCalls: 40,
  model: 'claude-sonnet-4-20250514',
  requiresApproval: false,
};
```

### Agent Executor

The runtime that runs any agent:

```typescript
// apps/id/src/lib/agents/executor.ts

/**
 * Executes an agent with its configured tools within safety boundaries.
 *
 * Handles:
 * - Tool resolution (which tools this agent can access for this account)
 * - Approval gating (consequential actions go through approval system)
 * - Cost tracking (token usage, tool call count)
 * - Error recovery (tool failures don't crash the agent)
 * - Logging (every tool call and result logged to Learning Ledger)
 * - Timeout (agents can't run forever)
 */
export async function executeAgent(
  config: AgentConfig,
  accountId: string,
  trigger: AgentTrigger,
): Promise<AgentResult> {
  const tools = await resolveAgentTools(config, accountId);
  const context = await buildAgentContext(config, accountId);

  let messages: Message[] = [
    { role: 'user', content: buildAgentKickoff(config, trigger, context) },
  ];

  let toolCallCount = 0;
  let continueLoop = true;

  while (continueLoop && toolCallCount < config.maxToolCalls) {
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: config.systemPrompt,
      messages,
      tools: tools.map(toClaudeToolDef),
    });

    // Process tool calls
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCallCount++;
        const tool = tools.find(t => t.name === block.name);
        if (!tool) continue;

        // Check if this tool call needs approval
        if (config.requiresApproval && tool.isConsequential) {
          await createApprovalRequest(accountId, config.key, block);
          // Agent pauses here — resumes when approved
          continue;
        }

        const result = await executeTool(tool, block.input, accountId);
        messages.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }] },
        );

        // Log to Learning Ledger
        await logAgentToolCall(accountId, config.key, block.name, block.input, result);
      }
    }

    // Check if agent is done (no more tool calls in response)
    continueLoop = response.stop_reason === 'tool_use';
  }

  return { toolCallCount, insights: await getNewInsights(accountId, config.key) };
}
```

### Agent Scheduling

Background agents run via Supabase Edge Functions triggered by pg_cron:

```typescript
// supabase/functions/run-agents/index.ts

/**
 * Edge Function that runs due background agents.
 * Called by pg_cron every 15 minutes.
 *
 * For each account with active connections:
 * 1. Check which agents are due (based on interval + last run)
 * 2. Run them in priority order
 * 3. Log results
 *
 * Cost guardrails:
 * - Max N agent runs per 15-minute window (across all accounts)
 * - Per-account daily budget based on billing tier
 * - Agents with no connected sources skip automatically
 */
```

| Agent | Interval | Tier | Model | Approx Cost/Run |
|-------|----------|------|-------|-----------------|
| Performance Analyst | 6 hours | Standard+ | Sonnet | ~$0.05-0.15 |
| Competitive Intel | Daily | Standard+ | Sonnet | ~$0.10-0.30 |
| Strategy Advisor | Weekly | Hero | Sonnet | ~$0.20-0.50 |
| SEO Monitor | Daily | Standard+ (with GSC) | Haiku | ~$0.02-0.05 |
| Content Gap Finder | Weekly | Standard+ (with DM + HV) | Sonnet | ~$0.10-0.20 |

---

## 3. The Approval Membrane

The approval system already exists and is solid (confidence-based, learning loop, quality gate). The 2026 addition: it becomes the primary safety layer for agent actions.

**Read-only actions don't need approval.** Querying GA4, browsing a competitor's website, reading context — agents do this freely.

**Consequential actions need approval.** Sending an email, publishing content, creating a campaign, changing a goal — these go through the approval system. The confidence score determines whether it's auto-approved or requires human review.

```typescript
// Tool-level annotation
interface AgentTool {
  name: string;
  description: string;
  parameters: object;
  execute: (params: unknown, ctx: ToolContext) => Promise<unknown>;
  /** If true, execution goes through approval system */
  isConsequential: boolean;
  /** Minimum confidence for auto-approval (0-1, null = always requires human) */
  autoApproveThreshold: number | null;
}
```

Over time, as the system earns trust (from the existing confidence + learning loop), more actions get auto-approved. Day one: everything consequential requires human approval. Day 90: the system has earned the right to auto-approve routine actions.

---

## 4. The Insight Store

Agents produce insights. The insight store is where they live until delivered.

```typescript
// Database: kinetiks_insights table

create table kinetiks_insights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references auth.users not null,
  agent_key text not null,                          -- which agent produced this
  type text not null check (type in ('anomaly', 'trend', 'correlation', 'opportunity', 'risk', 'recommendation')),
  severity text not null check (severity in ('info', 'notable', 'important', 'urgent')),
  summary text not null,                            -- natural language, ready to show user
  evidence jsonb not null default '{}',             -- structured data backing the insight
  suggested_action jsonb,                           -- optional: what to do about it
  delivered_via text[],                             -- ['chat', 'notification', 'brief', 'analytics']
  delivered_at timestamptz,
  expired_at timestamptz,                           -- insights have a shelf life
  created_at timestamptz default now()
);

create index idx_insights_account_undelivered
  on kinetiks_insights(account_id, created_at desc)
  where delivered_at is null;
```

Marcus reads undelivered insights and weaves them into conversation naturally:

> "Before we get into your question — I noticed something this morning. Your organic traffic from 'developer tools' keywords is up 47% this week, and those visitors convert at 3x your average. This is driven by the blog post Dark Madder published last Tuesday. Might be worth having Dark Madder write a follow-up series on that topic. Want me to draft a content brief?"

This isn't a hardcoded notification. Marcus saw the insight, read the evidence, connected it to the user's active apps, and suggested an action. That's 2026.

---

## 5. The Metric Cache (Not the Metric Store)

Agents query data sources directly via tools. But some queries are expensive or rate-limited. The metric cache stores recent query results so:

- Marcus doesn't re-query GA4 every conversation turn
- Background agents can reference recent data without burning API calls
- The analytics tab can display data without live-querying every source

```typescript
// apps/id/src/lib/data/metric-cache.ts

/**
 * Write-through cache for metric queries.
 * When an agent queries GA4, the result is cached.
 * Subsequent queries for the same data hit the cache.
 * Cache TTL varies by data type (realtime: 5min, daily: 1hr, historical: 24hr).
 *
 * This is NOT a metric store with predefined keys.
 * It caches arbitrary query results keyed by (source + query hash).
 */
interface MetricCache {
  /** Cache a query result */
  set(source: string, queryHash: string, result: unknown, ttlSeconds: number): Promise<void>;

  /** Get a cached result (null if expired or missing) */
  get(source: string, queryHash: string): Promise<unknown | null>;

  /** Get all cached data for a source (for the analytics tab) */
  getAll(source: string, accountId: string): Promise<CachedMetric[]>;

  /** Invalidate cache for a source (e.g., after a sync) */
  invalidate(source: string, accountId: string): Promise<void>;
}
```

The distinction from the 2023 approach: the cache stores whatever agents have queried, not a predefined set of metrics. If an agent asked an unusual question of GA4, that result is cached too. The cache is shaped by agent behavior, not by a hardcoded schema.

---

## 6. How Adding Things Works

### Adding a new data source (e.g., PostHog)

1. Write `apps/id/src/lib/tools/integrations/posthog.ts` — define the tools PostHog exposes
2. Write `apps/id/src/lib/integrations/providers/posthog.ts` — OAuth/API key setup, health check
3. Register: `registerIntegrationTools('posthog', posthogTools)`
4. Add to UI: connection card in settings

That's it. Agents automatically discover the new tools. Marcus can query PostHog. The performance analyst includes PostHog data in its analysis. No changes to Oracle, Marcus, or the analytics tab.

### Adding a new app (e.g., Litmus)

1. Write `apps/lt/` — the app itself
2. Write `apps/id/src/lib/tools/apps/litmus.ts` — tools Litmus exposes to the platform
3. Write `packages/synapse/src/presets/litmus.ts` — Synapse preset
4. Register: `registerAppTools('litmus', litmusTools)`

Marcus discovers Litmus's capabilities. The analytics tab shows Litmus metrics. The command router can dispatch to Litmus. No core changes.

### Adding a new intelligence capability (e.g., churn prediction)

1. Write `apps/id/src/lib/agents/churn-predictor.ts` — agent config with system prompt
2. Register in agent scheduler
3. The agent uses existing tools (Stripe data, engagement metrics) to produce insights
4. Insights flow through the standard insight store → Marcus → notifications

No new tools needed. No pipeline changes. Just a new agent with a new prompt.

### Industry changes (e.g., new social platform matters)

1. Add tools for the new platform
2. The competitive intel agent's existing prompt says "browse competitor presence" — it will naturally check the new platform once the tools exist
3. If needed, write a platform-specific agent

The architecture doesn't change. The tools expand. The agents adapt.

---

## Build Sequence

### Week 1-2: Tool Infrastructure

- [ ] Define `AgentTool` type in `packages/types/`
- [ ] Build the tool registry (`apps/id/src/lib/tools/registry.ts`)
- [ ] Build the agent executor (`apps/id/src/lib/agents/executor.ts`)
- [ ] Build the metric cache (`apps/id/src/lib/data/metric-cache.ts`)
- [ ] Build the insight store (migration + CRUD)
- [ ] Wire platform tools (browse_web, web_search, read_context, read_goals, store_insight, get_connected_sources)
- [ ] Test: an agent can run with platform tools, produce an insight, store it

### Week 2-3: First Integration (GA4)

- [ ] GA4 OAuth flow (exists, needs verification)
- [ ] GA4 tools (query_metrics, get_realtime, list_custom_dimensions)
- [ ] GA4 provider health check
- [ ] Test: Marcus can answer "how's my website traffic this week?" by querying GA4 live
- [ ] Test: Performance analyst agent runs, queries GA4, produces an insight

### Week 3-4: Stripe + GSC + Revised Marcus

- [ ] Stripe tools (get_mrr, get_customers, get_churn, get_subscriptions)
- [ ] GSC tools (get_search_queries, get_page_performance, get_indexing_status)
- [ ] Revise Marcus engine to use tool-calling flow
- [ ] Wire insight injection into Marcus's system prompt
- [ ] Test: Marcus conversation that queries multiple sources and synthesizes

### Week 4-5: Background Agents

- [ ] Performance analyst agent
- [ ] Competitive intelligence agent
- [ ] Agent scheduler (Edge Function + pg_cron)
- [ ] Cost tracking and budget guardrails
- [ ] Insight delivery to notifications
- [ ] Test: agents run on schedule, produce useful insights, Marcus references them

### Week 5-6: Analytics Tab + More Integrations

- [ ] Analytics tab reads from metric cache + insight store
- [ ] Goal progress visualization (agents track, tab displays)
- [ ] Google Ads tools
- [ ] Meta Ads tools
- [ ] HubSpot tools
- [ ] Social platform tools (LinkedIn, X)

### Week 6-7: App Protocol

- [ ] Harvest tools (from existing API routes)
- [ ] Dark Madder tools (after migration)
- [ ] Command dispatch via Marcus tool calls
- [ ] Approval integration for consequential actions
- [ ] Test: Marcus orchestrates a multi-app workflow ("write a blog post about X and then create an outreach sequence targeting companies interested in X")

### Week 7-8: Strategy Layer + Polish

- [ ] Strategy advisor agent (weekly)
- [ ] Daily brief generation (agent-powered, not template)
- [ ] Desktop app notifications wired to insights
- [ ] Billing integration (Stripe for Kinetiks subscriptions)
- [ ] Agent cost per tier (Free: no agents, Standard: core agents, Hero: all agents + strategy)

---

## Cost Model

Agent-native means LLM costs scale with usage. Per-account estimates:

| Tier | Agent Budget | Approx Monthly Cost |
|------|-------------|-------------------|
| Free | Marcus only (no background agents) | ~$0.50/active user |
| Standard | Marcus + Performance Analyst + Competitive Intel + SEO Monitor | ~$5-8/active user |
| Hero | All agents + Strategy Advisor + priority execution | ~$12-20/active user |

At Standard pricing of $X/mo, target 70%+ gross margin. Agent costs are the primary variable cost — model choice (Sonnet vs Haiku) and execution frequency are the levers.

---

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Agents query sources directly via tools, not predefined extractors | Agents reason about what data matters. A hardcoded metric list can't anticipate every question. |
| 2 | Metric cache, not metric store | Cache what agents have queried. Don't pre-define what should exist. |
| 3 | Insights are the primary output, not metrics | Users care about "what should I do" not "here are 47 data points." |
| 4 | Marcus has full tool access | Marcus is a strategist, not a chatbot reading pre-assembled context. |
| 5 | Background agents are just prompts + tools | Adding intelligence = writing a system prompt. No pipeline code. |
| 6 | Approval system gates actions, not analysis | Agents can look at anything. They need permission to do things. |
| 7 | Sonnet for analysis, Haiku for monitoring | Quality where it matters (analysis, strategy). Cost efficiency for routine checks. |
| 8 | Tools are the universal interface | Integrations, apps, and platform capabilities are all tools. One pattern. |
