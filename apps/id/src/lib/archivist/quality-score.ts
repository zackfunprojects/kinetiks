/**
 * Archivist quality scoring engine.
 *
 * Scores individual entries within context layers on four factors:
 * completeness, consistency, freshness, and specificity.
 * This is a read-only module - it does not mutate any data.
 */

import type { ContextLayer } from "@kinetiks/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryQualityScore, QualityScoreResult } from "./types";

const CONTEXT_LAYERS: ContextLayer[] = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
];

/**
 * Per-layer weights for the aggregate quality score.
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
 * Expected fields per layer for completeness scoring.
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
  products: ["name", "description", "value_prop", "pricing_model", "features", "differentiators"],
  voice: ["tone", "vocabulary", "messaging_patterns", "writing_samples", "calibration_data"],
  customers: ["name", "role", "pain_points", "buying_triggers", "objections"],
  narrative: [
    "origin_story",
    "founder_thesis",
    "why_now",
    "brand_arc",
    "validated_angles",
  ],
  competitive: ["name", "positioning", "strengths", "weaknesses"],
  market: ["topic", "direction", "relevance"],
  brand: ["colors", "typography", "tokens", "imagery", "motion", "accessibility"],
};

/**
 * Words that indicate vagueness in content.
 */
const VAGUE_WORDS = [
  "various",
  "many",
  "general",
  "etc",
  "multiple",
  "several",
  "some",
  "stuff",
  "things",
  "everything",
  "anything",
];

// ── Scoring helpers ──

/**
 * Completeness factor (0-25): how many expected fields are populated?
 */
function scoreCompleteness(
  entry: Record<string, unknown>,
  expectedFields: string[]
): number {
  if (expectedFields.length === 0) return 25;

  let populated = 0;
  for (const field of expectedFields) {
    const val = entry[field];
    if (val === null || val === undefined) continue;
    if (typeof val === "string" && val.trim().length === 0) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (
      typeof val === "object" &&
      !Array.isArray(val) &&
      Object.keys(val as Record<string, unknown>).length === 0
    )
      continue;
    populated++;
  }

  return Math.round((populated / expectedFields.length) * 25);
}

/**
 * Consistency factor (0-25): basic checks for internal consistency.
 * Looks for mismatches and cross-references within the entry.
 */
function scoreConsistency(entry: Record<string, unknown>): number {
  let score = 25;
  const issues: string[] = [];

  // Check for contradictory empty/populated patterns
  // If a description exists but key fields are empty, that's inconsistent
  const strValues = Object.values(entry).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const totalFields = Object.keys(entry).length;
  const populatedCount = Object.values(entry).filter((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim().length === 0) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;

  // Penalize entries that are very sparsely populated
  if (totalFields > 3 && populatedCount / totalFields < 0.3) {
    score -= 10;
    issues.push("sparse_data");
  }

  // Check if string values are all very short (< 10 chars) - suggests placeholder data
  if (strValues.length > 2) {
    const allShort = strValues.every((s) => s.length < 10);
    if (allShort) {
      score -= 5;
      issues.push("possibly_placeholder_data");
    }
  }

  return Math.max(0, score);
}

/**
 * Freshness factor (0-25): based on updated_at timestamp.
 */
function scoreFreshness(updatedAt: string | null): number {
  if (!updatedAt) return 5;

  const age = Date.now() - new Date(updatedAt).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  if (age < sevenDays) return 25;
  if (age < thirtyDays) return 20;
  if (age < ninetyDays) return 15;
  return 5;
}

/**
 * Specificity factor (0-25): are values specific or generic?
 * Checks string length, presence of numbers/metrics, absence of vague words.
 */
function scoreSpecificity(entry: Record<string, unknown>): number {
  let score = 15; // Base score

  const strValues = Object.values(entry).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );

  if (strValues.length === 0) return 5;

  // Longer descriptions = more specific (up to +5)
  const avgLength =
    strValues.reduce((sum, s) => sum + s.length, 0) / strValues.length;
  if (avgLength > 100) score += 5;
  else if (avgLength > 50) score += 3;
  else if (avgLength > 20) score += 1;

  // Presence of numbers/metrics = more specific (+3)
  const hasNumbers = strValues.some((s) => /\d/.test(s));
  if (hasNumbers) score += 3;

  // Penalize vague language (-2 per vague word found, max -8)
  let vaguePenalty = 0;
  for (const str of strValues) {
    const lower = str.toLowerCase();
    for (const word of VAGUE_WORDS) {
      if (lower.includes(word)) {
        vaguePenalty += 2;
        break; // Only penalize once per string
      }
    }
  }
  score -= Math.min(vaguePenalty, 8);

  return Math.max(0, Math.min(25, score));
}

/**
 * Identify quality issues for an entry.
 */
function identifyIssues(
  entry: Record<string, unknown>,
  expectedFields: string[]
): string[] {
  const issues: string[] = [];

  // Missing critical fields
  const missing = expectedFields.filter((f) => {
    const val = entry[f];
    return (
      val === null ||
      val === undefined ||
      (typeof val === "string" && val.trim().length === 0) ||
      (Array.isArray(val) && val.length === 0)
    );
  });
  if (missing.length > 0) {
    issues.push(`missing_fields: ${missing.join(", ")}`);
  }

  // Very short string values
  const shortStrings = Object.entries(entry).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0 && v.trim().length < 10
  );
  if (shortStrings.length > 0) {
    issues.push(
      `short_values: ${shortStrings.map(([k]) => k).join(", ")}`
    );
  }

  return issues;
}

