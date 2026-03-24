/**
 * Archivist normalization engine.
 *
 * Ensures consistent formatting across all Context Structure layers:
 * trims strings, normalizes URLs, validates enums, clamps numeric ranges,
 * and fills default values for optional array fields.
 */

import type { ContextLayer } from "@kinetiks/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizeResult } from "./types";

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

// ── Enum validation sets ──

const VALID_STAGES = ["pre-revenue", "early", "growth", "scale"];
const VALID_PRICING_MODELS = ["free", "freemium", "paid", "enterprise"];
const VALID_JARGON_LEVELS = ["none", "light", "moderate", "heavy"];
const VALID_SENTENCE_COMPLEXITY = ["simple", "moderate", "complex"];
const VALID_TREND_DIRECTIONS = ["rising", "falling", "stable", "emerging"];
const VALID_TREND_RELEVANCE = ["direct", "adjacent", "background"];
const VALID_SENTIMENT = ["positive", "neutral", "negative"];
const VALID_BORDER_RADIUS = ["sharp", "subtle", "rounded", "pill"];
const VALID_ELEVATION = ["flat", "subtle", "layered"];
const VALID_DENSITY = ["tight", "balanced", "airy"];
const VALID_IMAGE_STYLE = [
  "photography",
  "illustration",
  "3d",
  "abstract",
  "mixed",
];
const VALID_IMAGE_TREATMENT = ["warm", "cool", "neutral"];
const VALID_IMAGE_SUBJECT = ["human", "product", "abstract", "lifestyle"];
const VALID_MOTION_LEVEL = ["none", "subtle", "expressive"];
const VALID_TRANSITION_SPEED = ["fast", "medium", "deliberate"];
const VALID_WCAG_LEVEL = ["AA", "AAA"];

// ── Utility functions ──

/**
 * Recursively trim all string values in an object.
 */
function trimStrings(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      result[key] = val.trim();
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return trimStrings(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof val === "object" && val !== null) {
      result[key] = trimStrings(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Normalize a URL: ensure https protocol, lowercase hostname, strip trailing slash.
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized) return normalized;

  // Add protocol if missing
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    parsed.hostname = parsed.hostname.toLowerCase();
    // Remove trailing slash from pathname
    if (parsed.pathname === "/") {
      return `${parsed.protocol}//${parsed.host}`;
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    // If URL parsing fails, return trimmed original
    return normalized;
  }
}

/**
 * Validate an enum value. Returns the value if valid, or the first valid value
 * as default. Returns the change description if a correction was made.
 */
function normalizeEnum(
  value: unknown,
  validValues: string[]
): { value: string; changed: boolean } {
  if (typeof value === "string" && validValues.includes(value)) {
    return { value, changed: false };
  }
  // Try case-insensitive match
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    const match = validValues.find((v) => v.toLowerCase() === lower);
    if (match) {
      return { value: match, changed: match !== value };
    }
  }
  return { value: validValues[0], changed: true };
}

/**
 * Clamp a number to a range.
 */
function clamp(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate a hex color code. Returns corrected value or null if invalid.
 */
function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let hex = value.trim();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  // Accept 3 or 6 char hex
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    // Expand shorthand
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toLowerCase();
  }
  return null;
}

/**
 * Remove empty strings from a string array.
 */
function filterEmptyStrings(arr: unknown[]): string[] {
  return arr.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

/**
 * Title-case a string.
 */
function titleCase(str: string): string {
  return str
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}

// ── Layer-specific normalization ──

interface LayerNormalizer {
  (data: Record<string, unknown>): {
    data: Record<string, unknown>;
    changes: Array<{ field: string; change: string }>;
  };
}

const normalizeOrg: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  // Title-case company_name
  if (typeof result.company_name === "string") {
    const original = result.company_name;
    result.company_name = titleCase(original);
    if (result.company_name !== original) {
      changes.push({ field: "company_name", change: "title-cased" });
    }
  }

  // Normalize website URL
  if (typeof result.website === "string" && result.website.trim()) {
    const original = result.website;
    result.website = normalizeUrl(original);
    if (result.website !== original) {
      changes.push({ field: "website", change: "normalized URL" });
    }
  }

  // Validate stage enum
  if (result.stage !== undefined) {
    const { value, changed } = normalizeEnum(result.stage, VALID_STAGES);
    result.stage = value;
    if (changed) {
      changes.push({ field: "stage", change: `corrected to '${value}'` });
    }
  }

  // Validate founded_year
  if (result.founded_year !== undefined && result.founded_year !== null) {
    const year = Number(result.founded_year);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 1800 || year > currentYear) {
      result.founded_year = null;
      changes.push({ field: "founded_year", change: "cleared invalid value" });
    } else {
      result.founded_year = year;
    }
  }

  return { data: result, changes };
};

