export type MetricCategory = "acquisition" | "engagement" | "conversion" | "retention" | "revenue" | "efficiency" | "content" | "outreach";
export type FunnelStage = "awareness" | "interest" | "consideration" | "intent" | "evaluation" | "purchase";
export type MetricUnit = "count" | "percentage" | "currency" | "duration" | "ratio";

export interface MetricDefinition {
  key: string;
  name: string;
  category: MetricCategory;
  unit: MetricUnit;
  source_app: string;
  funnel_stage?: FunnelStage;
  direction: "higher_better" | "lower_better";
  description: string;
}

export interface MetricDataPoint {
  metric_key: string;
  value: number;
  period: string;
  period_start: string;
  source_app: string;
  dimensions?: Record<string, unknown>;
}

/**
 * Unified metric registry. All metrics across all apps.
 */
export const METRIC_REGISTRY: MetricDefinition[] = [
  // Harvest - Outbound
  { key: "hv_emails_sent", name: "Emails Sent", category: "outreach", unit: "count", source_app: "harvest", direction: "higher_better", description: "Total emails sent" },
  { key: "hv_emails_opened", name: "Emails Opened", category: "outreach", unit: "count", source_app: "harvest", direction: "higher_better", description: "Emails opened by recipients" },
  { key: "hv_open_rate", name: "Open Rate", category: "outreach", unit: "percentage", source_app: "harvest", direction: "higher_better", description: "Email open rate" },
  { key: "hv_reply_rate", name: "Reply Rate", category: "outreach", unit: "percentage", source_app: "harvest", direction: "higher_better", description: "Email reply rate" },
  { key: "hv_bounce_rate", name: "Bounce Rate", category: "outreach", unit: "percentage", source_app: "harvest", direction: "lower_better", description: "Email bounce rate" },
  { key: "hv_sequences_active", name: "Active Sequences", category: "outreach", unit: "count", source_app: "harvest", direction: "higher_better", description: "Currently running sequences" },
  { key: "hv_contacts_enrolled", name: "Contacts Enrolled", category: "outreach", unit: "count", source_app: "harvest", direction: "higher_better", description: "Contacts in active sequences" },
  { key: "hv_meetings_booked", name: "Meetings Booked", category: "conversion", unit: "count", source_app: "harvest", funnel_stage: "intent", direction: "higher_better", description: "Meetings booked from outreach" },
  { key: "hv_positive_replies", name: "Positive Replies", category: "conversion", unit: "count", source_app: "harvest", funnel_stage: "interest", direction: "higher_better", description: "Positive reply count" },

  // Dark Madder - Content
  { key: "dm_articles_published", name: "Articles Published", category: "content", unit: "count", source_app: "dark_madder", direction: "higher_better", description: "Content pieces published" },
  { key: "dm_total_views", name: "Content Views", category: "content", unit: "count", source_app: "dark_madder", funnel_stage: "awareness", direction: "higher_better", description: "Total content views" },
  { key: "dm_avg_time_on_page", name: "Avg Time on Page", category: "engagement", unit: "duration", source_app: "dark_madder", direction: "higher_better", description: "Average reading time" },
  { key: "dm_cta_clicks", name: "CTA Clicks", category: "conversion", unit: "count", source_app: "dark_madder", funnel_stage: "consideration", direction: "higher_better", description: "Content CTA click-throughs" },

  // Litmus - PR
  { key: "lt_pitches_sent", name: "Pitches Sent", category: "outreach", unit: "count", source_app: "litmus", direction: "higher_better", description: "PR pitches sent" },
  { key: "lt_media_mentions", name: "Media Mentions", category: "acquisition", unit: "count", source_app: "litmus", funnel_stage: "awareness", direction: "higher_better", description: "Press coverage count" },
  { key: "lt_coverage_reach", name: "Coverage Reach", category: "acquisition", unit: "count", source_app: "litmus", direction: "higher_better", description: "Estimated audience reached" },

  // Hypothesis - Landing Pages
  { key: "ht_page_views", name: "Page Views", category: "acquisition", unit: "count", source_app: "hypothesis", funnel_stage: "awareness", direction: "higher_better", description: "Landing page views" },
  { key: "ht_conversion_rate", name: "Conversion Rate", category: "conversion", unit: "percentage", source_app: "hypothesis", funnel_stage: "evaluation", direction: "higher_better", description: "Landing page conversion rate" },
  { key: "ht_leads_captured", name: "Leads Captured", category: "conversion", unit: "count", source_app: "hypothesis", funnel_stage: "consideration", direction: "higher_better", description: "Form submissions" },

  // External - GA4
  { key: "ga4_sessions", name: "Website Sessions", category: "acquisition", unit: "count", source_app: "ga4", funnel_stage: "awareness", direction: "higher_better", description: "Total website sessions" },
  { key: "ga4_users", name: "Unique Users", category: "acquisition", unit: "count", source_app: "ga4", direction: "higher_better", description: "Unique website visitors" },
  { key: "ga4_bounce_rate", name: "Bounce Rate", category: "engagement", unit: "percentage", source_app: "ga4", direction: "lower_better", description: "Website bounce rate" },

  // External - Stripe
  { key: "stripe_mrr", name: "MRR", category: "revenue", unit: "currency", source_app: "stripe", direction: "higher_better", description: "Monthly recurring revenue" },
  { key: "stripe_new_customers", name: "New Customers", category: "conversion", unit: "count", source_app: "stripe", funnel_stage: "purchase", direction: "higher_better", description: "New paying customers" },
  { key: "stripe_churn_rate", name: "Churn Rate", category: "retention", unit: "percentage", source_app: "stripe", direction: "lower_better", description: "Customer churn rate" },
];

export function getMetricDefinition(key: string): MetricDefinition | undefined {
  return METRIC_REGISTRY.find((m) => m.key === key);
}

export function getMetricsByApp(app: string): MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.source_app === app);
}

export function getMetricsByCategory(category: MetricCategory): MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.category === category);
}
