# Analytics & Goals Engine Spec

> **This is the specification for the Kinetiks analytics and goals system — the Oracle's domain.**
> The Oracle is the fourth Cortex Operator. It turns raw metrics from every app and integration into strategic intelligence. It powers the Analytics tab, feeds Marcus with data-grounded answers, tracks goal progress, detects patterns humans would miss, and feeds learnings back into Cortex.
> This is not a dashboard. This is an intelligence system that happens to have a visual surface.
> Read `docs/kinetiks-product-spec-v3.md` Sections 7, 8.3, and 10.7 for product context.

---

## 1. Philosophy

Most analytics products show you what happened and leave you to figure out what it means. Kinetiks doesn't do that. The Oracle's job is to close the gap between data and decision.

**Insight-forward, not data-forward.** The primary unit of the Analytics tab is not a chart — it's an insight. "Reply rates dropped 23% this week because the new messaging angle underperforms with VP Engineering personas" is more valuable than a line chart with a downward slope. Charts exist to support insights, not the other way around.

**Goal-oriented, not metric-oriented.** The user defined goals in Cortex. The Analytics tab is organized around those goals, not around raw metrics. The question isn't "what are my reply rates" — it's "am I on track to hit 50 qualified leads this month, and if not, what's the biggest lever?"

**Cross-app by default.** No app silos. Content performance is shown alongside outreach performance is shown alongside pipeline velocity. The Oracle finds the connections: "Blog posts about security generate 3x more qualified pipeline than posts about cost savings" requires correlating Dark Madder content topics with Harvest deal outcomes. No single app can see this.

**Proactive, not reactive.** The Oracle doesn't wait for the user to open the Analytics tab. It pushes significant findings to Marcus for delivery in Chat, Slack, and the daily brief. The Analytics tab is for deep exploration. The proactive layer ensures nothing important gets missed even if the user doesn't look at the dashboard for a week.

**Predictive, not just retrospective.** The Oracle doesn't just report what happened — it projects what will happen. Goal tracking includes a forecast: "At current trajectory, you'll hit 38 of your 50 lead target. To close the gap, here are the three highest-leverage adjustments."

---

## 2. The Goal System

### 2.1 Goal Types

**KPI Targets** — Specific, measurable targets with a number and a timeframe.

```typescript
interface KPITarget {
  id: string;
  account_id: string;
  name: string;                      // "Generate 50 qualified leads per month"
  type: 'kpi_target';
  metric_key: string;                // References a metric in the unified schema
  target_value: number;              // 50
  target_period: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  direction: 'above' | 'below' | 'exact';  // Are we trying to be above, below, or at this number?
  current_value: number;             // Auto-populated by Oracle
  current_period_start: string;      // ISO timestamp for current measurement period
  contributing_apps: string[];       // Which apps contribute to this metric
  contributing_metrics: MetricMapping[];  // How app-level metrics map to this goal
  status: 'active' | 'paused' | 'completed' | 'archived';
  progress_status: 'on_track' | 'behind' | 'ahead' | 'at_risk' | 'critical';
  created_at: string;
  updated_at: string;
}
```

**Examples:**
- Generate 50 qualified leads per month (direction: above)
- Publish 8 blog posts per month (direction: above)
- Keep customer acquisition cost below $200 (direction: below)
- Achieve 15% email reply rate (direction: above)
- Land 3 tier-1 media placements per quarter (direction: above)

**OKRs** — Strategic objectives with measurable key results. Each key result is itself a KPI Target, linked to the parent objective.

```typescript
interface OKR {
  id: string;
  account_id: string;
  name: string;                      // "Establish thought leadership in AI security"
  type: 'okr';
  timeframe: 'quarterly' | 'annual';
  period_start: string;
  period_end: string;
  key_results: string[];             // IDs of linked KPITarget goals
  overall_progress: number;          // 0-100, calculated from key results
  status: 'active' | 'paused' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}
```

**Example OKR:**
- Objective: "Establish thought leadership in AI security"
  - KR1: Publish 8 deep-dive articles on AI security topics (→ KPI Target)
  - KR2: Land 2 media placements in tier-1 cybersecurity outlets (→ KPI Target)
  - KR3: Grow organic traffic to security content by 40% (→ KPI Target)
  - KR4: Generate 20 inbound leads from security content (→ KPI Target)

### 2.2 Goal-to-Metric Mapping

Each goal maps to one or more metrics from the unified metric schema. The mapping defines how raw app metrics roll up into goal progress.

```typescript
interface MetricMapping {
  goal_id: string;
  metric_key: string;               // 'harvest.qualified_leads', 'dark_madder.posts_published'
  source_app: string;
  aggregation: 'sum' | 'average' | 'max' | 'min' | 'latest' | 'count';
  filter: Record<string, any>;      // Optional filter (e.g., only count 'qualified' leads, not all leads)
  weight: number;                   // For goals with multiple contributing metrics (0-1, sum to 1)
}
```

