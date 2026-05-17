/**
 * CRM aggregator — materializes HubSpot entities into derived metrics
 * that the Oracle's source-agnostic detectors can consume.
 *
 * Why aggregate? HubSpot data is entities (deals, contacts, companies)
 * but the Oracle works on time-series metrics. We compute 8 snapshot +
 * windowed metrics per account and stamp them into kinetiks_metric_cache
 * with source='hubspot'. The metric keys are declared in
 * apps/id/src/lib/oracle/metric-schema.ts.
 *
 * Invoked by oracle/runner.ts as part of analyzeAccount() — called
 * exactly once per Oracle cycle, before detectors run. Reads from
 * kinetiks_crm_entities (no joins to external systems), so it's safe to
 * call on every cycle.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { writeCachedMetric } from "@/lib/connections/metric-cache";

// 1 hour TTL for HubSpot derived metrics. The underlying entities
// refresh on HubSpot's Nango sync cadence (typically 15-60 min); rolling
// up more often than the source data refreshes is wasteful.
const HUBSPOT_TTL_SECONDS = 3600;

export interface HubspotMetricsSnapshot {
  hubspot_deals_open: number;
  hubspot_deal_value_open: number;
  hubspot_deals_won_28d: number;
  hubspot_deal_value_won_28d: number;
  hubspot_deals_created_28d: number;
  hubspot_avg_deal_close_days: number | null;
  hubspot_win_rate_28d: number | null;
  hubspot_contacts_created_28d: number;
}

export interface CrmAggregatorResult {
  metricsWritten: number;
  snapshot: HubspotMetricsSnapshot;
  /** Coverage notes — useful for the Oracle run summary. */
  dealsExamined: number;
  contactsExamined: number;
}

/**
 * Compute the 8 HubSpot metrics for an account and stamp them into the
 * metric cache. Returns the snapshot and counts so the runner can record
 * coverage in kinetiks_oracle_runs.
 */
export async function aggregateHubspotMetrics(
  admin: SupabaseClient,
  accountId: string,
  now: Date = new Date()
): Promise<CrmAggregatorResult> {
  const TWENTY_EIGHT_DAYS_AGO = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const NINETY_DAYS_AGO = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // ── Deals
  const { data: deals, error: dealErr } = await admin
    .from("kinetiks_crm_entities")
    .select("data, external_updated_at")
    .eq("account_id", accountId)
    .eq("source", "hubspot")
    .eq("entity_type", "deal");

  if (dealErr) {
    throw new Error(`crm_aggregator: deals read failed: ${dealErr.message}`);
  }

  // ── Contacts
  const { data: contacts, error: contactErr } = await admin
    .from("kinetiks_crm_entities")
    .select("data, external_updated_at")
    .eq("account_id", accountId)
    .eq("source", "hubspot")
    .eq("entity_type", "contact");

  if (contactErr) {
    throw new Error(`crm_aggregator: contacts read failed: ${contactErr.message}`);
  }

  const snapshot = computeSnapshot({
    deals: deals ?? [],
    contacts: contacts ?? [],
    twentyEightDaysAgo: TWENTY_EIGHT_DAYS_AGO,
    ninetyDaysAgo: NINETY_DAYS_AGO,
    now,
  });

  await writeSnapshotToCache(admin, accountId, snapshot, now);

  return {
    metricsWritten: 8,
    snapshot,
    dealsExamined: deals?.length ?? 0,
    contactsExamined: contacts?.length ?? 0,
  };
}

// ─── Pure computation (testable) ─────────────────────────────

export interface ComputeSnapshotInput {
  deals: Array<{ data: unknown; external_updated_at: string | null }>;
  contacts: Array<{ data: unknown; external_updated_at: string | null }>;
  twentyEightDaysAgo: Date;
  ninetyDaysAgo: Date;
  now: Date;
}

interface DealView {
  amount: number | null;
  is_closed: boolean;
  is_won: boolean;
  created_at: Date | null;
  closed_at: Date | null;
}

function asDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function asDealView(raw: unknown): DealView | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    amount: typeof o.amount === "number" ? o.amount : null,
    is_closed: o.is_closed === true,
    is_won: o.is_won === true,
    created_at: asDate(o.created_at),
    closed_at: asDate(o.closed_at),
  };
}

function asContactCreated(raw: unknown): Date | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // HubSpot contacts don't always carry a `created_at` we normalized
  // explicitly; fall back to external_updated_at which is sticky for
  // new contacts (HubSpot stamps both on creation).
  return asDate(o.external_updated_at);
}

