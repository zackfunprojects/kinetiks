# Phase 5: Oracle + Analytics Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Oracle — the fourth Cortex Operator — and the Analytics tab. Metric aggregation, goal tracking with forecasting, pattern detection, insight generation, cross-app correlation, attribution modeling, budget intelligence, and the Analytics tab UI.

**Architecture:** The Oracle is a collection of CRON-scheduled Edge Functions and on-demand API endpoints. It pulls metrics from Synapses and external integrations, stores time-series data, calculates goal progress, detects anomalies and trends, generates insights via Claude, and pushes findings to Marcus. The Analytics tab is the Oracle's visual surface.

**Tech Stack:** Next.js 14, TypeScript, Supabase (Edge Functions + CRON), Anthropic Claude API (Sonnet for insight generation, Haiku for pattern classification), Recharts or D3 for visualization

**Spec Reference:** `docs/specs/analytics-goals-engine-spec.md` — read ENTIRE spec. This is 1,097 lines. Read it all.

---

## File Structure

```
apps/id/src/lib/oracle/
  metric-schema.ts              # Unified metric definitions (all 50+ metrics)
  aggregator.ts                 # Pull and normalize metrics from Synapses + external APIs
  goal-tracker.ts               # Goal progress calculation, pace, status, forecasting
  forecast.ts                   # Time-series forecasting model (weighted: recent trend + historical + pipeline)
  pattern-detector.ts           # Anomaly detection (z-score), trend detection (regression), change points
  correlation-engine.ts         # Cross-app correlation discovery
  insight-generator.ts          # Claude-powered insight generation, evaluation, prioritization
  alert-engine.ts               # Alert creation and routing to Marcus
  attribution.ts                # Multi-touch attribution modeling
  budget-tracker.ts             # Budget spend tracking and pacing
  budget-proposer.ts            # Budget proposal generation for next cycle
  what-if.ts                    # Scenario modeling engine

apps/id/src/app/api/oracle/
  metrics/route.ts              # POST — Synapse reports metrics here
  goals/route.ts                # GET — goal progress data for Analytics tab
  insights/route.ts             # GET — active insights
  alerts/route.ts               # GET/POST — alert management
  budget/route.ts               # GET — budget pacing and tracking
  what-if/route.ts              # POST — scenario modeling queries

apps/id/src/components/analytics/
  AnalyticsDashboard.tsx         # Main analytics view (replaces placeholder)
  GoalOverview.tsx               # Section 1: all goals with progress
  GoalProgressCard.tsx           # Individual goal with bar, status, pace, forecast, lever
  InsightSection.tsx             # Section 2: active Oracle insights
  InsightCard.tsx                # Individual insight card with "Act on this" action
  FunnelView.tsx                 # Section 3: GTM funnel across all apps
  AppPerformance.tsx             # Section 4: per-app KPI cards
  TrendCharts.tsx                # Section 5: time-series with controls
  AttributionView.tsx            # Section 6: channel and content attribution
  BudgetSection.tsx              # Section 7: budget pacing and ROI
  DateRangePicker.tsx            # Shared time range selector

supabase/functions/
  oracle-metrics/index.ts        # CRON: pull metrics from Synapses (15min)
  oracle-goals/index.ts          # CRON: recalculate goal progress (hourly)
  oracle-insights/index.ts       # CRON: deep analysis and insight generation (6 hours)
  oracle-alerts/index.ts         # CRON: lightweight anomaly scan (15min)
  oracle-attribution/index.ts    # CRON: recalculate attribution (daily)
  oracle-budget/index.ts         # CRON: budget proposal generation (3 days before cycle)
```

---

## Database Migration

```sql
-- Analytics metrics (time-series)
CREATE TABLE kinetiks_analytics_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric NOT NULL,
  metric_period text NOT NULL,
  period_start timestamptz NOT NULL,
  dimensions jsonb DEFAULT '{}',
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX idx_metrics_account_key ON kinetiks_analytics_metrics(account_id, metric_key, period_start);

-- Oracle insights
CREATE TABLE kinetiks_oracle_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  insight_type text NOT NULL,
  severity text DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL,
  supporting_data jsonb NOT NULL,
  recommendation text,
  source_apps text[] DEFAULT '{}',
  related_goals uuid[],
  confidence numeric(5,2),
  delivered boolean DEFAULT false,
  delivered_at timestamptz,
  dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Attribution touchpoints
CREATE TABLE kinetiks_attribution_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  contact_id text,
  deal_id text,
  source_app text NOT NULL,
  action_type text NOT NULL,
  detail text,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS on all tables
```

