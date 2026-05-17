/**
 * Nango sync — Google Ads — google-ads-campaigns.
 *
 * Pulls daily campaign-level performance via the GoogleAds Search API
 * using a GAQL query. Customer id is read from connection metadata.
 *
 * Note: Google Ads cost is reported in micros (cost_micros: 1,000,000 =
 * one currency unit). We divide by 1e6 before persisting.
 */

import type { NangoSync } from "@nangohq/sync";

const GOOGLE_ADS_API_VERSION = "v15";

interface GoogleAdsRow {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertising_channel_type?: string;
  };
  segments?: { date?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    cost_micros?: string;
    ctr?: number | string;
    average_cpc?: string;
    conversions?: number | string;
    conversions_value?: number | string;
  };
}

interface GoogleAdsResponse {
  results?: GoogleAdsRow[];
  nextPageToken?: string;
}

interface GoogleAdsCampaignInsight {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string;
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  ctr: number;
  cpc: number;
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

const QUERY = `
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    segments.date,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.ctr,
    metrics.average_cpc,
    metrics.conversions,
    metrics.conversions_value
  FROM campaign
  WHERE segments.date DURING LAST_28_DAYS
`;

export default async function fetchGoogleAdsCampaigns(nango: NangoSync): Promise<void> {
  const metadata = (await nango.getMetadata()) as { customer_id?: string };
  const customerId = metadata?.customer_id;

  if (!customerId) {
    await nango.log(
      "google-ads-campaigns: connection metadata missing customer_id. Sync no-ops."
    );
    return;
  }

  let pageToken: string | undefined = undefined;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await nango.proxy({
      method: "POST",
      endpoint: `/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      data: {
        query: QUERY,
        page_size: 10000,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
      retries: 3,
    });
    const body = response.data as GoogleAdsResponse;
    const rows = body?.results ?? [];
    if (rows.length === 0) break;

    const records: GoogleAdsCampaignInsight[] = rows.map((r) => {
      const campaignId = r.campaign?.id ?? "";
      const date = r.segments?.date ?? "";
      const impressions = toNum(r.metrics?.impressions);
      const clicks = toNum(r.metrics?.clicks);
      const cost = toNum(r.metrics?.cost_micros) / 1_000_000;
      const conversions = toNum(r.metrics?.conversions);
      const conversionValue = toNum(r.metrics?.conversions_value);
      return {
        id: `${campaignId}::${date}`,
        customer_id: customerId,
        campaign_id: campaignId,
        campaign_name: r.campaign?.name ?? "",
        status: r.campaign?.status ?? "UNKNOWN",
        advertising_channel_type: r.campaign?.advertising_channel_type ?? "UNKNOWN",
        date,
        impressions,
        clicks,
        cost,
        ctr: toNum(r.metrics?.ctr),
        cpc: toNum(r.metrics?.average_cpc) / 1_000_000,
        conversions,
        conversion_value: conversionValue,
        roas: cost > 0 ? conversionValue / cost : 0,
      };
    });

    await nango.batchSave<GoogleAdsCampaignInsight>(records, "GoogleAdsCampaignInsight");

    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
}