// ── Layer-specific scoring ──

interface LayerScorer {
  (
    data: Record<string, unknown>,
    updatedAt: string | null
  ): { overall: number; entries: EntryQualityScore[] };
}

/**
 * Score a scalar layer (the entire data object is one entry).
 */
function scoreScalarLayer(
  layer: ContextLayer,
  data: Record<string, unknown>,
  updatedAt: string | null
): { overall: number; entries: EntryQualityScore[] } {
  const expectedFields = EXPECTED_FIELDS[layer];
  const completeness = scoreCompleteness(data, expectedFields);
  const consistency = scoreConsistency(data);
  const freshness = scoreFreshness(updatedAt);
  const specificity = scoreSpecificity(data);
  const score = completeness + consistency + freshness + specificity;
  const issues = identifyIssues(data, expectedFields);

  return {
    overall: score,
    entries: [
      {
        layer,
        field: layer,
        score,
        factors: { completeness, consistency, freshness, specificity },
        issues,
      },
    ],
  };
}

/**
 * Score an array layer (each array item is scored individually).
 */
function scoreArrayLayer(
  layer: ContextLayer,
  data: Record<string, unknown>,
  arrayField: string,
  updatedAt: string | null
): { overall: number; entries: EntryQualityScore[] } {
  const items = data[arrayField] as Record<string, unknown>[] | undefined;
  if (!items || items.length === 0) {
    return { overall: 0, entries: [] };
  }

  const expectedFields = EXPECTED_FIELDS[layer];
  const entries: EntryQualityScore[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const completeness = scoreCompleteness(item, expectedFields);
    const consistency = scoreConsistency(item);
    const freshness = scoreFreshness(updatedAt);
    const specificity = scoreSpecificity(item);
    const score = completeness + consistency + freshness + specificity;
    const issues = identifyIssues(item, expectedFields);

    const name = String(item.name ?? item.topic ?? item.angle ?? `${arrayField}[${i}]`);

    entries.push({
      layer,
      field: name,
      score,
      factors: { completeness, consistency, freshness, specificity },
      issues,
    });
  }

  const overall =
    entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + e.score, 0) / entries.length)
      : 0;

  return { overall, entries };
}

const LAYER_SCORERS: Record<ContextLayer, LayerScorer> = {
  org: (data, updatedAt) => scoreScalarLayer("org", data, updatedAt),
  products: (data, updatedAt) =>
    scoreArrayLayer("products", data, "products", updatedAt),
  voice: (data, updatedAt) => scoreScalarLayer("voice", data, updatedAt),
  customers: (data, updatedAt) =>
    scoreArrayLayer("customers", data, "personas", updatedAt),
  narrative: (data, updatedAt) =>
    scoreScalarLayer("narrative", data, updatedAt),
  competitive: (data, updatedAt) =>
    scoreArrayLayer("competitive", data, "competitors", updatedAt),
  market: (data, updatedAt) =>
    scoreArrayLayer("market", data, "trends", updatedAt),
  brand: (data, updatedAt) => scoreScalarLayer("brand", data, updatedAt),
};

// ── Public API ──

/**
 * Score the quality of entries in a single context layer.
 */
export async function scoreLayerQuality(
  admin: SupabaseClient,
  accountId: string,
  layer: ContextLayer
): Promise<{ overall: number; entries: EntryQualityScore[] }> {
  const tableName = `kinetiks_context_${layer}`;

  const { data: row, error } = await admin
    .from(tableName)
    .select("data, updated_at")
    .eq("account_id", accountId)
    .single();

  if (error || !row) {
    return { overall: 0, entries: [] };
  }

  const data = row.data as Record<string, unknown> | null;
  if (!data || Object.keys(data).length === 0) {
    return { overall: 0, entries: [] };
  }

  const scorer = LAYER_SCORERS[layer];
  return scorer(data, row.updated_at as string | null);
}

/**
 * Score quality for all context layers of an account.
 */
export async function scoreAllQuality(
  admin: SupabaseClient,
  accountId: string
): Promise<QualityScoreResult> {
  const results = await Promise.all(
    CONTEXT_LAYERS.map(async (layer) => {
      const score = await scoreLayerQuality(admin, accountId, layer);
      return { layer, score };
    })
  );

  const layerScores: QualityScoreResult["layer_scores"] = {};
  let weightedSum = 0;

  for (const { layer, score } of results) {
    if (score.entries.length > 0 || score.overall > 0) {
      layerScores[layer] = score;
    }
    weightedSum += score.overall * LAYER_WEIGHTS[layer];
  }

  const result: QualityScoreResult = {
    account_id: accountId,
    layer_scores: layerScores,
    aggregate_quality: Math.round(weightedSum),
  };

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "archivist_quality_score",
    source_operator: "archivist",
    detail: {
      aggregate_quality: result.aggregate_quality,
      layer_overalls: Object.fromEntries(
        results.map(({ layer, score }) => [layer, score.overall])
      ),
      timestamp: new Date().toISOString(),
    },
  });

  return result;
}
