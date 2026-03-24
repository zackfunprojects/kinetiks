/**
 * JSON Schemas for each Context Structure layer.
 * Published at GET /api/context/schema.
 * Derived from the canonical layer shapes in CLAUDE.md and packages/types.
 */

import type { ContextLayer } from "@kinetiks/types";

/**
 * A typed subset of JSON Schema used by layer definitions.
 * Covers: type unions, properties, additionalProperties, required,
 * enum, items (for arrays), and numeric bounds (minimum/maximum).
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  description?: string;
  /** Allow vendor-specific keys that don't map to known fields. */
  [key: string]: unknown;
}

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

// ---------------------------------------------------------------------------
// Recursive validator
// ---------------------------------------------------------------------------

/**
 * Determine the JSON-typeof a value, using JSON Schema type names.
 * Returns "null" for null, "array" for arrays, and typeof otherwise.
 */
function jsonTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "string" | "number" | "boolean" | "object" | "undefined"
}

/**
 * Check whether `value` matches the given type specifier.
 * `schemaType` can be a single string ("string") or a union array (["string", "null"]).
 */
function matchesType(value: unknown, schemaType: string | string[]): boolean {
  const actual = jsonTypeOf(value);
  if (Array.isArray(schemaType)) {
    return schemaType.includes(actual);
  }
  return actual === schemaType;
}

/**
 * Recursively validate a value against a JsonSchema node.
 * Returns null when valid, or a string describing the first error.
 *
 * @param value  - the runtime value to validate
 * @param schema - the JsonSchema node describing the expected shape
 * @param path   - dot-separated path used in error messages (e.g. "tone.formality")
 */
function validateNode(
  value: unknown,
  schema: JsonSchema,
  path: string
): string | null {
  // --- type check (supports unions like ["string", "null"]) ---
  if (schema.type !== undefined) {
    if (!matchesType(value, schema.type)) {
      const expected = Array.isArray(schema.type)
        ? schema.type.join(" | ")
        : schema.type;
      return `${path}: expected ${expected}, got ${jsonTypeOf(value)}`;
    }
  }

  // If the value is null and the type allows it, nothing more to check
  if (value === null) return null;

  // --- enum ---
  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value)) {
      const allowed = schema.enum.map((v) => JSON.stringify(v)).join(", ");
      return `${path}: value ${JSON.stringify(value)} not in enum [${allowed}]`;
    }
  }

  // --- numeric bounds ---
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      return `${path}: ${value} is below minimum ${schema.minimum}`;
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return `${path}: ${value} exceeds maximum ${schema.maximum}`;
    }
  }

  // --- object: properties, additionalProperties, required ---
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    // required fields
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in obj)) {
          return `${path}: missing required key "${req}"`;
        }
      }
    }

    if (schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));

      // additionalProperties check
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(obj)) {
          if (!allowedKeys.has(key)) {
            return `${path}: unknown key "${key}"`;
          }
        }
      }

      // recurse into each declared property that is present
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const err = validateNode(obj[key], propSchema, `${path}.${key}`);
          if (err) return err;
        }
      }
    }
  }

  // --- array: items ---
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const err = validateNode(
        value[i],
        schema.items,
        `${path}[${i}]`
      );
      if (err) return err;
    }
  }

  return null;
}

/**
 * Validate a layer payload against its CONTEXT_SCHEMAS definition.
 * Performs recursive JSON-Schema-like validation including: type unions,
 * nested properties, additionalProperties, required, enum, numeric bounds,
 * and array items.
 *
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

  return validateNode(payload, schema, layer);
}