const normalizeProducts: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  if (Array.isArray(result.products)) {
    result.products = result.products.map(
      (product: Record<string, unknown>, i: number) => {
        const p = { ...product };

        // Validate pricing_model enum
        if (p.pricing_model !== undefined) {
          const { value, changed } = normalizeEnum(
            p.pricing_model,
            VALID_PRICING_MODELS
          );
          p.pricing_model = value;
          if (changed) {
            changes.push({
              field: `products[${i}].pricing_model`,
              change: `corrected to '${value}'`,
            });
          }
        }

        // Clean string arrays
        if (Array.isArray(p.features)) {
          const original = (p.features as unknown[]).length;
          p.features = filterEmptyStrings(p.features as unknown[]);
          if ((p.features as string[]).length !== original) {
            changes.push({
              field: `products[${i}].features`,
              change: "removed empty entries",
            });
          }
        }

        if (Array.isArray(p.differentiators)) {
          const original = (p.differentiators as unknown[]).length;
          p.differentiators = filterEmptyStrings(p.differentiators as unknown[]);
          if ((p.differentiators as string[]).length !== original) {
            changes.push({
              field: `products[${i}].differentiators`,
              change: "removed empty entries",
            });
          }
        }

        return p;
      }
    );
  }

  return { data: result, changes };
};

const normalizeVoice: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  // Clamp tone values to 0-100
  if (result.tone && typeof result.tone === "object") {
    const tone = { ...(result.tone as Record<string, unknown>) };
    for (const key of ["formality", "warmth", "humor", "authority"]) {
      if (tone[key] !== undefined) {
        const clamped = clamp(tone[key], 0, 100);
        if (clamped !== tone[key]) {
          tone[key] = clamped;
          changes.push({
            field: `tone.${key}`,
            change: `clamped to ${clamped}`,
          });
        }
      }
    }
    result.tone = tone;
  }

  // Validate vocabulary enums
  if (result.vocabulary && typeof result.vocabulary === "object") {
    const vocab = { ...(result.vocabulary as Record<string, unknown>) };
    if (vocab.jargon_level !== undefined) {
      const { value, changed } = normalizeEnum(
        vocab.jargon_level,
        VALID_JARGON_LEVELS
      );
      vocab.jargon_level = value;
      if (changed) {
        changes.push({
          field: "vocabulary.jargon_level",
          change: `corrected to '${value}'`,
        });
      }
    }
    if (vocab.sentence_complexity !== undefined) {
      const { value, changed } = normalizeEnum(
        vocab.sentence_complexity,
        VALID_SENTENCE_COMPLEXITY
      );
      vocab.sentence_complexity = value;
      if (changed) {
        changes.push({
          field: "vocabulary.sentence_complexity",
          change: `corrected to '${value}'`,
        });
      }
    }
    result.vocabulary = vocab;
  }

  return { data: result, changes };
};

const normalizeCustomers: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  if (Array.isArray(result.personas)) {
    result.personas = result.personas.map(
      (persona: Record<string, unknown>, i: number) => {
        const p = { ...persona };

        for (const field of [
          "pain_points",
          "buying_triggers",
          "objections",
          "conversion_signals",
        ]) {
          if (Array.isArray(p[field])) {
            const original = (p[field] as unknown[]).length;
            p[field] = filterEmptyStrings(p[field] as unknown[]);
            if ((p[field] as string[]).length !== original) {
              changes.push({
                field: `personas[${i}].${field}`,
                change: "removed empty entries",
              });
            }
          }
        }

        return p;
      }
    );
  }

  return { data: result, changes };
};

const normalizeNarrative: LayerNormalizer = (data) => {
  // Narrative is mostly free-text strings - just trim
  return { data, changes: [] };
};

const normalizeCompetitive: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  if (Array.isArray(result.competitors)) {
    result.competitors = result.competitors.map(
      (comp: Record<string, unknown>, i: number) => {
        const c = { ...comp };

        // Normalize website URL
        if (typeof c.website === "string" && c.website.trim()) {
          const original = c.website;
          c.website = normalizeUrl(original as string);
          if (c.website !== original) {
            changes.push({
              field: `competitors[${i}].website`,
              change: "normalized URL",
            });
          }
        }

        // Clean string arrays
        for (const field of ["strengths", "weaknesses"]) {
          if (Array.isArray(c[field])) {
            const original = (c[field] as unknown[]).length;
            c[field] = filterEmptyStrings(c[field] as unknown[]);
            if ((c[field] as string[]).length !== original) {
              changes.push({
                field: `competitors[${i}].${field}`,
                change: "removed empty entries",
              });
            }
          }
        }

        return c;
      }
    );
  }

  // Clean positioning_gaps and differentiation_vectors
  for (const field of ["positioning_gaps", "differentiation_vectors"]) {
    if (Array.isArray(result[field])) {
      const original = (result[field] as unknown[]).length;
      result[field] = filterEmptyStrings(result[field] as unknown[]);
      if ((result[field] as string[]).length !== original) {
        changes.push({ field, change: "removed empty entries" });
      }
    }
  }

  return { data: result, changes };
};

