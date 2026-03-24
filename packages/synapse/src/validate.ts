import type { ContextLayer } from "@kinetiks/types";

/**
 * Valid fields per Context Structure layer. Mirrors the server-side
 * LAYER_FIELDS in the Cortex evaluation pipeline for client-side fast-fail.
 */
const LAYER_FIELDS: Record<ContextLayer, string[]> = {
  org: [
    "company_name",
    "industry",
    "stage",
    "geography",
    "website",
    "description",
    "legal_entity",
    "sub_industry",
    "founded_year",
    "team_size",
    "funding_status",
  ],
  products: ["products"],
  voice: [
    "tone",
    "vocabulary",
    "messaging_patterns",
    "writing_samples",
    "calibration_data",
    "platform_variants",
  ],
  customers: ["personas", "demographics", "analytics_data"],
  narrative: [
    "origin_story",
    "founder_thesis",
    "why_now",
    "brand_arc",
    "validated_angles",
    "media_positioning",
  ],
  competitive: ["competitors", "positioning_gaps", "differentiation_vectors"],
  market: [
    "trends",
    "media_sentiment",
    "llm_representation",
    "seasonal_patterns",
    "regulatory_signals",
  ],
  brand: [
    "colors",
    "typography",
    "tokens",
    "imagery",
    "motion",
    "modes",
    "accessibility",
    "logo",
    "social_visual_id",
  ],
};

export interface PayloadValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that a proposal payload contains at least one recognized field
 * for the target layer, and no unknown fields.
 *
 * Use this client-side before submitting to avoid a round-trip that will
 * be rejected by the Cortex schema validation step.
 */
export function validateProposalPayload(
  targetLayer: ContextLayer,
  payload: Record<string, unknown>
): PayloadValidation {
  const errors: string[] = [];

  // Guard against null, arrays, and non-objects
  if (
    payload === null ||
    payload === undefined ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    errors.push("Payload must be a plain object");
    return { valid: false, errors };
  }

  const validFields = LAYER_FIELDS[targetLayer];

  if (!validFields) {
    errors.push(`Unknown target layer: ${targetLayer}`);
    return { valid: false, errors };
  }

  const payloadKeys = Object.keys(payload);

  if (payloadKeys.length === 0) {
    errors.push("Payload must not be empty");
    return { valid: false, errors };
  }

  const unknownFields = payloadKeys.filter((k) => !validFields.includes(k));
  if (unknownFields.length > 0) {
    errors.push(
      `Unknown fields for '${targetLayer}' layer: ${unknownFields.join(", ")}. Allowed: ${validFields.join(", ")}`
    );
  }

  const hasValidField = payloadKeys.some((k) => validFields.includes(k));
  if (!hasValidField) {
    errors.push(
      `No valid fields for '${targetLayer}' layer. Allowed: ${validFields.join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check that all requested layers are within the allowed set.
 * Returns the list of unauthorized layers, or an empty array if all are allowed.
 */
export function validateLayers(
  requested: ContextLayer[],
  allowed: ContextLayer[]
): ContextLayer[] {
  return requested.filter((layer) => !allowed.includes(layer));
}
