import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { askClaude } from "@kinetiks/ai";
import {
  WRITING_SAMPLE_ANALYSIS_PROMPT,
  buildWritingSamplePrompt,
} from "@/lib/ai/prompts/conversation";
import { submitProposal, logToLedger } from "@/lib/cartographer/submit";
import { NextResponse } from "next/server";

const MAX_SAMPLES = 3;

/**
 * Validate that voiceRefinements has the expected voice layer shape.
 * Returns null if valid, error string if invalid.
 */
function validateVoiceRefinements(
  data: Record<string, unknown>
): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "Voice refinements must be an object";
  }

  // Validate tone if present
  if (data.tone !== undefined) {
    if (typeof data.tone !== "object" || data.tone === null) {
      return "tone must be an object";
    }
    const tone = data.tone as Record<string, unknown>;
    for (const key of ["formality", "warmth", "humor", "authority"]) {
      if (tone[key] !== undefined) {
        if (typeof tone[key] !== "number" || tone[key] < 0 || tone[key] > 100) {
          return `tone.${key} must be a number 0-100`;
        }
      }
    }
  }

  // Validate vocabulary if present
  if (data.vocabulary !== undefined) {
    if (typeof data.vocabulary !== "object" || data.vocabulary === null) {
      return "vocabulary must be an object";
    }
    const vocab = data.vocabulary as Record<string, unknown>;
    if (
      vocab.jargon_level !== undefined &&
      !["none", "light", "moderate", "heavy"].includes(
        vocab.jargon_level as string
      )
    ) {
      return "vocabulary.jargon_level invalid";
    }
    if (
      vocab.sentence_complexity !== undefined &&
      !["simple", "moderate", "complex"].includes(
        vocab.sentence_complexity as string
      )
    ) {
      return "vocabulary.sentence_complexity invalid";
    }
  }

  // Validate messaging_patterns if present
  if (data.messaging_patterns !== undefined) {
    if (!Array.isArray(data.messaging_patterns)) {
      return "messaging_patterns must be an array";
    }
    for (const p of data.messaging_patterns) {
      if (
        typeof p !== "object" ||
        p === null ||
        typeof p.context !== "string" ||
        typeof p.pattern !== "string"
      ) {
        return "messaging_patterns entries must have context and pattern strings";
      }
    }
  }

  return null;
}

/**
 * POST /api/cartographer/writing-sample
 *
 * Analyze a pasted writing sample and refine the voice layer.
 *
 * Body: { text: string, source?: string }
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

  const text = body.text as string | undefined;
  if (!text || typeof text !== "string" || text.trim().length < 100) {
    return NextResponse.json(
      { error: "Writing sample must be at least 100 characters" },
      { status: 400 }
    );
  }

  const source =
    typeof body.source === "string" ? body.source : "onboarding_paste";

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

  // Get current voice data for context
  const { data: voiceRow } = await admin
    .from("kinetiks_context_voice")
    .select("data")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  const currentVoice = voiceRow?.data as Record<string, unknown> | null;

  // Server-side sample limit
  const existingSamples = Array.isArray(currentVoice?.writing_samples)
    ? (currentVoice.writing_samples as unknown[])
    : [];

  if (existingSamples.length >= MAX_SAMPLES) {
    return NextResponse.json(
      { error: `Maximum of ${MAX_SAMPLES} writing samples allowed` },
      { status: 400 }
    );
  }

  const voiceSummary = currentVoice
    ? JSON.stringify(currentVoice, null, 2)
    : null;

  try {
    const userPrompt = buildWritingSamplePrompt(text.trim(), voiceSummary);
    const response = await askClaude(userPrompt, {
      system: WRITING_SAMPLE_ANALYSIS_PROMPT,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
    });

    let voiceRefinements: Record<string, unknown>;
    try {
      let cleaned = response.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\n?/, "")
          .replace(/\n?```$/, "");
      }
      voiceRefinements = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse voice analysis" },
        { status: 500 }
      );
    }

    // Validate the voice refinements schema before submitting
    const validationError = validateVoiceRefinements(voiceRefinements);
    if (validationError) {
      console.error("Voice refinements validation failed:", validationError);
      return NextResponse.json(
        { error: "Voice analysis produced invalid data" },
        { status: 500 }
      );
    }

    const sampleEntry = {
      source,
      text: text.trim().slice(0, 2000),
      type: "own" as const,
    };

    const payload = {
      ...voiceRefinements,
      writing_samples: [...existingSamples, sampleEntry],
    };

    const { proposalId } = await submitProposal(admin, {
      account_id: accountId,
      source_app: "cartographer",
      source_operator: "cartographer_writing_sample",
      target_layer: "voice",
      action: voiceRow ? "update" : "add",
      confidence: "inferred",
      payload,
      evidence: [
        {
          type: "user_action",
          value: `Writing sample (${text.trim().length} chars) from ${source}`,
          context: "Voice refinement via writing sample analysis",
          date: new Date().toISOString(),
        },
      ],
      expires_at: null,
    });

    await logToLedger(admin, accountId, "cartographer_writing_sample", {
      source_operator: "cartographer_writing_sample",
      sample_length: text.trim().length,
      source,
    });

    return NextResponse.json({
      result: { voiceRefinements, proposalId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Writing sample analysis failed:", message);
    return NextResponse.json(
      { error: "Failed to analyze writing sample" },
      { status: 500 }
    );
  }
}