export function computeSnapshot(
  input: ComputeSnapshotInput
): HubspotMetricsSnapshot {
  const { deals, contacts, twentyEightDaysAgo, ninetyDaysAgo } = input;

  const dealViews: DealView[] = [];
  for (const row of deals) {
    const view = asDealView(row.data);
    if (view) dealViews.push(view);
  }

  // ── Open deals
  const openDeals = dealViews.filter((d) => !d.is_closed);
  const hubspot_deals_open = openDeals.length;
  const hubspot_deal_value_open = openDeals.reduce(
    (sum, d) => sum + (d.amount ?? 0),
    0
  );

  // ── Closed deals in last 28d
  const closed28d = dealViews.filter(
    (d) => d.is_closed && d.closed_at && d.closed_at >= twentyEightDaysAgo
  );
  const won28d = closed28d.filter((d) => d.is_won);
  const hubspot_deals_won_28d = won28d.length;
  const hubspot_deal_value_won_28d = won28d.reduce(
    (sum, d) => sum + (d.amount ?? 0),
    0
  );

  // ── Win rate (last 28d): won / closed
  const hubspot_win_rate_28d =
    closed28d.length > 0
      ? (won28d.length / closed28d.length) * 100
      : null;

  // ── Deals created in last 28d
  const hubspot_deals_created_28d = dealViews.filter(
    (d) => d.created_at && d.created_at >= twentyEightDaysAgo
  ).length;

  // ── Avg close time (last 90d) for won deals
  const won90d = dealViews.filter(
    (d) => d.is_won && d.closed_at && d.closed_at >= ninetyDaysAgo && d.created_at
  );
  let hubspot_avg_deal_close_days: number | null = null;
  if (won90d.length > 0) {
    const totalDays = won90d.reduce((sum, d) => {
      const ms = (d.closed_at!.getTime() - d.created_at!.getTime());
      return sum + ms / (24 * 60 * 60 * 1000);
    }, 0);
    hubspot_avg_deal_close_days = totalDays / won90d.length;
  }

  // ── Contacts created in last 28d (best-effort via external_updated_at)
  const hubspot_contacts_created_28d = contacts.reduce((count, row) => {
    const created = asContactCreated(row.data) ?? asDate(row.external_updated_at);
    return created && created >= twentyEightDaysAgo ? count + 1 : count;
  }, 0);

  return {
    hubspot_deals_open,
    hubspot_deal_value_open,
    hubspot_deals_won_28d,
    hubspot_deal_value_won_28d,
    hubspot_deals_created_28d,
    hubspot_avg_deal_close_days,
    hubspot_win_rate_28d,
    hubspot_contacts_created_28d,
  };
}

// ─── Cache writes ────────────────────────────────────────────

async function writeSnapshotToCache(
  admin: SupabaseClient,
  accountId: string,
  snapshot: HubspotMetricsSnapshot,
  now: Date
): Promise<void> {
  const period = "snapshot";
  const period_start = now.toISOString();

  const writes: Array<{ metric: keyof HubspotMetricsSnapshot; value: number | null }> = [
    { metric: "hubspot_deals_open", value: snapshot.hubspot_deals_open },
    { metric: "hubspot_deal_value_open", value: snapshot.hubspot_deal_value_open },
    { metric: "hubspot_deals_won_28d", value: snapshot.hubspot_deals_won_28d },
    { metric: "hubspot_deal_value_won_28d", value: snapshot.hubspot_deal_value_won_28d },
    { metric: "hubspot_deals_created_28d", value: snapshot.hubspot_deals_created_28d },
    { metric: "hubspot_avg_deal_close_days", value: snapshot.hubspot_avg_deal_close_days },
    { metric: "hubspot_win_rate_28d", value: snapshot.hubspot_win_rate_28d },
    { metric: "hubspot_contacts_created_28d", value: snapshot.hubspot_contacts_created_28d },
  ];

  for (const { metric, value } of writes) {
    if (value === null) continue;
    await writeCachedMetric(admin, {
      account_id: accountId,
      source: "hubspot",
      input: { metric, period },
      response: {
        rows: [{ dimensions: {}, value }],
        metric,
        metric_unit: "count",
        period_start,
        date_range: { start: period_start, end: period_start },
      },
      stale_after_seconds: HUBSPOT_TTL_SECONDS,
    });
  }
}
