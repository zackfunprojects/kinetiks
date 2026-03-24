/**
 * Archivist gap detection engine.
 *
 * Identifies empty layers, thin layers (key fields missing), and stale data.
 * Generates human-readable suggestions with estimated confidence impact.
 * Creates escalate proposals for stale data so users are prompted to review.
 */

import type { ContextLayer } from "@kinetiks/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { submitProposal } from "@/lib/cartographer/submit";
import type { GapFinding, GapDetectResult } from "./types";

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
 * Per-layer weights for estimated impact calculation.
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
 * Expected fields per layer - a layer is "thin" if key fields are missing.
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
  voice: ["tone", "vocabulary", "messaging_patterns", "writing_samples", "calibration_data"],
  customers: ["personas", "demographics", "analytics_data"],
  narrative: ["origin_story", "founder_thesis", "why_now", "brand_arc", "validated_angles"],
  competitive: ["competitors", "positioning_gaps", "differentiation_vectors"],
  market: ["trends", "media_sentiment", "llm_representation"],
  brand: ["colors", "typography", "tokens", "imagery", "motion", "accessibility"],
};

/**
 * Human-readable suggestions for each layer when empty.
 */
const EMPTY_LAYER_SUGGESTIONS: Record<ContextLayer, string> = {
  org: "Add your company details - name, industry, and stage - to ground all AI outputs in your reality",
  products: "Describe your products so the system can speak accurately about what you offer",
  voice: "Upload writing samples or complete voice calibration so content sounds like you, not AI",
  customers: "Define your customer personas so targeting is precise across all apps",
  narrative: "Share your origin story and key angles to power PR and content narratives",
  competitive: "Identify your competitors so positioning and differentiation are data-driven",
  market: "Connect analytics or describe market trends to keep intelligence current",
  brand: "Upload brand guidelines or connect your website so visual outputs match your identity",
};

/**
 * Human-readable suggestions for thin layers.
 */
const THIN_LAYER_SUGGESTIONS: Record<ContextLayer, (missing: string[]) => string> = {
  org: (missing) => `Complete your org profile - missing: ${missing.join(", ")}`,
  products: (missing) => `Add more product detail - missing: ${missing.join(", ")}`,
  voice: (missing) => `Strengthen voice data - missing: ${missing.join(", ")}`,
  customers: (missing) => `Flesh out customer data - missing: ${missing.join(", ")}`,
  narrative: (missing) => `Build out your narrative - missing: ${missing.join(", ")}`,
  competitive: (missing) => `Expand competitive intel - missing: ${missing.join(", ")}`,
  market: (missing) => `Add market context - missing: ${missing.join(", ")}`,
  brand: (missing) => `Complete brand system - missing: ${missing.join(", ")}`,
};

/** Data older than 90 days is considered stale. */
const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

/** Minimum fields required to NOT be considered thin (as a fraction of expected). */
const THIN_THRESHOLD = 0.5;

/**
 * Estimate the confidence impact of filling a gap.
 */
function estimateImpact(layer: ContextLayer, severity: "empty" | "thin" | "stale"): string {
  const weight = LAYER_WEIGHTS[layer];
  // Empty layer: filling it could add up to weight * 100 points to aggregate
  // Thin: about half that. Stale: refreshing restores recency points.
  let impactPoints: number;

  switch (severity) {
    case "empty":
      impactPoints = Math.round(weight * 80);
      break;
    case "thin":
      impactPoints = Math.round(weight * 40);
      break;
    case "stale":
      impactPoints = Math.round(weight * 15);
      break;
  }

  return `+${impactPoints}% confidence`;
}

/**
 * Check if a field value is populated (non-null, non-empty).
 */
function isPopulated(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "string" && val.trim().length === 0) return false;
  if (Array.isArray(val) && val.length === 0) return false;
  if (
    typeof val === "object" &&
    !Array.isArray(val) &&
    Object.keys(val as Record<string, unknown>).length === 0
  )
    return false;
  return true;
}

// ── Public API ──

/**
 * Detect gaps in the Context Structure for an account.
 * Checks for empty layers, thin layers, and stale data.
 * Creates escalate proposals for stale data.
 */
