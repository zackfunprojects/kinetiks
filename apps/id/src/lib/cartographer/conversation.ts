/**
 * Cartographer Adaptive Conversation Engine.
 * Generates questions to fill gaps in the Context Structure and processes answers
 * into Proposals through the Cortex pipeline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextLayer } from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import {
  CONVERSATION_QUESTION_PROMPT,
  CONVERSATION_ANSWER_EXTRACTION_PROMPT,
  EXPECTED_FIELDS,
  LAYER_WEIGHTS,
  APP_LAYER_PRIORITIES,
  buildQuestionGenerationPrompt,
  buildAnswerExtractionPrompt,
  buildContextSummaryForQuestions,
} from "@/lib/ai/prompts/conversation";
import { submitProposal, logToLedger } from "./submit";
import { buildProposal } from "./crawl";
import type { ProposalInsert } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationQuestion {
  question: string;
  targetLayers: ContextLayer[];
  inputType: "text" | "textarea" | "select";
  options?: string[];
  hint?: string;
}

export interface AnswerResult {
  proposalsSubmitted: string[];
  layersUpdated: ContextLayer[];
  extractedSummary: string;
}

export interface ContextFillStatus {
  layers: Record<
    ContextLayer,
    { filled: number; total: number; percentage: number }
  >;
  aggregate: number;
}

// ---------------------------------------------------------------------------
// Context Fill Status
// ---------------------------------------------------------------------------

const LAYER_TABLE_MAP: Record<ContextLayer, string> = {
  org: "kinetiks_context_org",
  products: "kinetiks_context_products",
  voice: "kinetiks_context_voice",
  customers: "kinetiks_context_customers",
  narrative: "kinetiks_context_narrative",
  competitive: "kinetiks_context_competitive",
  market: "kinetiks_context_market",
  brand: "kinetiks_context_brand",
};

const ALL_LAYERS = Object.keys(LAYER_TABLE_MAP) as ContextLayer[];

/**
 * Check if a field value counts as "filled".
 */
function isFieldFilled(value: unknown, fieldName?: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    if (fieldName === "products" || fieldName === "personas" || fieldName === "competitors") {
      return value.some(
        (item) =>
          item &&
          typeof item === "object" &&
          "name" in item &&
          typeof (item as Record<string, unknown>).name === "string" &&
          (item as Record<string, unknown>).name !== ""
      );
    }
    return true;
  }
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Read all 8 context layer tables and compute fill percentages.
 */
export async function getContextFillStatus(
  admin: SupabaseClient,
  accountId: string
): Promise<ContextFillStatus> {
  const layerResults = await Promise.allSettled(
    ALL_LAYERS.map(async (layer) => {
      const { data } = await admin
        .from(LAYER_TABLE_MAP[layer])
        .select("data")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      return { layer, data: (data?.data as Record<string, unknown>) ?? null };
    })
  );

  const layers = {} as ContextFillStatus["layers"];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of layerResults) {
    if (result.status !== "fulfilled") continue;
    const { layer, data } = result.value;
    const expected = EXPECTED_FIELDS[layer];
    let filledCount = 0;

    if (data) {
      for (const field of expected) {
        if (isFieldFilled(data[field], field)) filledCount++;
      }
    }

    const percentage = Math.round((filledCount / expected.length) * 100);
    layers[layer] = {
      filled: filledCount,
      total: expected.length,
      percentage,
    };

    weightedSum += percentage * LAYER_WEIGHTS[layer];
    totalWeight += LAYER_WEIGHTS[layer];
  }

  // Fill missing layers with 0
  for (const layer of ALL_LAYERS) {
    if (!layers[layer]) {
      layers[layer] = {
        filled: 0,
        total: EXPECTED_FIELDS[layer].length,
        percentage: 0,
      };
    }
  }

  const aggregate = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return { layers, aggregate };
}

// ---------------------------------------------------------------------------
// Adaptive Question Generation
// ---------------------------------------------------------------------------

const DEFAULT_PRIORITY_LAYERS: ContextLayer[] = ["products", "voice", "customers"];
const MIN_AGGREGATE_FILL = 50;
const MIN_PRIORITY_FILL = 40;
const MAX_QUESTIONS = 8;

/**
 * Get priority layers based on the entry app. Falls back to defaults.
 */
function getPriorityLayers(fromApp: string | null): ContextLayer[] {
  if (fromApp && APP_LAYER_PRIORITIES[fromApp]) {
    return APP_LAYER_PRIORITIES[fromApp];
  }
  return DEFAULT_PRIORITY_LAYERS;
}

/**
 * Generate the next adaptive question. Returns null when the conversation is done.
 */
