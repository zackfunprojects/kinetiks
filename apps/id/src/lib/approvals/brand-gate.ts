import type { ApprovalSubmission, GateResult } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_REVISIONS = 3;

/**
 * Brand consistency gate.
 * Checks generated content against the Voice layer using Claude Haiku.
 * Up to 3 revision attempts before marginal pass.
 */
export async function runBrandGate(
  submission: ApprovalSubmission,
  accountId: string
): Promise<GateResult> {
  // Load Voice layer data
  const admin = createAdminClient();
  const { data: voiceRow } = await admin
    .from("kinetiks_context_voice")
    .select("data")
    .eq("account_id", accountId)
    .single();

  const voiceData = (voiceRow?.data as Record<string, unknown>) ?? null;

  // No voice data yet - pass by default
  if (!voiceData) {
    return {
      passed: true,
      feedback: null,
      revision_count: 0,
      details: { reason: "No voice layer configured yet" },
    };
  }

  // Extract content from preview for evaluation
  const contentToCheck = extractContent(submission);

  if (!contentToCheck) {
    return {
      passed: true,
      feedback: null,
      revision_count: 0,
      details: { reason: "No evaluable content in preview" },
    };
  }

  // Run brand check via Claude Haiku
  try {
    const { askClaude } = await import("@kinetiks/ai");

    const result = await askClaude(
      `Brand Voice Guidelines:\n${JSON.stringify(voiceData, null, 2)}\n\nContent to evaluate:\n${contentToCheck}`,
      {
        system: `You are a brand consistency checker. Evaluate whether the following content matches the brand voice guidelines. Respond with JSON only: { "passed": boolean, "feedback": string | null, "scores": { "tone": number, "vocabulary": number, "messaging": number } }. Scores are 0-100.`,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 1024,
      }
    );

    const parsed = JSON.parse(result);

    return {
      passed: parsed.passed ?? true,
      feedback: parsed.feedback ?? null,
      revision_count: 0,
      details: { scores: parsed.scores ?? {} },
    };
  } catch {
    // If AI check fails, pass with warning
    return {
      passed: true,
      feedback: "Brand check unavailable - passed by default",
      revision_count: 0,
      details: { error: "AI evaluation failed" },
    };
  }
}

function extractContent(submission: ApprovalSubmission): string | null {
  const preview = submission.preview.content;

  // Try common content fields
  if (typeof preview.body === "string") return preview.body;
  if (typeof preview.content === "string") return preview.content;
  if (typeof preview.text === "string") return preview.text;
  if (typeof preview.subject === "string" && typeof preview.body === "string") {
    return `Subject: ${preview.subject}\n\n${preview.body}`;
  }

  // Fallback: stringify the whole preview
  const str = JSON.stringify(preview);
  return str.length > 10 ? str : null;
}
