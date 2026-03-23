import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { askClaude } from "@kinetiks/ai";
import {
  WRITING_SAMPLE_ANALYSIS_PROMPT,
  buildWritingSamplePrompt,
} from "@/lib/ai/prompts/conversation";
import { submitProposal, logToLedger } from "@/lib/cartographer/submit";
import { NextResponse } from "next/server";

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

    // Add the writing sample to the payload
    const existingSamples = Array.isArray(currentVoice?.writing_samples)
      ? currentVoice.writing_samples
      : [];

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
          value: `Writing sample: ${text.trim().slice(0, 100)}...`,
          context: `Uploaded writing sample from ${source}`,
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