---

## Tasks

### Task 1: Unified Metric Schema
- [ ] Create `lib/oracle/metric-schema.ts` with all MetricDefinition entries (Harvest, Dark Madder, Litmus, Hypothesis, GA4, GSC, Stripe — full tables from spec)
- [ ] Create metric type definitions: MetricCategory, FunnelStage, MetricUnit, MetricDataPoint
- [ ] Create `api/oracle/metrics/route.ts` — ingestion endpoint that validates against schema and stores in DB
- [ ] Run database migration
- [ ] Commit: `feat(oracle): define unified metric schema and ingestion endpoint`

### Task 2: Goal Tracking Engine
- [ ] Create `lib/oracle/goal-tracker.ts` — `calculateGoalProgress(goal, metrics)` returns GoalProgress with pace, status, completion percentage
- [ ] Create `lib/oracle/forecast.ts` — weighted forecasting model (50% recent trend, 30% historical, 20% pipeline). Returns projected value with confidence interval.
- [ ] Create `api/oracle/goals/route.ts` — returns goal progress for all active goals
- [ ] Create `supabase/functions/oracle-goals/index.ts` — CRON (hourly) that recalculates all active goals and stores snapshots
- [ ] Write tests for: on_track/behind/ahead/at_risk/critical classification, forecast with sparse data, forecast with sufficient data
- [ ] Commit: `feat(oracle): add goal tracking with forecasting`

### Task 3: Pattern Detection
- [ ] Create `lib/oracle/pattern-detector.ts`:
  - `detectAnomalies(metricHistory)` — z-score against 30-day adaptive baseline, returns anomalies with severity
  - `detectTrends(metricHistory)` — linear regression on 14-day window, returns trend direction and slope
  - `detectChangePoints(metricHistory)` — identify step changes in metric behavior
- [ ] Multi-factor assessment before generating alerts: statistical significance × business significance × duration × actionability
- [ ] Create `lib/oracle/alert-engine.ts` — creates alerts, routes to Marcus, deduplicates
- [ ] Create `supabase/functions/oracle-alerts/index.ts` — CRON (15min) lightweight scan on critical metrics
- [ ] Write tests for: anomaly with normal data (no alert), anomaly with spike (alert), sustained trend, noise filtering
- [ ] Commit: `feat(oracle): add pattern detection with anomaly and trend analysis`

### Task 4: Insight Generation
- [ ] Create `lib/oracle/insight-generator.ts`:
  - Evaluates potential insights using Claude Sonnet: is this significant? Is it actionable? What should the user do?
  - Prioritizes by: urgency, confidence, goal relevance
  - Deduplicates against recent insights
  - Classifies insight type: anomaly, trend, correlation, goal_risk, opportunity, recommendation, milestone
- [ ] Create `lib/oracle/correlation-engine.ts` — maintains correlation matrix between metrics, flags significant correlations (r > 0.5, p < 0.05), Claude evaluates causal plausibility
- [ ] Create `supabase/functions/oracle-insights/index.ts` — CRON (6 hours) deep analysis pass
- [ ] Create `api/oracle/insights/route.ts` — GET active insights for Analytics tab
- [ ] Wire insight delivery to Marcus (push to Marcus for Chat/Slack/email delivery)
- [ ] Commit: `feat(oracle): add insight generation with cross-app correlation`

### Task 5: Oracle → Marcus Integration
- [ ] Build data request interface: Marcus sends structured query, Oracle returns data + interpretation
- [ ] Build proactive push: Oracle sends insights with delivery priority (immediate/next_brief/weekly_digest)
- [ ] Build daily brief analytics section: goal summary, overnight anomalies, top insight, one recommendation
- [ ] Wire Chat analytics queries: "How's our pipeline?" routes through Oracle for data-grounded answer
- [ ] Commit: `feat(oracle): wire Oracle to Marcus for data queries and proactive delivery`

