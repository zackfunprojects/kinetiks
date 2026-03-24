/**
 * JSON Schemas for each Context Structure layer.
 * Published at GET /api/context/schema.
 * Derived from the canonical layer shapes in CLAUDE.md and packages/types.
 */

import type { ContextLayer } from "@kinetiks/types";

type JsonSchema = Record<string, unknown>;

const ORG_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    legal_entity: { type: ["string", "null"] },
    industry: { type: "string" },
    sub_industry: { type: ["string", "null"] },
    stage: { type: "string", enum: ["pre-revenue", "early", "growth", "scale"] },
    founded_year: { type: ["number", "null"] },
    geography: { type: "string" },
    team_size: { type: ["string", "null"] },
    funding_status: { type: ["string", "null"] },
    website: { type: "string" },
    description: { type: "string" },
  },
  additionalProperties: false,
};

const PRODUCTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          value_prop: { type: "string" },
          pricing_model: { type: "string", enum: ["free", "freemium", "paid", "enterprise"] },
          pricing_detail: { type: ["string", "null"] },
          features: { type: "array", items: { type: "string" } },
          differentiators: { type: "array", items: { type: "string" } },
          target_persona: { type: ["string", "null"] },
        },
      },
    },
  },
  additionalProperties: false,
};

const VOICE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    tone: {
      type: "object",
      properties: {
        formality: { type: "number", minimum: 0, maximum: 100 },
        warmth: { type: "number", minimum: 0, maximum: 100 },
        humor: { type: "number", minimum: 0, maximum: 100 },
        authority: { type: "number", minimum: 0, maximum: 100 },
      },
    },
    vocabulary: {
      type: "object",
      properties: {
        jargon_level: { type: "string", enum: ["none", "light", "moderate", "heavy"] },
        sentence_complexity: { type: "string", enum: ["simple", "moderate", "complex"] },
      },
    },
    messaging_patterns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          context: { type: "string" },
          pattern: { type: "string" },
          performance: { type: ["string", "null"] },
        },
      },
    },
    writing_samples: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string" },
          text: { type: "string" },
          type: { type: "string", enum: ["own", "aspirational"] },
        },
      },
    },
    calibration_data: { type: "array" },
    platform_variants: { type: "object" },
  },
  additionalProperties: false,
};

const CUSTOMERS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    personas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: ["string", "null"] },
          company_type: { type: ["string", "null"] },
          pain_points: { type: "array", items: { type: "string" } },
          buying_triggers: { type: "array", items: { type: "string" } },
          objections: { type: "array", items: { type: "string" } },
          conversion_signals: { type: "array", items: { type: "string" } },
        },
      },
    },
    demographics: { type: "object" },
    analytics_data: { type: "object" },
  },
  additionalProperties: false,
};

const NARRATIVE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    origin_story: { type: ["string", "null"] },
    founder_thesis: { type: ["string", "null"] },
    why_now: { type: ["string", "null"] },
    brand_arc: { type: ["string", "null"] },
    validated_angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          angle: { type: "string" },
          validation_source: { type: "string" },
          performance: { type: ["string", "null"] },
        },
      },
    },
    media_positioning: { type: ["string", "null"] },
  },
  additionalProperties: false,
};

const COMPETITIVE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          website: { type: ["string", "null"] },
          positioning: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          narrative_territory: { type: ["string", "null"] },
          last_activity: { type: "object" },
        },
      },
    },
    positioning_gaps: { type: "array", items: { type: "string" } },
    differentiation_vectors: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

const MARKET_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          direction: { type: "string", enum: ["rising", "falling", "stable", "emerging"] },
          relevance: { type: "string", enum: ["direct", "adjacent", "background"] },
        },
      },
    },
    media_sentiment: { type: ["object", "null"] },
    llm_representation: { type: ["object", "null"] },
    seasonal_patterns: { type: "array" },
    regulatory_signals: { type: "array" },
  },
  additionalProperties: false,
};

const BRAND_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    colors: { type: "object" },
    typography: { type: "object" },
    tokens: { type: "object" },
    imagery: { type: "object" },
    motion: { type: "object" },
    modes: { type: "object" },
    accessibility: { type: "object" },
    logo: { type: "object" },
    social_visual_id: { type: "object" },
  },
  additionalProperties: false,
};

export const CONTEXT_SCHEMAS: Record<ContextLayer, JsonSchema> = {
  org: ORG_SCHEMA,
  products: PRODUCTS_SCHEMA,
  voice: VOICE_SCHEMA,
  customers: CUSTOMERS_SCHEMA,
  narrative: NARRATIVE_SCHEMA,
  competitive: COMPETITIVE_SCHEMA,
  market: MARKET_SCHEMA,
  brand: BRAND_SCHEMA,
};

/**
 * Lightweight runtime validator for a layer payload against its schema.
 * Checks top-level keys against the schema's allowed properties and
 * rejects unknown keys when additionalProperties is false.
 * Returns null if valid, or a string describing the first error found.
 */
export function validateLayerPayload(
  layer: ContextLayer,
  payload: Record<string, unknown>
): string | null {
  const schema = CONTEXT_SCHEMAS[layer];
  if (!schema) return `Unknown layer: ${layer}`;

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "Payload must be a plain object";
  }

  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  if (!properties) return null;

  const allowedKeys = new Set(Object.keys(properties));

  // Reject unknown top-level keys when schema disallows them
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(payload)) {
      if (!allowedKeys.has(key)) {
        return `Unknown key "${key}" for layer "${layer}"`;
      }
    }
  }

  // Validate types for present keys
  for (const [key, value] of Object.entries(payload)) {
    const propSchema = properties[key];
    if (!propSchema) continue;

    const expectedType = propSchema.type;
    if (!expectedType) continue;

    if (expectedType === "array" && !Array.isArray(value)) {
      return `"${key}" must be an array`;
    }
    if (expectedType === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
      return `"${key}" must be an object`;
    }
    if (expectedType === "number" && typeof value !== "number") {
      return `"${key}" must be a number`;
    }
    if (expectedType === "string" && typeof value !== "string") {
      return `"${key}" must be a string`;
    }
  }

  return null;
}