**Complex goal mapping example:**

"Generate 50 qualified leads per month" might map to:
- `harvest.prospects_converted` (weight: 0.6) — prospects that became meetings
- `hypothesis.form_submissions` (weight: 0.3) — landing page conversions marked as qualified
- `dark_madder.content_leads` (weight: 0.1) — inbound leads from content CTAs

The Oracle aggregates across these sources to produce the goal's current_value.

### 2.3 Goal Suggestions

When the user first sets up goals, or when the system has enough data to make recommendations, the Oracle suggests goals based on:

- **Industry benchmarks:** "SaaS companies at your stage typically target X leads/month"
- **Historical performance:** "Based on your last 60 days, a reasonable target would be..."
- **Capacity:** "With 3 active outreach sequences and your current reply rate, you could realistically generate..."
- **Gap analysis:** "You don't have a goal for content output. Companies with active content engines typically set..."

Suggestions are delivered through Marcus in Chat and are actionable: "Want me to create this as a goal?"

### 2.4 Goal Progress Calculation

The Oracle calculates goal progress on every metric update:

```typescript
interface GoalProgress {
  goal_id: string;
  current_value: number;
  target_value: number;
  completion_percentage: number;     // current / target * 100
  period_elapsed_percentage: number; // How far through the period are we?
  pace: number;                      // completion_percentage / period_elapsed_percentage
  // pace > 1 = ahead, pace < 1 = behind, pace === 1 = exactly on track
  forecast: GoalForecast;
  status: 'on_track' | 'behind' | 'ahead' | 'at_risk' | 'critical';
  status_reason: string;             // Human-readable explanation
}

interface GoalForecast {
  projected_value: number;           // Where we'll land if current trajectory holds
  confidence_interval: {
    low: number;                     // Conservative projection (25th percentile)
    mid: number;                     // Expected projection (50th percentile)
    high: number;                    // Optimistic projection (75th percentile)
  };
  projected_completion_date: string | null;  // When the target will be hit (null if won't hit)
  gap: number;                       // Distance between projection and target
  top_lever: string;                 // Single most impactful action to close the gap
  lever_impact_estimate: number;     // Estimated impact of taking that action
}
```

**Status thresholds:**
- `ahead`: pace > 1.15
- `on_track`: pace between 0.85 and 1.15
- `behind`: pace between 0.60 and 0.85
- `at_risk`: pace between 0.40 and 0.60
- `critical`: pace < 0.40

**Forecasting model:**

The Oracle uses a weighted time-series model:

1. **Recent trend (50% weight):** Linear regression on the last 14 days of data. This captures momentum — are things accelerating or decelerating?

2. **Historical pattern (30% weight):** Same-period performance from prior cycles (last month, last quarter). This captures seasonality and cyclical patterns.

3. **Action pipeline (20% weight):** Scheduled but not-yet-executed actions that will contribute to the goal. A sequence launching next week that targets 200 prospects has a projected impact on lead generation.

The confidence interval is calculated from the variance in historical data. High-variance metrics (social engagement) get wider intervals. Low-variance metrics (email send volume) get tighter ones.

---

## 3. The Unified Metric Schema

### 3.1 Why a Unified Schema

Every app reports metrics differently. Harvest talks about "reply rates" and "prospects." Dark Madder talks about "page views" and "engagement." The Oracle needs a common language to aggregate, compare, and correlate across apps.

The unified metric schema is the canonical vocabulary for all GTM metrics in the system.

### 3.2 Schema Structure

```typescript
interface MetricDefinition {
  key: string;                       // Globally unique: '{source}.{metric_name}'
  source: string;                    // 'harvest', 'dark_madder', 'oracle', 'ga4', 'stripe', etc.
  name: string;                      // Human-readable name
  description: string;
  category: MetricCategory;
  unit: MetricUnit;
  aggregation_default: 'sum' | 'average' | 'latest' | 'count';
  direction: 'higher_is_better' | 'lower_is_better' | 'neutral';
  cadence: 'realtime' | 'hourly' | 'daily' | 'weekly';
  funnel_stage: FunnelStage | null;  // Where this metric sits in the GTM funnel
}

type MetricCategory =
  | 'awareness'       // Traffic, impressions, reach
  | 'engagement'      // Opens, clicks, time on page, social interaction
  | 'conversion'      // Form fills, signups, demo requests
  | 'pipeline'        // Deals, pipeline value, velocity
  | 'revenue'         // Closed deals, MRR, LTV
  | 'efficiency'      // CAC, conversion rates, cost per X
  | 'content'         // Publishing cadence, content quality scores
  | 'outreach'        // Emails sent, sequences active, cadence metrics
  | 'brand'           // Media mentions, share of voice, sentiment
  | 'retention';      // Churn, expansion, NPS

type FunnelStage =
  | 'top'             // Awareness: traffic, impressions
  | 'middle'          // Engagement/Conversion: leads, signups
  | 'bottom'          // Pipeline/Revenue: deals, closed revenue
  | 'post';           // Retention: churn, expansion

type MetricUnit =
  | 'count'           // Absolute number (emails sent, posts published)
  | 'rate'            // Percentage (reply rate, conversion rate)
  | 'currency'        // Dollar amount (revenue, pipeline value)
  | 'duration'        // Time (days to close, time on page)
  | 'score';          // Composite score (engagement score, quality score)
```