const normalizeMarket: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  if (Array.isArray(result.trends)) {
    result.trends = result.trends.map(
      (trend: Record<string, unknown>, i: number) => {
        const t = { ...trend };

        if (t.direction !== undefined) {
          const { value, changed } = normalizeEnum(
            t.direction,
            VALID_TREND_DIRECTIONS
          );
          t.direction = value;
          if (changed) {
            changes.push({
              field: `trends[${i}].direction`,
              change: `corrected to '${value}'`,
            });
          }
        }

        if (t.relevance !== undefined) {
          const { value, changed } = normalizeEnum(
            t.relevance,
            VALID_TREND_RELEVANCE
          );
          t.relevance = value;
          if (changed) {
            changes.push({
              field: `trends[${i}].relevance`,
              change: `corrected to '${value}'`,
            });
          }
        }

        return t;
      }
    );
  }

  if (
    result.media_sentiment &&
    typeof result.media_sentiment === "object" &&
    !Array.isArray(result.media_sentiment)
  ) {
    const sentiment = {
      ...(result.media_sentiment as Record<string, unknown>),
    };
    if (sentiment.sentiment !== undefined) {
      const { value, changed } = normalizeEnum(
        sentiment.sentiment,
        VALID_SENTIMENT
      );
      sentiment.sentiment = value;
      if (changed) {
        changes.push({
          field: "media_sentiment.sentiment",
          change: `corrected to '${value}'`,
        });
      }
    }
    result.media_sentiment = sentiment;
  }

  return { data: result, changes };
};

const normalizeBrand: LayerNormalizer = (data) => {
  const changes: Array<{ field: string; change: string }> = [];
  const result = { ...data };

  // Normalize hex colors
  if (result.colors && typeof result.colors === "object") {
    const colors = { ...(result.colors as Record<string, unknown>) };
    for (const key of ["primary", "secondary", "accent"]) {
      if (typeof colors[key] === "string") {
        const normalized = normalizeHexColor(colors[key]);
        if (normalized && normalized !== colors[key]) {
          colors[key] = normalized;
          changes.push({
            field: `colors.${key}`,
            change: "normalized hex color",
          });
        }
      }
    }

    // Normalize semantic colors
    if (colors.semantic && typeof colors.semantic === "object") {
      const semantic = { ...(colors.semantic as Record<string, unknown>) };
      for (const key of ["success", "warning", "error", "info"]) {
        if (typeof semantic[key] === "string") {
          const normalized = normalizeHexColor(semantic[key]);
          if (normalized && normalized !== semantic[key]) {
            semantic[key] = normalized;
            changes.push({
              field: `colors.semantic.${key}`,
              change: "normalized hex color",
            });
          }
        }
      }
      colors.semantic = semantic;
    }

    result.colors = colors;
  }

  // Validate token enums
  if (result.tokens && typeof result.tokens === "object") {
    const tokens = { ...(result.tokens as Record<string, unknown>) };

    const tokenEnums: Array<{
      field: string;
      validValues: string[];
    }> = [
      { field: "border_radius", validValues: VALID_BORDER_RADIUS },
      { field: "elevation", validValues: VALID_ELEVATION },
      { field: "density", validValues: VALID_DENSITY },
    ];

    for (const { field, validValues } of tokenEnums) {
      if (tokens[field] !== undefined) {
        const { value, changed } = normalizeEnum(tokens[field], validValues);
        tokens[field] = value;
        if (changed) {
          changes.push({
            field: `tokens.${field}`,
            change: `corrected to '${value}'`,
          });
        }
      }
    }

    result.tokens = tokens;
  }

  // Validate imagery enums
  if (result.imagery && typeof result.imagery === "object") {
    const imagery = { ...(result.imagery as Record<string, unknown>) };
    const imageryEnums: Array<{ field: string; validValues: string[] }> = [
      { field: "style", validValues: VALID_IMAGE_STYLE },
      { field: "treatment", validValues: VALID_IMAGE_TREATMENT },
      { field: "subject", validValues: VALID_IMAGE_SUBJECT },
    ];
    for (const { field, validValues } of imageryEnums) {
      if (imagery[field] !== undefined) {
        const { value, changed } = normalizeEnum(imagery[field], validValues);
        imagery[field] = value;
        if (changed) {
          changes.push({
            field: `imagery.${field}`,
            change: `corrected to '${value}'`,
          });
        }
      }
    }
    result.imagery = imagery;
  }

  // Validate motion enums
  if (result.motion && typeof result.motion === "object") {
    const motion = { ...(result.motion as Record<string, unknown>) };
    if (motion.level !== undefined) {
      const { value, changed } = normalizeEnum(
        motion.level,
        VALID_MOTION_LEVEL
      );
      motion.level = value;
      if (changed) {
        changes.push({
          field: "motion.level",
          change: `corrected to '${value}'`,
        });
      }
    }
    if (motion.transition_speed !== undefined) {
      const { value, changed } = normalizeEnum(
        motion.transition_speed,
        VALID_TRANSITION_SPEED
      );
      motion.transition_speed = value;
      if (changed) {
        changes.push({
          field: "motion.transition_speed",
          change: `corrected to '${value}'`,
        });
      }
    }
    result.motion = motion;
  }

  // Validate accessibility
  if (result.accessibility && typeof result.accessibility === "object") {
    const access = { ...(result.accessibility as Record<string, unknown>) };
    if (access.wcag_level !== undefined) {
      const { value, changed } = normalizeEnum(
        access.wcag_level,
        VALID_WCAG_LEVEL
      );
      access.wcag_level = value;
      if (changed) {
        changes.push({
          field: "accessibility.wcag_level",
          change: `corrected to '${value}'`,
        });
      }
    }
    if (access.min_contrast !== undefined) {
      const clamped = clamp(access.min_contrast, 1, 21);
      if (clamped !== access.min_contrast) {
        access.min_contrast = clamped;
        changes.push({
          field: "accessibility.min_contrast",
          change: `clamped to ${clamped}`,
        });
      }
    }
    if (access.min_font_size !== undefined) {
      const clamped = clamp(access.min_font_size, 8, 32);
      if (clamped !== access.min_font_size) {
        access.min_font_size = clamped;
        changes.push({
          field: "accessibility.min_font_size",
          change: `clamped to ${clamped}`,
        });
      }
    }
    result.accessibility = access;
  }

  return { data: result, changes };
};

