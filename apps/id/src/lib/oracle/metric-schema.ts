export type MetricCategory = "acquisition" | "engagement" | "conversion" | "retention" | "revenue" | "efficiency" | "content" | "outreach";
export type FunnelStage = "awareness" | "interest" | "consideration" | "intent" | "evaluation" | "purchase";
export type MetricUnit = "count" | "percentage" | "currency" | "duration" | "ratio" | "tracking_only";

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

  // External - Google Search Console (D2 Slice 6)
  { key: "gsc_impressions", name: "Search Impressions", category: "acquisition", unit: "count", source_app: "gsc", funnel_stage: "awareness", direction: "higher_better", description: "Times the site appeared in Google search results." },
  { key: "gsc_clicks", name: "Search Clicks", category: "acquisition", unit: "count", source_app: "gsc", funnel_stage: "interest", direction: "higher_better", description: "Clicks from Google search results to the site." },
  { key: "gsc_ctr", name: "Search CTR", category: "engagement", unit: "percentage", source_app: "gsc", direction: "higher_better", description: "Click-through rate on Google search impressions." },
  { key: "gsc_avg_position", name: "Avg Search Position", category: "acquisition", unit: "ratio", source_app: "gsc", direction: "lower_better", description: "Mean ranking position across queries (impression-weighted)." },

  // External - Meta Ads (D2 Slice 7)
  { key: "meta_spend", name: "Meta Ad Spend", category: "efficiency", unit: "currency", source_app: "meta_ads", direction: "lower_better", description: "Total spend on Meta (Facebook + Instagram) ads in the period." },
  { key: "meta_impressions", name: "Meta Impressions", category: "acquisition", unit: "count", source_app: "meta_ads", funnel_stage: "awareness", direction: "higher_better", description: "Total Meta ad impressions in the period." },
  { key: "meta_clicks", name: "Meta Clicks", category: "acquisition", unit: "count", source_app: "meta_ads", funnel_stage: "interest", direction: "higher_better", description: "Total Meta ad clicks in the period." },
  { key: "meta_ctr", name: "Meta CTR", category: "engagement", unit: "percentage", source_app: "meta_ads", direction: "higher_better", description: "Meta ad click-through rate." },
  { key: "meta_cpc", name: "Meta CPC", category: "efficiency", unit: "currency", source_app: "meta_ads", direction: "lower_better", description: "Average cost per click on Meta." },
  { key: "meta_cpm", name: "Meta CPM", category: "efficiency", unit: "currency", source_app: "meta_ads", direction: "lower_better", description: "Average cost per 1000 impressions on Meta." },
  { key: "meta_conversions", name: "Meta Conversions", category: "conversion", unit: "count", source_app: "meta_ads", funnel_stage: "purchase", direction: "higher_better", description: "Pixel-tracked purchases / leads attributed to Meta." },
  { key: "meta_conversion_value", name: "Meta Conversion Value", category: "revenue", unit: "currency", source_app: "meta_ads", direction: "higher_better", description: "Reported revenue from Meta conversions." },
  { key: "meta_roas", name: "Meta ROAS", category: "efficiency", unit: "ratio", source_app: "meta_ads", direction: "higher_better", description: "Meta conversion value divided by spend." },

  // External - Google Ads (D2 Slice 7)
  { key: "gads_spend", name: "Google Ads Spend", category: "efficiency", unit: "currency", source_app: "google_ads", direction: "lower_better", description: "Total spend on Google Ads in the period." },
  { key: "gads_impressions", name: "Google Ads Impressions", category: "acquisition", unit: "count", source_app: "google_ads", funnel_stage: "awareness", direction: "higher_better", description: "Google Ads impressions in the period." },
  { key: "gads_clicks", name: "Google Ads Clicks", category: "acquisition", unit: "count", source_app: "google_ads", funnel_stage: "interest", direction: "higher_better", description: "Google Ads clicks in the period." },
  { key: "gads_ctr", name: "Google Ads CTR", category: "engagement", unit: "percentage", source_app: "google_ads", direction: "higher_better", description: "Google Ads click-through rate." },
  { key: "gads_cpc", name: "Google Ads CPC", category: "efficiency", unit: "currency", source_app: "google_ads", direction: "lower_better", description: "Average cost per click on Google Ads." },
  { key: "gads_conversions", name: "Google Ads Conversions", category: "conversion", unit: "count", source_app: "google_ads", funnel_stage: "purchase", direction: "higher_better", description: "Conversions attributed to Google Ads." },
  { key: "gads_conversion_value", name: "Google Ads Conversion Value", category: "revenue", unit: "currency", source_app: "google_ads", direction: "higher_better", description: "Reported revenue from Google Ads conversions." },
  { key: "gads_roas", name: "Google Ads ROAS", category: "efficiency", unit: "ratio", source_app: "google_ads", direction: "higher_better", description: "Google Ads conversion value divided by spend." },

  // External - Stripe (expanded in D2 Slice 6)
  { key: "stripe_mrr", name: "MRR", category: "revenue", unit: "currency", source_app: "stripe", direction: "higher_better", description: "Monthly recurring revenue" },
  { key: "stripe_arr", name: "ARR", category: "revenue", unit: "currency", source_app: "stripe", direction: "higher_better", description: "Annualized recurring revenue (MRR × 12)." },
  { key: "stripe_new_customers", name: "New Customers", category: "conversion", unit: "count", source_app: "stripe", funnel_stage: "purchase", direction: "higher_better", description: "New paying customers (last 28d)." },
  { key: "stripe_churn_rate", name: "Churn Rate", category: "retention", unit: "percentage", source_app: "stripe", direction: "lower_better", description: "Subscription churn rate over the last 28d." },
  { key: "stripe_avg_order_value", name: "Avg Order Value", category: "revenue", unit: "currency", source_app: "stripe", direction: "higher_better", description: "Mean charge amount over the last 28d." },
  { key: "stripe_refund_rate", name: "Refund Rate", category: "retention", unit: "percentage", source_app: "stripe", direction: "lower_better", description: "Refunded charges as a percentage of paid charges (last 28d)." },
  { key: "stripe_ltv", name: "LTV (estimate)", category: "revenue", unit: "currency", source_app: "stripe", direction: "higher_better", description: "Rolling LTV estimate from avg order value × repeat purchase rate." },

  // External - HubSpot CRM (D2 Slice 4: derived metrics from kinetiks_crm_entities)
  { key: "hubspot_deals_open", name: "Open Deals", category: "conversion", unit: "count", source_app: "hubspot", funnel_stage: "consideration", direction: "higher_better", description: "Current count of HubSpot deals not in a closed stage." },
  { key: "hubspot_deal_value_open", name: "Open Pipeline Value", category: "revenue", unit: "currency", source_app: "hubspot", direction: "higher_better", description: "Sum of amounts for currently open HubSpot deals." },
  { key: "hubspot_deals_won_28d", name: "Deals Won (28d)", category: "conversion", unit: "count", source_app: "hubspot", funnel_stage: "purchase", direction: "higher_better", description: "Count of HubSpot deals closed-won in the last 28 days." },
  { key: "hubspot_deal_value_won_28d", name: "Revenue Won (28d)", category: "revenue", unit: "currency", source_app: "hubspot", direction: "higher_better", description: "Sum of amounts for HubSpot deals closed-won in the last 28 days." },
  { key: "hubspot_deals_created_28d", name: "Deals Created (28d)", category: "acquisition", unit: "count", source_app: "hubspot", funnel_stage: "interest", direction: "higher_better", description: "Count of HubSpot deals created in the last 28 days." },
  { key: "hubspot_avg_deal_close_days", name: "Avg Deal Close (days)", category: "conversion", unit: "duration", source_app: "hubspot", direction: "lower_better", description: "Mean number of days between create and close for deals closed-won in the last 90 days." },
  { key: "hubspot_win_rate_28d", name: "Win Rate (28d)", category: "conversion", unit: "percentage", source_app: "hubspot", funnel_stage: "purchase", direction: "higher_better", description: "Closed-won deals as a percentage of all closed deals in the last 28 days." },
  { key: "hubspot_contacts_created_28d", name: "Contacts Created (28d)", category: "acquisition", unit: "count", source_app: "hubspot", funnel_stage: "awareness", direction: "higher_better", description: "Count of HubSpot contacts created in the last 28 days." },
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