### 3.3 Core Metrics by Source

**Harvest (outreach):**
| Metric Key | Name | Category | Unit | Funnel | Cadence |
|-----------|------|----------|------|--------|---------|
| harvest.emails_sent | Emails Sent | outreach | count | top | daily |
| harvest.emails_opened | Emails Opened | outreach | count | top | daily |
| harvest.open_rate | Open Rate | efficiency | rate | top | daily |
| harvest.replies_received | Replies Received | outreach | count | middle | daily |
| harvest.reply_rate | Reply Rate | efficiency | rate | middle | daily |
| harvest.positive_replies | Positive Replies | outreach | count | middle | daily |
| harvest.meetings_booked | Meetings Booked | conversion | count | middle | daily |
| harvest.meeting_rate | Meeting Rate | efficiency | rate | middle | daily |
| harvest.prospects_contacted | Prospects Contacted | outreach | count | top | daily |
| harvest.prospects_enriched | Prospects Enriched | outreach | count | top | daily |
| harvest.sequences_active | Active Sequences | outreach | count | top | hourly |
| harvest.pipeline_deals | Pipeline Deals | pipeline | count | bottom | daily |
| harvest.pipeline_value | Pipeline Value | pipeline | currency | bottom | daily |
| harvest.deals_won | Deals Won | revenue | count | bottom | daily |
| harvest.revenue_closed | Revenue Closed | revenue | currency | bottom | daily |
| harvest.avg_deal_cycle | Avg Deal Cycle | efficiency | duration | bottom | weekly |

**Dark Madder (content):**
| Metric Key | Name | Category | Unit | Funnel | Cadence |
|-----------|------|----------|------|--------|---------|
| dark_madder.posts_published | Posts Published | content | count | top | daily |
| dark_madder.total_traffic | Content Traffic | awareness | count | top | daily |
| dark_madder.organic_traffic | Organic Traffic | awareness | count | top | daily |
| dark_madder.avg_time_on_page | Avg Time on Page | engagement | duration | top | daily |
| dark_madder.social_shares | Social Shares | engagement | count | top | daily |
| dark_madder.content_leads | Content-Attributed Leads | conversion | count | middle | daily |
| dark_madder.top_topics | Top Performing Topics | content | score | top | weekly |
| dark_madder.seo_keywords_ranking | Keywords Ranking | awareness | count | top | weekly |
| dark_madder.content_pipeline_attribution | Content → Pipeline | pipeline | currency | bottom | weekly |

**Litmus (PR):**
| Metric Key | Name | Category | Unit | Funnel | Cadence |
|-----------|------|----------|------|--------|---------|
| litmus.pitches_sent | Pitches Sent | outreach | count | top | daily |
| litmus.pitch_response_rate | Pitch Response Rate | efficiency | rate | top | daily |
| litmus.media_placements | Media Placements | brand | count | top | weekly |
| litmus.share_of_voice | Share of Voice | brand | score | top | weekly |
| litmus.media_reach | Total Media Reach | awareness | count | top | weekly |
| litmus.sentiment_score | Media Sentiment | brand | score | top | weekly |
| litmus.backlinks_earned | Backlinks Earned | awareness | count | top | weekly |

**Hypothesis (landing pages):**
| Metric Key | Name | Category | Unit | Funnel | Cadence |
|-----------|------|----------|------|--------|---------|
| hypothesis.page_visits | Page Visits | awareness | count | top | daily |
| hypothesis.conversion_rate | Conversion Rate | efficiency | rate | middle | daily |
| hypothesis.form_submissions | Form Submissions | conversion | count | middle | daily |
| hypothesis.ab_test_active | Active A/B Tests | content | count | top | hourly |
| hypothesis.ab_test_winners | Test Winners Found | content | count | top | weekly |