const LAYER_NORMALIZERS: Record<ContextLayer, LayerNormalizer> = {
  org: normalizeOrg,
  products: normalizeProducts,
  voice: normalizeVoice,
  customers: normalizeCustomers,
  narrative: normalizeNarrative,
  competitive: normalizeCompetitive,
  market: normalizeMarket,
  brand: normalizeBrand,
};

// ── Public API ──

/**
 * Normalize data in a single context layer for an account.
 * Reads the layer, applies normalization rules, writes back if changed.
 */
export async function normalizeLayer(
  admin: SupabaseClient,
  accountId: string,
  layer: ContextLayer
): Promise<NormalizeResult> {
  const tableName = `kinetiks_context_${layer}`;

  const { data: row, error } = await admin
    .from(tableName)
    .select("data")
    .eq("account_id", accountId)
    .single();

  if (error || !row) {
    return { layer, changes_made: 0, details: [] };
  }

  const data = row.data as Record<string, unknown> | null;
  if (!data || Object.keys(data).length === 0) {
    return { layer, changes_made: 0, details: [] };
  }

  // Always trim strings first
  const trimmed = trimStrings(data);
  const trimChanged = JSON.stringify(trimmed) !== JSON.stringify(data);

  // Apply layer-specific normalization
  const normalizer = LAYER_NORMALIZERS[layer];
  const { data: normalized, changes } = normalizer(trimmed);

  if (trimChanged) {
    changes.unshift({ field: "*", change: "trimmed whitespace" });
  }

  if (changes.length === 0) {
    return { layer, changes_made: 0, details: [] };
  }

  // Write back
  const { error: updateError } = await admin
    .from(tableName)
    .update({
      data: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId);

  if (updateError) {
    console.error(
      `[archivist/normalize] Failed to update ${tableName} for account ${accountId}:`,
      updateError.message
    );
    return { layer, changes_made: 0, details: [] };
  }

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "archivist_normalize",
    source_operator: "archivist",
    target_layer: layer,
    detail: {
      changes_made: changes.length,
      changes,
      timestamp: new Date().toISOString(),
    },
  });

  return { layer, changes_made: changes.length, details: changes };
}

/**
 * Normalize all context layers for an account.
 */
export async function normalizeAllLayers(
  admin: SupabaseClient,
  accountId: string
): Promise<NormalizeResult[]> {
  const results = await Promise.all(
    CONTEXT_LAYERS.map((layer) => normalizeLayer(admin, accountId, layer))
  );
  return results;
}
