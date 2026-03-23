/**
 * Voice Calibration Engine.
 * Generates A/B writing exercises using business context and processes user
 * choices into voice layer Proposals.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { askClaude } from "@kinetiks/ai";
import {
  CALIBRATION_GENERATION_PROMPT,
  buildCalibrationPrompt,
} from "@/lib/ai/prompts/conversation";
import { submitProposal, logToLedger } from "./submit";
import type { ProposalInsert } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalibrationExercise {
  id: string;
  exercise: string;
  scenario: string;
  optionA: string;
  optionB: string;
  dimension: "formality" | "warmth" | "humor" | "authority";
  aDirection: "high" | "low";
  bDirection: "high" | "low";
}

export interface CalibrationChoiceResult {
  success: boolean;
  proposalId: string | null;
  dimension: string;
  adjustedTo: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TONE_ADJUSTMENT = 15;
const TONE_DEFAULT = 50;
const VALID_DIMENSIONS = [
  "formality",
  "warmth",
  "humor",
  "authority",
] as const;

// ---------------------------------------------------------------------------
// Generate Exercises
// ---------------------------------------------------------------------------

/**
 * Generate voice calibration exercises tailored to the user's business.
 */
export async function generateCalibrationExercises(
  admin: SupabaseClient,
  accountId: string,
  count: number = 4
): Promise<CalibrationExercise[]> {
  // Load business context for relevant exercises
  const [orgResult, productsResult] = await Promise.allSettled([
    admin
      .from("kinetiks_context_org")
      .select("data")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single(),
    admin
      .from("kinetiks_context_products")
      .select("data")
      .eq("account_id", accountId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const orgData =
    orgResult.status === "fulfilled"
      ? (orgResult.value.data?.data as Record<string, unknown> | null)
      : null;
  const productsData =
    productsResult.status === "fulfilled"
      ? (productsResult.value.data?.data as Record<string, unknown> | null)
      : null;

  const orgName = (orgData?.company_name as string) ?? null;
  const industry = (orgData?.industry as string) ?? null;
  const products: string[] = [];

  if (productsData?.products && Array.isArray(productsData.products)) {
    for (const p of productsData.products) {
      if (p && typeof p === "object" && "name" in p && typeof p.name === "string") {
        products.push(p.name);
      }
    }
  }

  const userPrompt = buildCalibrationPrompt(
    orgName,
    industry,
    products,
    count
  );

  const response = await askClaude(userPrompt, {
    system: CALIBRATION_GENERATION_PROMPT,
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
  });

  const parsed = parseJSON<CalibrationExercise[]>(response);
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Failed to generate calibration exercises");
  }

  // Validate and assign IDs
  const exercises: CalibrationExercise[] = [];
  for (const raw of parsed) {
    if (
      !raw.exercise ||
      !raw.scenario ||
      !raw.optionA ||
      !raw.optionB ||
      !VALID_DIMENSIONS.includes(raw.dimension as typeof VALID_DIMENSIONS[number])
    ) {
      continue;
    }

    exercises.push({
      id: crypto.randomUUID(),
      exercise: raw.exercise,
      scenario: raw.scenario,
      optionA: raw.optionA,
      optionB: raw.optionB,
      dimension: raw.dimension,
      aDirection: raw.aDirection === "low" ? "low" : "high",
      bDirection: raw.bDirection === "low" ? "low" : "high",
    });
  }

  if (exercises.length === 0) {
    throw new Error("No valid exercises generated");
  }

  return exercises;
}

// ---------------------------------------------------------------------------
// Process Choice
// ---------------------------------------------------------------------------

/**
 * Process a user's calibration choice and submit a voice layer Proposal.
 */
export async function processCalibrationChoice(
  admin: SupabaseClient,
  accountId: string,
  exercise: CalibrationExercise,
  choice: "A" | "B"
): Promise<CalibrationChoiceResult> {
  const chosenDirection = choice === "A" ? exercise.aDirection : exercise.bDirection;

  // Read current voice tone
  const { data: voiceRow } = await admin
    .from("kinetiks_context_voice")
    .select("data")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const voiceData = (voiceRow?.data as Record<string, unknown>) ?? {};
  const currentTone = (voiceData.tone as Record<string, number>) ?? {};
  const currentValue = currentTone[exercise.dimension] ?? TONE_DEFAULT;

  // Adjust by ±15, clamped to 0-100
  const adjustment = chosenDirection === "high" ? TONE_ADJUSTMENT : -TONE_ADJUSTMENT;
  const newValue = Math.max(0, Math.min(100, currentValue + adjustment));

  // Build payload with updated tone + calibration_data entry
  const calibrationEntry = {
    exercise: exercise.exercise,
    choice,
    options: { A: exercise.optionA, B: exercise.optionB },
  };

  const existingCalibration = Array.isArray(voiceData.calibration_data)
    ? voiceData.calibration_data
    : [];

  const proposal: ProposalInsert = {
    account_id: accountId,
    source_app: "cartographer",
    source_operator: "cartographer_calibrate",
    target_layer: "voice",
    action: voiceRow ? "update" : "add",
    confidence: "inferred",
    payload: {
      tone: {
        ...currentTone,
        [exercise.dimension]: newValue,
      },
      calibration_data: [...existingCalibration, calibrationEntry],
    },
    evidence: [
      {
        type: "user_action",
        value: `Chose option ${choice} for "${exercise.exercise}"`,
        context: `Voice calibration: ${exercise.dimension} ${chosenDirection}`,
        date: new Date().toISOString(),
      },
    ],
    expires_at: null,
  };

  try {
    const { proposalId, result } = await submitProposal(admin, proposal);
    const accepted = result.status === "accepted";

    await logToLedger(admin, accountId, "cartographer_calibrate", {
      source_operator: "cartographer_calibrate",
      exercise: exercise.exercise,
      dimension: exercise.dimension,
      choice,
      chosen_direction: chosenDirection,
      adjusted_from: currentValue,
      adjusted_to: accepted ? newValue : currentValue,
      proposal_status: result.status,
    });

    return {
      success: accepted,
      proposalId,
      dimension: exercise.dimension,
      adjustedTo: accepted ? newValue : currentValue,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to submit calibration proposal:", message);
    return {
      success: false,
      proposalId: null,
      dimension: exercise.dimension,
      adjustedTo: currentValue,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSON<T>(text: string): T | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(cleaned) as T;
  } catch {
    console.error(
      "Failed to parse calibration JSON response:",
      text.slice(0, 200)
    );
    return null;
  }
}