**External sources (GA4, GSC, Stripe, etc.):**
| Metric Key | Name | Category | Unit | Funnel | Cadence |
|-----------|------|----------|------|--------|---------|
| ga4.total_sessions | Total Sessions | awareness | count | top | daily |
| ga4.new_users | New Users | awareness | count | top | daily |
| ga4.bounce_rate | Bounce Rate | engagement | rate | top | daily |
| ga4.goal_completions | Goal Completions | conversion | count | middle | daily |
| gsc.total_impressions | Search Impressions | awareness | count | top | daily |
| gsc.total_clicks | Search Clicks | awareness | count | top | daily |
| gsc.avg_position | Average Position | awareness | score | top | weekly |
| stripe.mrr | Monthly Recurring Revenue | revenue | currency | bottom | daily |
| stripe.new_customers | New Customers | revenue | count | bottom | daily |
| stripe.churn_rate | Churn Rate | retention | rate | post | monthly |
| stripe.ltv | Customer Lifetime Value | revenue | currency | post | monthly |

### 3.4 Metric Ingestion

Apps and integrations report metrics to the Oracle through two mechanisms:

**Push (Synapse metric reports):** Each app's Synapse pushes metrics at defined intervals. The Synapse calls `POST /api/oracle/metrics` with a batch of metric data points.

```typescript
interface MetricReport {
  source_app: string;
  metrics: MetricDataPoint[];
  reported_at: string;
}

interface MetricDataPoint {
  metric_key: string;
  value: number;
  period: 'daily' | 'weekly' | 'monthly';
  period_start: string;            // ISO timestamp
  dimensions: Record<string, string>; // Optional breakdowns (by segment, campaign, topic, etc.)
}
```

**Pull (Oracle CRON):** For external integrations (GA4, GSC, Stripe), the Oracle pulls data on schedule via the connection APIs. The Oracle CRON function reads from each connection and normalizes the data into the unified schema.

### 3.5 Dimensional Analysis

Metrics aren't just top-level numbers. They carry dimensions that allow drill-down:

```typescript
interface MetricDimensions {
  segment?: string;          // "fintech_cfos", "enterprise_vp_engineering"
  campaign?: string;         // "q1_outbound_security", "ai_security_content_push"
  channel?: string;          // "email", "linkedin", "organic_search", "paid_search"
  content_topic?: string;    // "ai_security", "cost_optimization", "compliance"
  persona?: string;          // "ciso", "vp_engineering", "cfo"
  geography?: string;        // "us_east", "emea", "apac"
  time_cohort?: string;      // "week_1", "month_1" (for cohort analysis)
}
```

Dimensions allow the Oracle to answer questions like:
- "Which segment has the highest reply rate?" (dimension: segment)
- "Which content topic drives the most pipeline?" (dimension: content_topic)
- "How do Q1 leads compare to Q2 leads in conversion?" (dimension: time_cohort)

---

## 4. Oracle Intelligence

### 4.1 Pattern Detection

The Oracle continuously scans incoming metrics for patterns that warrant attention.

**Anomaly detection:**

The Oracle maintains a baseline for each metric using an adaptive window (last 30 days of data). When a new data point deviates significantly from the baseline, it's flagged as an anomaly.

```typescript
interface AnomalyDetection {
  metric_key: string;
  current_value: number;
  baseline_mean: number;
  baseline_std_dev: number;
  z_score: number;                  // How many standard deviations from the mean
  direction: 'above' | 'below';
  severity: 'minor' | 'significant' | 'major';
  // minor: |z| > 1.5, significant: |z| > 2.0, major: |z| > 3.0
}
```

**Not every fluctuation is an alert.** The Oracle uses a multi-factor assessment before generating an alert:

1. **Statistical significance:** Is the deviation outside normal variance? (z-score threshold)
2. **Business significance:** Does this metric matter for an active goal? (higher priority if yes)
3. **Duration:** Is this a single data point or a sustained trend? (sustained trends are more significant)
4. **Context:** Is there an obvious explanation? (e.g., a holiday, a campaign launch, a known system issue)
5. **Actionability:** Can the user or system do something about this? (non-actionable anomalies are deprioritized)

**Trend detection:**

Beyond point anomalies, the Oracle detects sustained trends:

```typescript
interface TrendDetection {
  metric_key: string;
  direction: 'improving' | 'declining' | 'stable' | 'volatile';
  slope: number;                    // Rate of change per period
  duration_periods: number;         // How many periods this trend has been active
  confidence: number;               // 0-100, statistical confidence in the trend
  projected_value_30d: number;      // Where this metric is heading
  related_changes: string[];        // Other metrics that changed around the same time
}
```

**Change point detection:**

The Oracle identifies moments when a metric's behavior fundamentally changed — not gradual trends, but step changes:

- Reply rate was ~15% for 3 months, then dropped to ~10%
- Content traffic was growing 5%/week, then jumped to 15%/week

Change points are valuable because they often coincide with a specific action (new messaging, new segment, algorithm change) that the Oracle can identify.

### 4.2 Cross-App Correlation