### Task 6: Oracle → Cortex Feedback
- [ ] Build analytics-to-Proposal pipeline: when Oracle discovers something that should update the business identity, generate a Proposal
- [ ] Example triggers: ICP refinement from outreach data, messaging pattern performance, competitive shifts from deal loss reasons
- [ ] Wire through standard Cortex Proposal evaluation
- [ ] Commit: `feat(oracle): add Cortex feedback loop via Proposals`

### Task 7: Attribution
- [ ] Create `lib/oracle/attribution.ts` — position-based model (40/20/40), touchpoint tracking, channel/content/campaign attribution calculation
- [ ] Create `supabase/functions/oracle-attribution/index.ts` — CRON (daily) recalculation
- [ ] Commit: `feat(oracle): add multi-touch attribution modeling`

### Task 8: Budget Intelligence
- [ ] Create `lib/oracle/budget-tracker.ts` — track spend vs allocation, calculate pacing, ROI by category
- [ ] Create `lib/oracle/budget-proposer.ts` — generate next-cycle budget recommendations based on performance data
- [ ] Create `supabase/functions/oracle-budget/index.ts` — CRON (3 days before cycle end) generates budget proposal → creates strategic approval
- [ ] Create `api/oracle/budget/route.ts` — GET budget pacing data
- [ ] Commit: `feat(oracle): add budget tracking and proposal generation`

### Task 9: What-If Modeling
- [ ] Create `lib/oracle/what-if.ts` — scenario engine that models impact of variable changes
- [ ] Create `api/oracle/what-if/route.ts` — POST with scenario parameters, returns projections
- [ ] Wire Chat interface: "What if we doubled outbound?" routes through Oracle
- [ ] Commit: `feat(oracle): add what-if scenario modeling`

### Task 10: Analytics Tab UI
- [ ] Build `AnalyticsDashboard.tsx` — main view composing all sections
- [ ] Build `GoalOverview.tsx` + `GoalProgressCard.tsx` — goals with progress bars, sparklines, forecasts, top levers
- [ ] Build `InsightSection.tsx` + `InsightCard.tsx` — insight cards with "Act on this" (→ Chat), dismiss action
- [ ] Build `FunnelView.tsx` — full GTM funnel visualization with conversion rates between stages
- [ ] Build `AppPerformance.tsx` — per-app KPI cards with trend arrows
- [ ] Build `TrendCharts.tsx` — time-series with metric selection, date range, period comparison
- [ ] Build `AttributionView.tsx` — channel and content attribution charts
- [ ] Build `BudgetSection.tsx` — pacing chart, ROI by category, efficiency metrics
- [ ] Build `DateRangePicker.tsx` — shared component for time controls
- [ ] Wire all "Act on this" and "Ask about this" buttons to open Chat with pre-filled queries
- [ ] Replace Phase 1 analytics placeholder
- [ ] Commit: `feat(analytics): build full Analytics tab dashboard`

### Task 11: First App Integration (Harvest Metrics)
- [ ] Register Harvest metrics in the unified schema
- [ ] Implement metric reporting in Harvest's Synapse (push to Oracle endpoint on schedule)
- [ ] End-to-end: Harvest reports → Oracle stores → goal updates → insight generates → Marcus delivers → Analytics tab displays
- [ ] Commit: `feat(oracle): integrate Harvest metrics end-to-end`

### Task 12: End-to-End Verification
- [ ] Metrics ingest correctly from API endpoint
- [ ] Goal progress calculates with correct pace and status
- [ ] Forecast generates reasonable projections
- [ ] Anomaly detection flags significant deviations, ignores noise
- [ ] Insights generate with actionable recommendations
- [ ] Oracle pushes insights to Marcus, Marcus delivers in Chat
- [ ] Analytics tab renders all sections with real data
- [ ] Budget pacing tracks and displays correctly
- [ ] What-if modeling returns plausible projections
- [ ] "Act on this" buttons open Chat with correct pre-filled queries
- [ ] `pnpm build` passes
- [ ] Commit: `chore: phase 5 complete — Oracle and Analytics verified`
