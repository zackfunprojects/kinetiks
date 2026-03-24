import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  generateCalibrationExercises,
  processCalibrationChoice,
} from "@/lib/cartographer/calibrate";
import type { CalibrationExercise } from "@/lib/cartographer/calibrate";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/cartographer/calibrate
 *
 * Voice calibration exercises.
 *
 * Body:
 *   { action: "generate", count?: number }
 *   { action: "submit_choice", exercise: CalibrationExercise, choice: "A" | "B" }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const admin = createAdminClient();
  const accountId = auth.account_id;

  if (typeof body.action !== "string") {
    return apiError("Missing action", 400);
  }
  const action = body.action;

  if (action === "generate") {
    const count =
      typeof body.count === "number" && body.count >= 1 && body.count <= 6
        ? body.count
        : 4;

    try {
      const exercises = await generateCalibrationExercises(
        admin,
        accountId,
        count
      );
      return apiSuccess({ exercises });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Calibration generation failed:", message);
      return apiError("Failed to generate calibration exercises", 500);
    }
  }

  if (action === "submit_choice") {
    const exercise = body.exercise as Record<string, unknown> | undefined;
    const choice = body.choice as string | undefined;

    const VALID_DIMENSIONS = ["formality", "warmth", "humor", "authority"];
    const VALID_DIRECTIONS = ["high", "low"];

    if (
      !exercise ||
      typeof exercise.id !== "string" ||
      typeof exercise.exercise !== "string" ||
      typeof exercise.scenario !== "string" ||
      typeof exercise.optionA !== "string" ||
      typeof exercise.optionB !== "string" ||
      typeof exercise.dimension !== "string" ||
      !VALID_DIMENSIONS.includes(exercise.dimension) ||
      typeof exercise.aDirection !== "string" ||
      !VALID_DIRECTIONS.includes(exercise.aDirection) ||
      typeof exercise.bDirection !== "string" ||
      !VALID_DIRECTIONS.includes(exercise.bDirection)
    ) {
      return apiError("Missing or invalid exercise", 400);
    }
    if (choice !== "A" && choice !== "B") {
      return apiError("Choice must be 'A' or 'B'", 400);
    }

    const validatedExercise: CalibrationExercise = {
      id: exercise.id,
      exercise: exercise.exercise,
      scenario: exercise.scenario,
      optionA: exercise.optionA,
      optionB: exercise.optionB,
      dimension: exercise.dimension as CalibrationExercise["dimension"],
      aDirection: exercise.aDirection as CalibrationExercise["aDirection"],
      bDirection: exercise.bDirection as CalibrationExercise["bDirection"],
    };

    try {
      const result = await processCalibrationChoice(
        admin,
        accountId,
        validatedExercise,
        choice
      );
      return apiSuccess({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Calibration choice processing failed:", message);
      return apiError("Failed to process calibration choice", 500);
    }
  }

  return apiError("Invalid action", 400);
}