This is where the Oracle produces intelligence no individual app can see.

**The Oracle looks for correlations between metrics across different apps:**

- Content topic performance (Dark Madder) ↔ Outreach reply rates by topic (Harvest)
- Blog traffic spikes (Dark Madder) ↔ Inbound lead volume (Harvest/Hypothesis)
- PR placement timing (Litmus) ↔ Website traffic (GA4)
- Messaging angle used in outreach (Harvest) ↔ Deal close rates (Harvest pipeline)
- Content publishing cadence (Dark Madder) ↔ Organic search growth (GSC)

**Correlation discovery process:**

1. The Oracle maintains a correlation matrix between all metrics with sufficient data history (>30 data points)
2. Correlations above a significance threshold (r > 0.5, p < 0.05) are flagged
3. Claude Sonnet evaluates flagged correlations for causal plausibility: "Is there a reasonable mechanism connecting these two metrics?"
4. Plausible correlations become insights delivered through Marcus

**Example insight from correlation:**
"I've noticed a strong pattern: when you publish content about compliance topics, your outbound reply rates to healthcare prospects increase by ~40% in the following week. The healthcare audience seems to engage more when they've recently seen your thought leadership. Consider timing your healthcare outreach sequences to follow compliance content publication."

### 4.3 Insight Generation

Insights are the Oracle's primary output. Not charts, not numbers — intelligence.

```typescript
interface OracleInsight {
  id: string;
  account_id: string;
  type: InsightType;
  severity: 'info' | 'warning' | 'urgent';
  title: string;                    // "Security messaging outperforms cost savings 3:1"
  body: string;                     // Full explanation with evidence
  supporting_data: SupportingData;
  recommendation: string;           // Specific, actionable recommendation
  affected_goals: string[];         // Which goals this is relevant to
  affected_apps: string[];          // Which apps are involved
  confidence: number;               // 0-100, how confident the Oracle is in this insight
  delivered: boolean;
  delivered_at: string | null;
  created_at: string;
}

type InsightType =
  | 'anomaly'            // Something unusual happened
  | 'trend'              // A sustained pattern is forming
  | 'correlation'        // A cross-app connection was discovered
  | 'goal_risk'          // A goal is at risk and here's why
  | 'opportunity'        // An untapped opportunity was identified
  | 'recommendation'     // A specific action the system recommends
  | 'milestone'          // A goal was hit or a record was set
  | 'efficiency'         // A process could be improved
  | 'attribution';       // Content/channel attribution insight

interface SupportingData {
  metrics: { key: string; values: number[]; timeframe: string }[];
  charts: ChartSpec[];              // Renderable chart specifications
  comparisons: ComparisonData[];    // Before/after, segment vs segment, etc.
  evidence_summary: string;         // Concise summary of the data evidence
}
```

**Insight generation process:**

1. **Detection:** Anomaly detection, trend detection, correlation discovery, and goal tracking all feed potential insights into a queue.

2. **Evaluation:** Claude Sonnet evaluates each potential insight for:
   - Is this genuinely significant or is it noise?
   - Is this actionable? What should the user do?
   - Has a similar insight been delivered recently? (dedup)
   - How confident are we in this finding?

3. **Prioritization:** Insights are ranked by: urgency (declining goal > interesting pattern), confidence, goal relevance, and recency.

4. **Delivery:** Top insights are delivered through Marcus. The Oracle pushes insights to Marcus with a delivery priority:
   - `urgent`: deliver immediately (interrupts current conversation if necessary)
   - `warning`: include in next daily brief or deliver when user opens the app
   - `info`: queue for weekly digest or display in Analytics tab

### 4.4 Causal Reasoning

The Oracle doesn't just report correlations — it attempts to identify causes.

When the Oracle detects a significant change in a metric, it examines the timeline for potential causes:

1. **Action timeline:** What actions were taken around the time of the change? (New sequence launched, messaging angle changed, content published, PR pitch sent)
2. **External events:** Did anything happen in the market? (Competitor action, industry news, seasonal pattern)
3. **System changes:** Was there a configuration change? (Targeting criteria updated, cadence changed)
4. **Cross-app signals:** Did another metric change around the same time that could explain this?

The Oracle uses Claude Sonnet to synthesize the timeline into a causal hypothesis:

"Reply rates dropped 23% starting March 15. Around that date: (1) you launched a new sequence using the cost-savings messaging angle, (2) a competitor published a major report on the same topic. The decline correlates specifically with the cost-savings messaging — your security-angle sequences maintained their reply rate. Recommendation: revert the new sequence to the security angle and test the cost-savings message with a smaller audience."

**Causal confidence levels:**
- `confirmed`: Direct A/B test or clear before/after with single variable change
- `likely`: Strong correlation with plausible mechanism and timeline match
- `possible`: Correlation exists but multiple variables changed simultaneously
- `speculative`: Pattern exists but no clear mechanism

