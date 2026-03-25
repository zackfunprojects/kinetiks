import { requireAuth } from "@/lib/auth/require-auth";
import { askClaude } from "@kinetiks/ai";
import {
  AUTO_ANSWER_GENERATION_PROMPT,
  buildAutoAnswerPrompt,
} from "@/lib/ai/prompts/cartographer";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/cartographer/auto-answer
 *
 * Generate a substantive, Claude-synthesized answer to an onboarding question.
 * Uses the provided business context + Claude's general knowledge to produce
 * the best possible answer.
 *
 * Body: { question: string, businessContext: string }
 */
export async function POST(request: Request) {
  const { error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") return apiError("Invalid JSON body", 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const question = body.question;
  const businessContext = body.businessContext;

  if (!question || typeof question !== "string") {
    return apiError("Missing or invalid question", 400);
  }
  if (!businessContext || typeof businessContext !== "string") {
    return apiError("Missing or invalid businessContext", 400);
  }

  try {
    const prompt = buildAutoAnswerPrompt(question, businessContext);
    const answer = await askClaude(prompt, {
      system: AUTO_ANSWER_GENERATION_PROMPT,
      model: "claude-sonnet-4-20250514",
      maxTokens: 1024,
    });

    return apiSuccess({ answer: answer.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Auto-answer generation failed:", message);
    return apiError("Failed to generate answer", 500);
  }
}