export async function detectGaps(
  admin: SupabaseClient,
  accountId: string
): Promise<GapDetectResult> {
  const findings: GapFinding[] = [];
  let proposalsCreated = 0;
  const now = Date.now();

  // Query all layers in parallel
  const layerResults = await Promise.all(
    CONTEXT_LAYERS.map(async (layer) => {
      const tableName = `kinetiks_context_${layer}`;
      const { data: row, error } = await admin
        .from(tableName)
        .select("data, updated_at")
        .eq("account_id", accountId)
        .single();
      return { layer, row, error };
    })
  );

  for (const { layer, row, error } of layerResults) {
    const expectedFields = EXPECTED_FIELDS[layer];

    // Case 0: Query error - log and treat as empty (PGRST116 = no rows, expected)
    if (error && error.code !== "PGRST116") {
      console.error(
        `[archivist/gap-detect] Failed to query kinetiks_context_${layer} for account ${accountId}:`,
        error.message
      );
    }

    // Case 1: No row or empty data - empty layer
    if (error || !row) {
      findings.push({
        layer,
        severity: "empty",
        missing_fields: expectedFields,
        suggestion: EMPTY_LAYER_SUGGESTIONS[layer],
        estimated_impact: estimateImpact(layer, "empty"),
      });
      continue;
    }

    const data = row.data as Record<string, unknown> | null;
    if (!data || Object.keys(data).length === 0) {
      findings.push({
        layer,
        severity: "empty",
        missing_fields: expectedFields,
        suggestion: EMPTY_LAYER_SUGGESTIONS[layer],
        estimated_impact: estimateImpact(layer, "empty"),
      });
      continue;
    }

    // Case 2: Check for thin layer
    const missingFields = expectedFields.filter((f) => !isPopulated(data[f]));
    const populatedRatio =
      (expectedFields.length - missingFields.length) / expectedFields.length;

    if (populatedRatio < THIN_THRESHOLD && missingFields.length > 0) {
      findings.push({
        layer,
        severity: "thin",
        missing_fields: missingFields,
        suggestion: THIN_LAYER_SUGGESTIONS[layer](missingFields),
        estimated_impact: estimateImpact(layer, "thin"),
      });
    }

    // Case 3: Check for stale data
    const updatedAt = row.updated_at as string | null;
    if (updatedAt) {
      const age = now - new Date(updatedAt).getTime();
      if (age > STALE_THRESHOLD_MS) {
        findings.push({
          layer,
          severity: "stale",
          missing_fields: [],
          suggestion: `Your ${layer} data hasn't been updated in ${Math.round(age / (24 * 60 * 60 * 1000))} days - review for accuracy`,
          estimated_impact: estimateImpact(layer, "stale"),
        });

        // Create an escalate proposal for stale data
        try {
          await submitProposal(admin, {
            account_id: accountId,
            source_app: "kinetiks_id",
            source_operator: "archivist_gap_detect",
            target_layer: layer,
            action: "escalate",
            confidence: "inferred",
            payload: {
              _stale_review: true,
              layer,
              last_updated: updatedAt,
              days_stale: Math.round(age / (24 * 60 * 60 * 1000)),
            },
            evidence: [
              {
                type: "metric" as const,
                value: `${Math.round(age / (24 * 60 * 60 * 1000))} days since last update`,
                context: "Data freshness check by Archivist",
                date: new Date().toISOString(),
              },
            ],
            expires_at: null,
          });
          proposalsCreated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(
            `[archivist/gap-detect] Failed to create stale review proposal for ${layer}:`,
            message
          );
        }
      }
    }
  }

  // Log findings to ledger
  if (findings.length > 0) {
    const { error: ledgerErr } = await admin.from("kinetiks_ledger").insert({
      account_id: accountId,
      event_type: "archivist_gap_detect",
      source_operator: "archivist",
      detail: {
        findings_count: findings.length,
        empty_count: findings.filter((f) => f.severity === "empty").length,
        thin_count: findings.filter((f) => f.severity === "thin").length,
        stale_count: findings.filter((f) => f.severity === "stale").length,
        proposals_created: proposalsCreated,
        timestamp: new Date().toISOString(),
      },
    });
    if (ledgerErr) {
      console.error(
        `[archivist/gap-detect] Ledger insert failed for account ${accountId}:`,
        ledgerErr.message
      );
    }
  }

  return {
    account_id: accountId,
    findings,
    proposals_created: proposalsCreated,
  };
}
