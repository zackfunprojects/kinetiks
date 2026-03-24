/**
 * Archivist deduplication engine.
 *
 * Detects and removes duplicate entries within array-type fields in each
 * context layer. Uses fuzzy string matching (normalized Levenshtein) for
 * name-based fields and exact JSON matching for content-based fields.
 */

import type { ContextLayer } from "@kinetiks/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DedupResult } from "./types";

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
 * Similarity threshold for fuzzy name matching.
 * Items with similarity >= this value are considered duplicates.
 */
const SIMILARITY_THRESHOLD = 0.85;

// ── String similarity ──

/**
 * Calculate normalized Levenshtein similarity between two strings (0-1).
 * 1.0 = identical, 0.0 = completely different.
 */
function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const maxLen = Math.max(s1.length, s2.length);

  // Optimization: if length difference is too large, skip expensive computation
  if (Math.abs(s1.length - s2.length) / maxLen > 1 - SIMILARITY_THRESHOLD) {
    return 0;
  }

  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Levenshtein edit distance between two strings.
 * Uses the iterative matrix approach with O(min(m,n)) space.
 */
function levenshteinDistance(s1: string, s2: string): number {
  // Ensure s1 is the shorter string for space optimization
  if (s1.length > s2.length) {
    [s1, s2] = [s2, s1];
  }

  const m = s1.length;
  const n = s2.length;

  let prevRow = new Array<number>(m + 1);
  let currRow = new Array<number>(m + 1);

  for (let j = 0; j <= m; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    currRow[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,
        prevRow[j] + 1,
        prevRow[j - 1] + cost
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[m];
}

// ── Generic dedup helpers ──

interface DedupArrayResult<T> {
  deduped: T[];
  removed: number;
}

/**
 * Deduplicate an array using a key extraction function for exact matching.
 */
function deduplicateByKey<T>(
  items: T[],
  keyFn: (item: T) => string
): DedupArrayResult<T> {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return { deduped, removed: items.length - deduped.length };
}

/**
 * Deduplicate an array using fuzzy name matching.
 * When duplicates are found, keeps the entry with more populated fields.
 */
function deduplicateByFuzzyName<T extends Record<string, unknown>>(
  items: T[],
  nameField: string
): DedupArrayResult<T> {
  if (items.length <= 1) {
    return { deduped: [...items], removed: 0 };
  }

  const kept: T[] = [];
  const removed = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (removed.has(i)) continue;

    let best = items[i];
    const name = String(best[nameField] ?? "");

    for (let j = i + 1; j < items.length; j++) {
      if (removed.has(j)) continue;

      const otherName = String(items[j][nameField] ?? "");
      if (stringSimilarity(name, otherName) >= SIMILARITY_THRESHOLD) {
        // Keep the entry with more populated fields
        const bestFieldCount = countPopulatedFields(best);
        const otherFieldCount = countPopulatedFields(items[j]);
        if (otherFieldCount > bestFieldCount) {
          best = items[j];
        }
        removed.add(j);
      }
    }

    kept.push(best);
  }

  return { deduped: kept, removed: removed.size };
}

/**
 * Count non-null, non-empty fields in an object.
 */
function countPopulatedFields(obj: Record<string, unknown>): number {
  let count = 0;
  for (const val of Object.values(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "string" && val.length === 0) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    count++;
  }
  return count;
}

// ── Layer-specific dedup strategies ──

interface LayerDedupStrategy {
  (data: Record<string, unknown>): {
    data: Record<string, unknown>;
    details: Array<{
      field: string;
      original_count: number;
      deduped_count: number;
    }>;
  };
}

const dedupProducts: LayerDedupStrategy = (data) => {
  const details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }> = [];
  const result = { ...data };

  if (Array.isArray(result.products) && result.products.length > 1) {
    const original = result.products.length;
    const { deduped } = deduplicateByFuzzyName(
      result.products as Record<string, unknown>[],
      "name"
    );
    result.products = deduped;
    if (deduped.length < original) {
      details.push({
        field: "products",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  return { data: result, details };
};

const dedupVoice: LayerDedupStrategy = (data) => {
  const details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }> = [];
  const result = { ...data };

  // Dedup writing_samples by exact text content
  if (
    Array.isArray(result.writing_samples) &&
    result.writing_samples.length > 1
  ) {
    const original = result.writing_samples.length;
    const { deduped } = deduplicateByKey(
      result.writing_samples as Array<Record<string, unknown>>,
      (s) => String(s.text ?? "").toLowerCase().trim()
    );
    result.writing_samples = deduped;
    if (deduped.length < original) {
      details.push({
        field: "writing_samples",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  // Dedup messaging_patterns by context+pattern
  if (
    Array.isArray(result.messaging_patterns) &&
    result.messaging_patterns.length > 1
  ) {
    const original = result.messaging_patterns.length;
    const { deduped } = deduplicateByKey(
      result.messaging_patterns as Array<Record<string, unknown>>,
      (p) =>
        `${String(p.context ?? "").toLowerCase().trim()}::${String(p.pattern ?? "").toLowerCase().trim()}`
    );
    result.messaging_patterns = deduped;
    if (deduped.length < original) {
      details.push({
        field: "messaging_patterns",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  return { data: result, details };
};

const dedupCustomers: LayerDedupStrategy = (data) => {
  const details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }> = [];
  const result = { ...data };

  if (Array.isArray(result.personas) && result.personas.length > 1) {
    const original = result.personas.length;
    const { deduped } = deduplicateByFuzzyName(
      result.personas as Record<string, unknown>[],
      "name"
    );
    result.personas = deduped;
    if (deduped.length < original) {
      details.push({
        field: "personas",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  return { data: result, details };
};

const dedupNarrative: LayerDedupStrategy = (data) => {
  const details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }> = [];
  const result = { ...data };

  if (
    Array.isArray(result.validated_angles) &&
    result.validated_angles.length > 1
  ) {
    const original = result.validated_angles.length;
    const { deduped } = deduplicateByFuzzyName(
      result.validated_angles as Record<string, unknown>[],
      "angle"
    );
    result.validated_angles = deduped;
    if (deduped.length < original) {
      details.push({
        field: "validated_angles",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  return { data: result, details };
};

const dedupCompetitive: LayerDedupStrategy = (data) => {
  const details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }> = [];
  const result = { ...data };

  if (Array.isArray(result.competitors) && result.competitors.length > 1) {
    const original = result.competitors.length;
    const { deduped } = deduplicateByFuzzyName(
      result.competitors as Record<string, unknown>[],
      "name"
    );
    result.competitors = deduped;
    if (deduped.length < original) {
      details.push({
        field: "competitors",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  // Dedup string arrays
  for (const field of ["positioning_gaps", "differentiation_vectors"]) {
    if (Array.isArray(result[field]) && (result[field] as unknown[]).length > 1) {
      const original = (result[field] as unknown[]).length;
      const { deduped } = deduplicateByKey(
        result[field] as string[],
        (s) => s.toLowerCase().trim()
      );
      result[field] = deduped;
      if (deduped.length < original) {
        details.push({
          field,
          original_count: original,
          deduped_count: deduped.length,
        });
      }
    }
  }

  return { data: result, details };
};

const dedupMarket: LayerDedupStrategy = (data) => {
  const details: Array<{
    field: string;
    original_count: number;
    deduped_count: number;
  }> = [];
  const result = { ...data };

  if (Array.isArray(result.trends) && result.trends.length > 1) {
    const original = result.trends.length;
    const { deduped } = deduplicateByFuzzyName(
      result.trends as Record<string, unknown>[],
      "topic"
    );
    result.trends = deduped;
    if (deduped.length < original) {
      details.push({
        field: "trends",
        original_count: original,
        deduped_count: deduped.length,
      });
    }
  }

  // Dedup string arrays
  for (const field of ["seasonal_patterns", "regulatory_signals"]) {
    if (Array.isArray(result[field]) && (result[field] as unknown[]).length > 1) {
      const original = (result[field] as unknown[]).length;
      const { deduped } = deduplicateByKey(
        result[field] as string[],
        (s) => s.toLowerCase().trim()
      );
      result[field] = deduped;
      if (deduped.length < original) {
        details.push({
          field,
          original_count: original,
          deduped_count: deduped.length,
        });
      }
    }
  }

  return { data: result, details };
};

/**
 * No-op dedup for layers without array fields (org, brand).
 */
const dedupNoop: LayerDedupStrategy = (data) => ({
  data,
  details: [],
});

const LAYER_DEDUP_STRATEGIES: Record<ContextLayer, LayerDedupStrategy> = {
  org: dedupNoop,
  products: dedupProducts,
  voice: dedupVoice,
  customers: dedupCustomers,
  narrative: dedupNarrative,
  competitive: dedupCompetitive,
  market: dedupMarket,
  brand: dedupNoop,
};

// ── Public API ──

/**
 * Deduplicate entries in a single context layer for an account.
 */
export async function deduplicateLayer(
  admin: SupabaseClient,
  accountId: string,
  layer: ContextLayer
): Promise<DedupResult> {
  const tableName = `kinetiks_context_${layer}`;

  const { data: row, error } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", accountId)
    .single();

  if (error || !row) {
    return { layer, duplicates_found: 0, duplicates_removed: 0, details: [] };
  }

  const data = row.data as Record<string, unknown> | null;
  if (!data || Object.keys(data).length === 0) {
    return { layer, duplicates_found: 0, duplicates_removed: 0, details: [] };
  }

  const strategy = LAYER_DEDUP_STRATEGIES[layer];
  const { data: deduped, details } = strategy(data);

  const totalRemoved = details.reduce(
    (sum, d) => sum + (d.original_count - d.deduped_count),
    0
  );

  if (totalRemoved === 0) {
    return { layer, duplicates_found: 0, duplicates_removed: 0, details: [] };
  }

  // Write back deduped data
  const { error: updateError } = await admin
    .from(tableName)
    .update({
      data: deduped,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId);

  if (updateError) {
    console.error(
      `[archivist/dedup] Failed to update ${tableName} for account ${accountId}:`,
      updateError.message
    );
    return { layer, duplicates_found: 0, duplicates_removed: 0, details: [] };
  }

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "archivist_dedup",
    source_operator: "archivist",
    target_layer: layer,
    detail: {
      duplicates_found: totalRemoved,
      duplicates_removed: totalRemoved,
      details,
      timestamp: new Date().toISOString(),
    },
  });

  return {
    layer,
    duplicates_found: totalRemoved,
    duplicates_removed: totalRemoved,
    details,
  };
}

/**
 * Deduplicate all context layers for an account.
 */
export async function deduplicateAllLayers(
  admin: SupabaseClient,
  accountId: string
): Promise<DedupResult[]> {
  const results = await Promise.all(
    CONTEXT_LAYERS.map((layer) => deduplicateLayer(admin, accountId, layer))
  );
  return results;
}