### 4.5 Attribution Modeling

One of the highest-value analytics capabilities: understanding which activities drive which outcomes across the funnel.

**Multi-touch attribution:**

When a deal closes, what contributed to it? The prospect may have:
1. Found the company through an organic search result (content from Dark Madder)
2. Visited a landing page (Hypothesis)
3. Received a cold outreach email (Harvest)
4. Read a blog post linked in the email (Dark Madder)
5. Attended a webinar mentioned in the blog (external)
6. Received a follow-up sequence (Harvest)
7. Responded and booked a meeting

The Oracle tracks these touchpoints and applies an attribution model:

```typescript
interface AttributionModel {
  type: 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'position_based';
  touchpoints: AttributionTouchpoint[];
  attributed_value: number;
}

interface AttributionTouchpoint {
  source_app: string;
  action_type: string;             // 'content_view', 'email_open', 'form_submit', etc.
  detail: string;                  // Specific content/email/page
  timestamp: string;
  attribution_share: number;       // Percentage of credit (all shares sum to 100%)
}
```

**Default model: position-based (40/20/40):**
- First touch gets 40% credit (what brought them in)
- Last touch gets 40% credit (what converted them)
- All middle touches split the remaining 20%

The Oracle reports attribution at multiple levels:
- **Channel attribution:** Which channels drive pipeline? (organic, email, social, PR, paid)
- **Content attribution:** Which specific content pieces drive pipeline?
- **Campaign attribution:** Which campaigns are most effective end-to-end?
- **App attribution:** How much pipeline value does each app contribute?

### 4.6 Predictive Analytics

The Oracle doesn't just look backwards.

**Pipeline forecasting:**
- Based on current pipeline value, historical conversion rates, and deal velocity → project revenue for the period
- Confidence interval based on historical variance
- Adjusted for seasonality and trend

**Lead volume forecasting:**
- Based on active sequences, historical reply/conversion rates, and content pipeline → project lead generation
- Adjusted for any scheduled campaigns or launches

**Content impact modeling:**
- Given planned publishing schedule → project traffic and lead impact
- Based on historical performance by topic, format, and channel

**"What if" scenarios:**
- "What if we doubled our outbound volume?" → Oracle models the projected impact on pipeline using current conversion rates and capacity constraints
- "What if we shifted 50% of content to security topics?" → Oracle models the projected impact using topic-level performance data
- These are accessible through Chat: "What would happen if we increased email cadence to daily?" and through the Analytics tab as an interactive modeling tool

---

## 5. The Analytics Tab

### 5.1 Layout

The Analytics tab is full-width (no sidebar). It is organized as a scrollable dashboard with sections, not a tabbed sub-navigation. The sections flow from strategic overview to detailed breakdowns.

### 5.2 Section 1: Goal Overview

The top of the page. Shows all active goals with at-a-glance progress.

**For each goal:**
- Goal name and target
- Progress bar or ring showing completion percentage
- Status badge (on track / behind / ahead / at risk / critical)
- Pace indicator (ahead of pace, behind pace, on pace)
- Forecast: "Projected: 42 of 50 target" with confidence range
- Top lever: single most impactful action to improve this goal
- Sparkline showing progress trend over the current period

**Goal sorting:** Goals in critical or at_risk status appear first. Within each status group, sorted by user-defined priority or creation date.

### 5.3 Section 2: Active Insights

The Oracle's latest findings, displayed as cards.

**Each insight card:**
- Type icon (anomaly, trend, correlation, opportunity, etc.)
- Title (one-line summary)
- Body (2-3 sentence explanation)
- Supporting mini-chart (if applicable)
- Recommendation (actionable next step)
- "Act on this" button → opens Chat with the recommendation pre-filled as a command
- "Dismiss" button → removes from active display, logged in Ledger
- Related goals shown as small badges

**Insight cards are ordered by:** urgency, then recency, then confidence. Maximum 5-8 displayed; "Show all insights" expands to full history.

### 5.4 Section 3: GTM Funnel

Full-funnel visualization across all apps. This is the unified view that no individual app can provide.

```
Awareness (top)           →  Engagement (middle)    →  Conversion (bottom)    →  Revenue
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total traffic: 45k          Email opens: 2.3k          Meetings: 47              Deals won: 8
Search impressions: 120k    Replies: 312               Form fills: 156           Revenue: $124k
Social reach: 8.5k          Content engagement: 890    Demo requests: 23         Pipeline: $480k
Media mentions: 12          Page time avg: 2m40s       Qualified leads: 89
```

Each funnel stage is clickable → drills down to the metrics from each contributing app. The funnel shows conversion rates between stages and highlights the biggest drop-offs.

