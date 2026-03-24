/**
 * Lightweight context layer data validator.
 *
 * Validates that user-submitted data for a context layer only contains
 * recognized fields with expected types. Does not require all fields
 * (layers are built incrementally), but rejects unknown keys and
 * wrong value types to prevent garbage data from entering the DB.
 */

import type { ContextLayer } from "@kinetiks/types";

type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "string|null"
  | "number|null"
  | "object|null";

interface FieldSpec {
  type: FieldType;
}

type LayerSchema = Record<string, FieldSpec>;

const ORG_SCHEMA: LayerSchema = {
  company_name: { type: "string" },
  legal_entity: { type: "string|null" },
  industry: { type: "string" },
  sub_industry: { type: "string|null" },
  stage: { type: "string" },
  founded_year: { type: "number|null" },
  geography: { type: "string" },
  team_size: { type: "string|null" },
  funding_status: { type: "string|null" },
  website: { type: "string" },
  description: { type: "string" },
};

const PRODUCTS_SCHEMA: LayerSchema = {
  products: { type: "array" },
};

const VOICE_SCHEMA: LayerSchema = {
  tone: { type: "object" },
  vocabulary: { type: "object" },
  messaging_patterns: { type: "array" },
  writing_samples: { type: "array" },
  calibration_data: { type: "array" },
  platform_variants: { type: "object" },
};

const CUSTOMERS_SCHEMA: LayerSchema = {
  personas: { type: "array" },
  demographics: { type: "object" },
  analytics_data: { type: "object" },
};

const NARRATIVE_SCHEMA: LayerSchema = {
  origin_story: { type: "string|null" },
  founder_thesis: { type: "string|null" },
  why_now: { type: "string|null" },
  brand_arc: { type: "string|null" },
  validated_angles: { type: "array" },
  media_positioning: { type: "string|null" },
};

const COMPETITIVE_SCHEMA: LayerSchema = {
  competitors: { type: "array" },
  positioning_gaps: { type: "array" },
  differentiation_vectors: { type: "array" },
};

const MARKET_SCHEMA: LayerSchema = {
  trends: { type: "array" },
  media_sentiment: { type: "object|null" },
  llm_representation: { type: "object|null" },
  seasonal_patterns: { type: "array" },
  regulatory_signals: { type: "array" },
};

const BRAND_SCHEMA: LayerSchema = {
  colors: { type: "object" },
  typography: { type: "object" },
  tokens: { type: "object" },
  imagery: { type: "object" },
  motion: { type: "object" },
  modes: { type: "object" },
  accessibility: { type: "object" },
  logo: { type: "object" },
  social_visual_id: { type: "object" },
};

const LAYER_SCHEMAS: Record<ContextLayer, LayerSchema> = {
  org: ORG_SCHEMA,
  products: PRODUCTS_SCHEMA,
  voice: VOICE_SCHEMA,
  customers: CUSTOMERS_SCHEMA,
  narrative: NARRATIVE_SCHEMA,
  competitive: COMPETITIVE_SCHEMA,
  market: MARKET_SCHEMA,
  brand: BRAND_SCHEMA,
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function checkFieldType(value: unknown, spec: FieldType): boolean {
  if (value === null) {
    return spec.endsWith("|null");
  }

  const baseType = spec.replace("|null", "");

  switch (baseType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Validate context layer data against the expected schema.
 * Allows partial data (missing fields are fine) but rejects
 * unknown fields and wrong value types.
 */
export function validateLayerData(
  layer: ContextLayer,
  data: Record<string, unknown>
): ValidationResult {
  const schema = LAYER_SCHEMAS[layer];
  const errors: string[] = [];

  // Check for unknown fields
  for (const key of Object.keys(data)) {
    if (!(key in schema)) {
      errors.push(`Unknown field "${key}" for ${layer} layer`);
    }
  }

  // Check types of provided fields
  for (const [key, value] of Object.entries(data)) {
    const spec = schema[key];
    if (!spec) continue; // already reported as unknown

    if (!checkFieldType(value, spec.type)) {
      const expected = spec.type;
      const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      errors.push(`Field "${key}" expected ${expected}, got ${actual}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
