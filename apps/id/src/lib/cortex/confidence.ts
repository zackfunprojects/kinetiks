import type { ContextLayer } from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-layer weights for the aggregate confidence score.
 * Must sum to 1.0.
 */
const LAYER_WEIGHTS: Record<ContextLayer, number> = {
  org: 0.08,
  products: 0.18,
  voice: 0.18,
  customers: 0.14,
  narrative: 0.12,
  competitive: 0.08,
  market: 0.08,
  brand: 0.14,
};

/**
 * Source quality multipliers. User-entered data scores higher.
 */
const SOURCE_MULTIPLIER: Record<string, number> = {
  user_explicit: 1.0,
  user_implicit: 0.9,
  cartographer: 0.7,
  system: 0.0,
};

/**
 * Expected data point counts per layer for 100% completeness.
 * These are the number of non-null top-level fields we expect.
 */
const EXPECTED_FIELDS: Record<ContextLayer, string[]> = {
  org: [
    "company_name",
    "industry",
    "stage",
    "geography",
    "website",
    "description",
  ],
  products: ["products"],
  voice: [
    "tone",
    "vocabulary",
    "messaging_patterns",
    "writing_samples",
    "calibration_data",
  ],
  customers: ["personas", "demographics", "analytics_data"],
  narrative: [
    "origin_story",
    "founder_thesis",
    "why_now",
    "brand_arc",
    "validated_angles",
  ],
  competitive: ["competitors", "positioning_gaps", "differentiation_vectors"],
  market: ["trends", "media_sentiment", "llm_representation"],
  brand: [
    "colors",
    "typography",
    "tokens",
    "imagery",
    "motion",
    "modes",
    "accessibility",
  ],
};

export interface ConfidenceScores {
  org: number;
  products: number;
  voice: number;
  customers: number;
  narrative: number;
  competitive: number;
  market: number;
  brand: number;
  aggregate: number;
}

/**
 * Recalculate all confidence scores for an account.
 * Called after proposal acceptance or data changes.
 */
export async function recalculateConfidence(
  admin: SupabaseClient,
  accountId: string
): Promise<ConfidenceScores> {
  const layers: ContextLayer[] = [
    "org",
    "products",
    "voice",
    "customers",
    "narrative",
    "competitive",
    "market",
    "brand",
  ];

  const layerScores: Record<string, number> = {};

  // Calculate each layer score in parallel
  const results = await Promise.all(
    layers.map(async (layer) => {
      const score = await calculateLayerScore(admin, accountId, layer);
      return { layer, score };
    })
  );

  for (const { layer, score } of results) {
    layerScores[layer] = score;
  }

  // Calculate weighted aggregate
  let aggregate = 0;
  for (const layer of layers) {
    aggregate += layerScores[layer] * LAYER_WEIGHTS[layer];
  }

  const scores: ConfidenceScores = {
    org: layerScores.org,
    products: layerScores.products,
    voice: layerScores.voice,
    customers: layerScores.customers,
    narrative: layerScores.narrative,
    competitive: layerScores.competitive,
    market: layerScores.market,
    brand: layerScores.brand,
    aggregate: Math.round(aggregate * 100) / 100,
  };

  // Persist to database (upsert to handle missing rows)
  await admin
    .from("kinetiks_confidence")
    .upsert({
      account_id: accountId,
      ...scores,
      updated_at: new Date().toISOString(),
    }, { onConflict: "account_id" });

  return scores;
}

/**
 * Calculate the confidence score for a single layer (0-100).
 *
 * Factors:
 * (a) Completeness - what % of expected fields have data?
 * (b) Source quality - user-entered vs AI-inferred
 * (c) Data recency - how fresh is the data?
 * (d) Data richness - depth of populated fields
 */