### 5.5 Section 4: App Performance

Per-app KPI cards showing each active app's contribution:

**Each app card:**
- App name and status
- 3-5 key metrics for that app (the ones most relevant to active goals)
- Trend arrows (up/down/stable vs prior period)
- "View in [App]" link for detailed app-level analytics

### 5.6 Section 5: Trend Charts

Time-series visualization for key metrics. The user can:
- Select which metrics to display (multi-select)
- Adjust time range (7 days, 30 days, 90 days, 1 year, custom)
- Compare periods (this month vs last month)
- Overlay annotations (campaign launches, content publishes, PR placements) as markers on the timeline

### 5.7 Section 6: Attribution

Content-to-pipeline and channel-to-pipeline attribution views.

- **Channel attribution chart:** Pie or bar showing pipeline value by source channel
- **Content attribution table:** Top content pieces ranked by attributed pipeline value
- **Campaign attribution:** Active campaigns ranked by ROI

### 5.8 Interaction with Chat

Every element in the Analytics tab is interactive with Chat:

- Click any metric → "Ask about this" opens Chat with a pre-filled question
- Click any insight's "Act on this" → opens Chat with the recommendation as a command
- Click any anomaly → "Why did this happen?" opens Chat for the Oracle's causal analysis
- Click any goal's "top lever" → opens Chat with that lever as a command

The Analytics tab is for visual exploration. Chat is where action happens. The bridge between them should be seamless.

---

## 6. Oracle CRON Functions

### 6.1 oracle-metrics (every 15 minutes)

Pulls metrics from all connected Synapses and external integrations. Normalizes into the unified schema. Stores in `kinetiks_analytics_metrics`.

For external integrations, respects each API's rate limits and caches appropriately:
- GA4: pull every 6 hours (data is delayed anyway)
- GSC: pull every 24 hours (data is delayed 2-3 days)
- Stripe: pull every hour (near-realtime)

### 6.2 oracle-goals (every hour)

Recalculates goal progress for all active goals. Updates `kinetiks_goals.current_value` and `progress_status`. Creates snapshot in `kinetiks_goal_snapshots` for time-series tracking.

### 6.3 oracle-insights (every 6 hours)

The deep analysis pass. Runs anomaly detection, trend detection, correlation analysis across all metrics. Generates insights. Prioritizes and queues for delivery through Marcus.

Also runs the forecasting models to update goal projections.

### 6.4 oracle-alerts (every 15 minutes)

Lightweight anomaly scan on critical metrics only. Catches urgent issues between deep analysis passes. If a major metric drops >30% from its baseline in a single period, generates an immediate alert to Marcus.

### 6.5 oracle-attribution (daily)

Recalculates attribution models. Processes touchpoint data from all apps to update channel, content, and campaign attribution. Stores in attribution tables.

---

## 7. Oracle → Marcus Communication

### 7.1 Data Requests

When Marcus needs analytics data to answer a user question, it sends a structured request to the Oracle:

```typescript
interface OracleDataRequest {
  request_type: 'metric' | 'goal_progress' | 'insight' | 'forecast' | 'comparison' | 'attribution';
  query: string;                    // Natural language query for context
  metric_keys?: string[];           // Specific metrics requested
  time_range?: { start: string; end: string };
  dimensions?: Record<string, string>; // Drill-down filters
  compare_to?: { start: string; end: string }; // Comparison period
  format: 'summary' | 'detailed' | 'chart_data';
}
```

The Oracle processes the request and returns structured data that Marcus formats into a Chat response. For chart data, Marcus renders inline charts in the conversation.

### 7.2 Proactive Pushes

The Oracle pushes insights to Marcus for delivery without being asked:

```typescript
interface OracleAlert {
  insight_id: string;
  delivery_priority: 'immediate' | 'next_brief' | 'weekly_digest';
  title: string;
  body: string;
  supporting_chart: ChartSpec | null;
  recommendation: string;
  affected_goals: string[];
}
```

Marcus delivers these in the appropriate context:
- `immediate`: Next Chat message or Slack DM
- `next_brief`: Included in the morning daily brief
- `weekly_digest`: Included in the weekly summary

### 7.3 Daily Brief Analytics Section

The daily brief that Marcus delivers each morning includes an Oracle section:

- Goal progress summary (all active goals, status, pace)
- Any overnight anomalies or significant changes
- Top insight of the day (most impactful finding)
- One recommendation with expected impact

This is concise — 5-8 sentences total for the analytics section. The user can ask follow-up questions in Chat for detail.

---

## 8. Oracle → Cortex Feedback

When the Oracle discovers something that should update the business identity, it generates Proposals through the standard Cortex pipeline.

**Examples:**

