/**
 * Nango sync — Meta Ads — meta-ads-campaigns.
 *
 * Pulls daily campaign-level insights from the Meta Marketing API for
 * each ad account attached to the connection. Uses the synchronous
 * insights endpoint with date_preset=last_28d and time_increment=1 (one
 * row per day per campaign).
 *
 * For ad accounts above ~50 active campaigns or windows wider than 28d,
 * Meta requires async report runs (POST /insights → poll report_run_id).
 * We default to synchronous and let the user open a D3 follow-up if they
 * need wider windows or ad-level granularity.
 *
 * Property resolution: the user grants access to one or more ad
 * accounts; we stash the chosen one in connection metadata.ad_account_id.
 * Missing → no-op (handler surfaces a connect prompt).
 */

import type { NangoSync } from "@nangohq/sync";

const META_API_VERSION = "v18.0";
const FIELDS = [
  "date_start",
  "campaign_id",
  "campaign_name",
  "objective",
  "impressions",
  "reach",
  "clicks",
  "spend",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "action_values",
].join(",");

interface MetaInsightsRow {
  date_start: string;
  campaign_id: string;
  campaign_name: string;
  objective?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

interface MetaPagedResponse {
  data?: MetaInsightsRow[];
  paging?: { next?: string; cursors?: { before?: string; after?: string } };
}

interface MetaAdsCampaignInsight {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  objective: string;
  status: string;
  date: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversion_value: number;
  roas: number;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sumActions(
  actions: MetaInsightsRow["actions"],
  matcher: (action_type: string) => boolean
): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (matcher(a.action_type)) total += toNum(a.value);
  }
  return total;
}

const CONVERSION_ACTION_MATCHERS = (t: string) =>
  t === "purchase" ||
  t === "offsite_conversion.fb_pixel_purchase" ||
  t === "onsite_conversion.purchase" ||
  /complete_registration|lead/.test(t);

export default async function fetchMetaAdsCampaigns(nango: NangoSync): Promise<void> {
  const metadata = (await nango.getMetadata()) as { ad_account_id?: string };
  const adAccountId = metadata?.ad_account_id;

  if (!adAccountId) {
    await nango.log(
      "meta-ads-campaigns: connection metadata missing ad_account_id; user must pick a Meta ad account. Sync no-ops."
    );
    return;
  }

  // First fetch campaign list to get status info
  const campaignsResponse = await nango.proxy({
    method: "GET",
    endpoint: `/${META_API_VERSION}/act_${adAccountId}/campaigns`,
    params: {
      fields: "id,name,status,objective",
      limit: "200",
    },
    retries: 3,
  });
  const campaignsBody = campaignsResponse.data as {
    data?: Array<{ id: string; name?: string; status?: string; objective?: string }>;
  };
  const campaignStatuses = new Map<string, string>();
  for (const c of campaignsBody?.data ?? []) {
    campaignStatuses.set(c.id, c.status ?? "UNKNOWN");
  }

  // Fetch insights paginated
  let url: string | undefined = `/${META_API_VERSION}/act_${adAccountId}/insights`;
  let params: Record<string, string> | undefined = {
    fields: FIELDS,
    level: "campaign",
    date_preset: "last_28d",
    time_increment: "1",
    limit: "500",
  };
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const response = await nango.proxy({
      method: "GET",
      endpoint: url,
      params,
      retries: 3,
    });
    const body = response.data as MetaPagedResponse;
    const rows = body?.data ?? [];
    if (rows.length === 0) break;

    const records: MetaAdsCampaignInsight[] = rows.map((r) => {
      const impressions = toNum(r.impressions);
      const clicks = toNum(r.clicks);
      const spend = toNum(r.spend);
      const conversions = sumActions(r.actions, CONVERSION_ACTION_MATCHERS);
      const conversionValue = sumActions(r.action_values, CONVERSION_ACTION_MATCHERS);
      return {
        id: `${r.campaign_id}::${r.date_start}`,
        ad_account_id: adAccountId,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name ?? "",
        objective: r.objective ?? "",
        status: campaignStatuses.get(r.campaign_id) ?? "UNKNOWN",
        date: r.date_start,
        impressions,
        reach: toNum(r.reach),
        clicks,
        spend,
        ctr: toNum(r.ctr),
        cpc: toNum(r.cpc),
        cpm: toNum(r.cpm),
        conversions,
        conversion_value: conversionValue,
        roas: spend > 0 ? conversionValue / spend : 0,
      };
    });

    await nango.batchSave<MetaAdsCampaignInsight>(records, "MetaAdsCampaignInsight");

    if (!body.paging?.next) break;
    // Meta returns a fully-qualified next URL; treat as relative to host
    // by stripping the host prefix.
    const next = body.paging.next;
    url = next.replace(/^https?:\/\/[^/]+/, "");
    params = undefined; // next URL already encodes params
  }
}