export async function generateNextQuestion(
  admin: SupabaseClient,
  accountId: string,
  fromApp: string | null,
  questionHistory: string[]
): Promise<ConversationQuestion | null> {
  if (questionHistory.length >= MAX_QUESTIONS) return null;

  const fillStatus = await getContextFillStatus(admin, accountId);

  // Check completion criteria using app-specific priority layers
  const priorityLayers = getPriorityLayers(fromApp);
  const priorityLayersFilled = priorityLayers.every(
    (l) => fillStatus.layers[l].percentage >= MIN_PRIORITY_FILL
  );
  if (fillStatus.aggregate >= MIN_AGGREGATE_FILL && priorityLayersFilled) {
    return null;
  }

  // Build the layer data map for the context summary
  const layerData = await loadLayerData(admin, accountId);
  const contextSummary = buildContextSummaryForQuestions(layerData);
  const userPrompt = buildQuestionGenerationPrompt(
    contextSummary,
    questionHistory,
    fromApp
  );

  const response = await askClaude(userPrompt, {
    system: CONVERSATION_QUESTION_PROMPT,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 512,
  });

  const parsed = parseJSON<ConversationQuestion>(response);
  if (!parsed || !parsed.question || !parsed.targetLayers) return null;

  // Validate inputType
  const validInputTypes = ["text", "textarea", "select"] as const;
  if (!validInputTypes.includes(parsed.inputType as typeof validInputTypes[number])) {
    parsed.inputType = "textarea";
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Answer Processing
// ---------------------------------------------------------------------------

/**
 * Process a user's answer: extract structured data and submit Proposals.
 */
export async function processAnswer(
  admin: SupabaseClient,
  accountId: string,
  question: string,
  answer: string
): Promise<AnswerResult> {
  const layerData = await loadLayerData(admin, accountId);
  const contextSummary = buildContextSummaryForQuestions(layerData);
  const userPrompt = buildAnswerExtractionPrompt(
    question,
    answer,
    contextSummary
  );

  const response = await askClaude(userPrompt, {
    system: CONVERSATION_ANSWER_EXTRACTION_PROMPT,
    model: "claude-sonnet-4-20250514",
    maxTokens: 2048,
  });

  const extracted = parseJSON<Record<string, Record<string, unknown>>>(response);
  if (!extracted || Object.keys(extracted).length === 0) {
    return {
      proposalsSubmitted: [],
      layersUpdated: [],
      extractedSummary: "No structured data could be extracted from your answer.",
    };
  }

  const submittedIds: string[] = [];
  const updatedLayers: ContextLayer[] = [];

  for (const [layerName, payload] of Object.entries(extracted)) {
    if (!ALL_LAYERS.includes(layerName as ContextLayer)) continue;
    if (!payload || Object.keys(payload).length === 0) continue;

    const layer = layerName as ContextLayer;
    const proposal: ProposalInsert = {
      account_id: accountId,
      source_app: "cartographer",
      source_operator: "cartographer_conversation",
      target_layer: layer,
      action: layerData[layer] ? "update" : "add",
      confidence: "inferred",
      payload,
      evidence: [
        {
          type: "conversation",
          value: answer,
          context: `Answer to: "${question}"`,
          date: new Date().toISOString(),
        },
      ],
      expires_at: null,
    };

    try {
      const { proposalId, result } = await submitProposal(admin, proposal);
      submittedIds.push(proposalId);
      if (result.status === "accepted") {
        updatedLayers.push(layer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `Failed to submit conversation proposal for ${layer}:`,
        message
      );
    }
  }

  await logToLedger(admin, accountId, "cartographer_conversation", {
    source_operator: "cartographer_conversation",
    question,
    layers_updated: updatedLayers,
    proposals_submitted: submittedIds.length,
  });

  const summary =
    updatedLayers.length > 0
      ? `Updated ${updatedLayers.join(", ")} layer${updatedLayers.length > 1 ? "s" : ""}.`
      : "No layers updated from this answer.";

  return {
    proposalsSubmitted: submittedIds,
    layersUpdated: updatedLayers,
    extractedSummary: summary,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the raw data for all 8 context layers.
 */
async function loadLayerData(
  admin: SupabaseClient,
  accountId: string
): Promise<Record<ContextLayer, Record<string, unknown> | null>> {
  const result = {} as Record<ContextLayer, Record<string, unknown> | null>;

  const settled = await Promise.allSettled(
    ALL_LAYERS.map(async (layer) => {
      const { data } = await admin
        .from(LAYER_TABLE_MAP[layer])
        .select("data")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      return {
        layer,
        data: (data?.data as Record<string, unknown>) ?? null,
      };
    })
  );

  for (const s of settled) {
    if (s.status === "fulfilled") {
      result[s.value.layer] = s.value.data;
    }
  }

  // Fill missing with null
  for (const layer of ALL_LAYERS) {
    if (!(layer in result)) {
      result[layer] = null;
    }
  }

  return result;
}

/**
 * Parse a JSON string, returning null on failure.
 */
function parseJSON<T>(text: string): T | null {
  try {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(cleaned) as T;
  } catch {
    console.error("Failed to parse Claude JSON response:", text.slice(0, 200));
    return null;
  }
}
