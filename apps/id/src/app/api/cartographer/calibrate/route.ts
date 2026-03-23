import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  generateCalibrationExercises,
  processCalibrationChoice,
} from "@/lib/cartographer/calibrate";
import type { CalibrationExercise } from "@/lib/cartographer/calibrate";
import { NextResponse } from "next/server";

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
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const accountId = account.id as string;
  const action = body.action as string;

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
      return NextResponse.json({ exercises });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Calibration generation failed:", message);
      return NextResponse.json(
        { error: "Failed to generate calibration exercises" },
        { status: 500 }
      );
    }
  }

  if (action === "submit_choice") {
    const exercise = body.exercise as CalibrationExercise | undefined;
    const choice = body.choice as string | undefined;

    if (!exercise || !exercise.id || !exercise.dimension) {
      return NextResponse.json(
        { error: "Missing or invalid exercise" },
        { status: 400 }
      );
    }
    if (choice !== "A" && choice !== "B") {
      return NextResponse.json(
        { error: "Choice must be 'A' or 'B'" },
        { status: 400 }
      );
    }

    try {
      const result = await processCalibrationChoice(
        admin,
        accountId,
        exercise,
        choice
      );
      return NextResponse.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Calibration choice processing failed:", message);
      return NextResponse.json(
        { error: "Failed to process calibration choice" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