- "Based on 60 days of outreach data, fintech prospects in the Series B stage convert at 2x the rate of Series A" → Proposal to update Customers layer persona weightings
- "The security messaging angle consistently outperforms cost savings across all channels" → Proposal to update Voice layer messaging_patterns with performance data
- "Competitor X launched a new product that's being mentioned in 40% of lost deal reasons" → Proposal to update Competitive layer
- "Healthcare is emerging as your fastest-growing segment" → Proposal to update Customers layer demographics
- "Your content about compliance topics generates 3x more backlinks than other topics" → Proposal to update Narrative layer validated_angles

These Proposals go through normal evaluation (schema validation, conflict detection, etc.) and are logged in the Ledger. The user sees them as "Oracle discovered: [insight]" in the Ledger.

---

## 9. "What If" Modeling

### 9.1 Accessible Through Chat

User: "What would happen if we doubled our outbound volume?"

Marcus routes to Oracle. Oracle runs the model:

```typescript
interface WhatIfScenario {
  description: string;
  variable_changes: { metric_key: string; change_type: 'multiply' | 'add' | 'set'; value: number }[];
  projected_impacts: {
    metric_key: string;
    current_value: number;
    projected_value: number;
    confidence: number;
    assumptions: string[];
  }[];
  constraints: string[];            // "Assumes reply rate holds at current levels"
  risks: string[];                  // "Deliverability may decline with higher volume"
  recommendation: string;
}
```

Oracle responds: "If you doubled outbound volume from 500 to 1,000 emails/week:
- Projected additional replies: ~30/week (assuming reply rate holds at 6.2%)
- Projected additional meetings: ~8/week (based on current meeting conversion)
- Pipeline impact: ~$120k additional pipeline/month
- Risk: deliverability may decline with higher volume, which could reduce reply rates by 10-20%
- Recommendation: increase by 50% first and monitor deliverability for 2 weeks before going to 2x"

### 9.2 Accessible Through Analytics Tab

An interactive modeling section where the user can adjust sliders:
- Outbound volume
- Content publishing frequency
- Ad spend
- Targeting criteria changes

Each adjustment shows projected impact on goals in real-time. This uses the same modeling engine as the Chat interface but with a visual, interactive surface.

---

## 10. Implementation Priority

This system is built in Phase 5. Dependencies:

**Requires (from earlier phases):**
- Phase 1: Analytics tab in the app shell
- Phase 3: Goals system in Cortex (goal definitions, the data the Oracle tracks against)
- Phase 4: Synapse metric reporting capability (apps can push metrics)
- Marcus conversation engine (for Chat-based analytics queries)

### 10.1 Build Order Within Phase 5

1. **Unified metric schema:**
   - Define all metric definitions in `lib/oracle/metric-schema.ts`
   - Create `kinetiks_analytics_metrics` table migration
   - Build metric ingestion endpoint (`api/oracle/metrics`)

2. **Goal tracking engine:**
   - Build `lib/oracle/goal-tracker.ts` — progress calculation, pace, status
   - Build forecasting model (`lib/oracle/forecast.ts`)
   - Create `kinetiks_goal_snapshots` table migration
   - Build goal progress endpoint and CRON function

3. **Pattern detection:**
   - Build `lib/oracle/pattern-detector.ts` — anomaly detection (z-score), trend detection (regression), change point detection
   - Build alert engine (`lib/oracle/alert-engine.ts`)
   - Build CRON function for lightweight alert scanning

4. **Insight generation:**
   - Build `lib/oracle/insight-generator.ts` — evaluation, prioritization, dedup
   - Build cross-app correlation engine
   - Build causal reasoning pipeline (timeline analysis + Claude evaluation)
   - Create `kinetiks_oracle_insights` table migration
   - Build insight CRON function

5. **Oracle → Marcus integration:**
   - Build data request/response interface
   - Build proactive push mechanism
   - Build daily brief analytics section generator
   - Wire Chat analytics queries through Oracle

6. **Oracle → Cortex feedback:**
   - Build analytics-to-Proposal pipeline
   - Wire significant findings to Proposal generation

7. **Attribution modeling:**
   - Build touchpoint tracking infrastructure
   - Build attribution calculation engine
   - Build attribution CRON function

8. **Analytics tab UI:**
   - Goal overview section
   - Active insights section
   - GTM funnel visualization
   - App performance cards
   - Trend charts with time controls
   - Attribution views
   - Chat integration (click → ask/act)

9. **What-if modeling:**
   - Build scenario modeling engine (`lib/oracle/what-if.ts`)
   - Build Chat interface for what-if queries
   - Build interactive Analytics tab modeling section

10. **First app metric integration (Harvest):**
    - Register Harvest metrics in the unified schema
    - Implement Harvest Synapse metric reporting
    - End-to-end test: Harvest reports metrics → Oracle aggregates → goal updates → insight generated → Marcus delivers
