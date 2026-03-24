import type {
  EditorialResult,
  EditorialScores,
  SentinelContentType,
  SentinelFlag,
  FlagSeverity,
} from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import { SENTINEL_EDITORIAL_SYSTEM } from "@/lib/ai/prompts/sentinel";
import { LENGTH_RANGES } from "./thresholds";

/**
 * Weights for computing the composite editorial quality score.
 */
const SCORE_WEIGHTS: Record<keyof EditorialScores, number> = {
  voice_match: 0.25,
  tone: 0.15,
  clarity: 0.20,
  product_accuracy: 0.15,
  competitive_claims: 0.10,
  spelling_grammar: 0.10,
  length: 0.05,
};

interface ContextLayers {
  voice: Record<string, unknown>;
  products: Record<string, unknown>;
  competitive: Record<string, unknown>;
}

/**
 * Run the editorial quality evaluation.
 *
 * Calls Claude Sonnet with the content and relevant Context Structure layers.
 * Returns per-dimension scores, a composite score, and flags for concerns.
 */
export async function evaluateEditorial(
  content: string,
  contentType: SentinelContentType,
  context: ContextLayers
): Promise<EditorialResult> {
  const lengthRange = LENGTH_RANGES[contentType];
  const lengthGuideline = lengthRange
    ? `Length guidelines for ${contentType}: ${lengthRange.min}-${lengthRange.max} words.`
    : "";

  const prompt = `Content type: ${contentType}
${lengthGuideline}

--- CONTENT TO REVIEW ---
${content}

--- VOICE LAYER DATA ---
${JSON.stringify(context.voice, null, 2)}

--- PRODUCTS LAYER DATA ---
${JSON.stringify(context.products, null, 2)}

--- COMPETITIVE LAYER DATA ---
${JSON.stringify(context.competitive, null, 2)}`;

  const response = await askClaude(prompt, {
    system: SENTINEL_EDITORIAL_SYSTEM,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  let parsed: {
    scores: EditorialScores;
    concerns: Array<{
      dimension: string;
      detail: string;
      severity: string;
    }>;
  };

  try {
    parsed = JSON.parse(response);
  } catch {
    // If AI returns malformed JSON, return conservative scores
    return {
      scores: {
        voice_match: 50,
        tone: 50,
        clarity: 50,
        product_accuracy: 50,
        competitive_claims: 50,
        spelling_grammar: 50,
        length: 50,
      },
      composite_score: 50,
      flags: [
        {
          category: "clarity",
          severity: "medium",
          detail: "Editorial evaluation returned unparseable response - manual review recommended",
          suggested_action: null,
        },
      ],
    };
  }

  // Clamp all scores to 0-100
  const scores: EditorialScores = {
    voice_match: clamp(parsed.scores.voice_match ?? 50),
    tone: clamp(parsed.scores.tone ?? 50),
    clarity: clamp(parsed.scores.clarity ?? 50),
    product_accuracy: clamp(parsed.scores.product_accuracy ?? 50),
    competitive_claims: clamp(parsed.scores.competitive_claims ?? 50),
    spelling_grammar: clamp(parsed.scores.spelling_grammar ?? 50),
    length: clamp(parsed.scores.length ?? 50),
  };

  // Compute weighted composite
  let composite = 0;
  for (const [dimension, weight] of Object.entries(SCORE_WEIGHTS)) {
    composite += scores[dimension as keyof EditorialScores] * weight;
  }
  composite = Math.round(composite * 100) / 100;

  // Convert concerns to flags
  const flags: SentinelFlag[] = (parsed.concerns ?? []).map((concern) => ({
    category: dimensionToFlagCategory(concern.dimension),
    severity: mapSeverity(concern.severity),
    detail: concern.detail,
    suggested_action: null,
  }));

  return { scores, composite_score: composite, flags };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function dimensionToFlagCategory(dimension: string): SentinelFlag["category"] {
  const map: Record<string, SentinelFlag["category"]> = {
    voice_match: "voice_mismatch",
    tone: "tone_inappropriate",
    clarity: "clarity",
    product_accuracy: "product_inaccuracy",
    competitive_claims: "competitive_claims",
    spelling_grammar: "spelling_grammar",
    length: "length_inappropriate",
  };
  return map[dimension] ?? "clarity";
}

function mapSeverity(severity: string): FlagSeverity {
  const valid: FlagSeverity[] = ["none", "low", "medium", "high", "critical"];
  return valid.includes(severity as FlagSeverity)
    ? (severity as FlagSeverity)
    : "medium";
}