async function calculateLayerScore(
  admin: SupabaseClient,
  accountId: string,
  layer: ContextLayer
): Promise<number> {
  const tableName = `kinetiks_context_${layer}`;

  const { data: row } = await admin
    .from(tableName)
    .select("data, source, updated_at")
    .eq("account_id", accountId)
    .single();

  if (!row) return 0;

  const data = row.data as Record<string, unknown>;
  const source = row.source as string;
  const updatedAt = row.updated_at as string;

  if (!data || Object.keys(data).length === 0) return 0;

  // ── Factor A: Completeness (0-40 points) ──
  const expectedFields = EXPECTED_FIELDS[layer];
  let populatedCount = 0;

  for (const field of expectedFields) {
    const val = data[field];
    if (val === null || val === undefined) continue;
    if (typeof val === "string" && val.length === 0) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (
      typeof val === "object" &&
      !Array.isArray(val) &&
      Object.keys(val as Record<string, unknown>).length === 0
    )
      continue;
    populatedCount++;
  }

  const completeness = (populatedCount / expectedFields.length) * 40;

  // ── Factor B: Source quality (0-25 points) ──
  const sourceKey = source.startsWith("synapse:")
    ? "synapse"
    : source;
  const multiplier = SOURCE_MULTIPLIER[sourceKey] ?? 0.5;
  const sourceQuality = multiplier * 25;

  // ── Factor C: Data recency (0-20 points) ──
  let recency = 0;
  if (updatedAt) {
    const age = Date.now() - new Date(updatedAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    if (age < sevenDays) recency = 20;
    else if (age < thirtyDays) recency = 15;
    else if (age < ninetyDays) recency = 10;
    else recency = 5;
  }

  // ── Factor D: Data richness (0-15 points) ──
  const richness = calculateRichness(data, layer);

  const total = Math.min(
    completeness + sourceQuality + recency + richness,
    100
  );
  return Math.round(total * 100) / 100;
}

/**
 * Calculate how "rich" the data is beyond simple field presence.
 * Rewards arrays with multiple items, nested objects with detail, etc.
 */
function calculateRichness(
  data: Record<string, unknown>,
  layer: ContextLayer
): number {
  let richness = 0;
  const maxRichness = 15;

  switch (layer) {
    case "products": {
      const products = data.products as unknown[] | undefined;
      if (products && products.length > 0) {
        // More products = more richness (up to 5)
        richness += Math.min(products.length * 3, maxRichness);
      }
      break;
    }
    case "voice": {
      const samples = data.writing_samples as unknown[] | undefined;
      const calibration = data.calibration_data as unknown[] | undefined;
      if (samples) richness += Math.min(samples.length * 2, 8);
      if (calibration) richness += Math.min(calibration.length * 1.5, 7);
      break;
    }
    case "customers": {
      const personas = data.personas as unknown[] | undefined;
      if (personas) richness += Math.min(personas.length * 3, 12);
      const analytics = data.analytics_data as Record<string, unknown> | undefined;
      if (analytics && Object.keys(analytics).length > 0) richness += 3;
      break;
    }
    case "competitive": {
      const competitors = data.competitors as unknown[] | undefined;
      if (competitors) richness += Math.min(competitors.length * 3, 12);
      const gaps = data.positioning_gaps as unknown[] | undefined;
      if (gaps && gaps.length > 0) richness += 3;
      break;
    }
    case "narrative": {
      const angles = data.validated_angles as unknown[] | undefined;
      if (angles) richness += Math.min(angles.length * 3, 9);
      if (data.origin_story) richness += 3;
      if (data.founder_thesis) richness += 3;
      break;
    }
    case "market": {
      const trends = data.trends as unknown[] | undefined;
      if (trends) richness += Math.min(trends.length * 2, 10);
      if (data.llm_representation) richness += 5;
      break;
    }
    case "brand": {
      let brandPoints = 0;
      if (data.colors) brandPoints += 3;
      if (data.typography) brandPoints += 3;
      if (data.tokens) brandPoints += 3;
      if (data.imagery) brandPoints += 3;
      if (data.logo) brandPoints += 3;
      richness += Math.min(brandPoints, maxRichness);
      break;
    }
    case "org": {
      // Richness for detailed descriptions
      const desc = data.description as string | undefined;
      if (desc && desc.length > 100) richness += 5;
      if (desc && desc.length > 300) richness += 5;
      if (data.team_size) richness += 2.5;
      if (data.funding_status) richness += 2.5;
      break;
    }
  }

  return Math.min(richness, maxRichness);
}

/**
 * Get the current confidence scores from the cache.
 * Falls back to recalculation if not found.
 */
export async function getConfidence(
  admin: SupabaseClient,
  accountId: string
): Promise<ConfidenceScores> {
  const { data } = await admin
    .from("kinetiks_confidence")
    .select("*")
    .eq("account_id", accountId)
    .single();

  if (!data) {
    return recalculateConfidence(admin, accountId);
  }

  return {
    org: Number(data.org),
    products: Number(data.products),
    voice: Number(data.voice),
    customers: Number(data.customers),
    narrative: Number(data.narrative),
    competitive: Number(data.competitive),
    market: Number(data.market),
    brand: Number(data.brand),
    aggregate: Number(data.aggregate),
  };
}
