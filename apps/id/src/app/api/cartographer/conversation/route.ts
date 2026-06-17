import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  generateNextQuestion,
  processAnswer,
  getContextFillStatus,
} from "@/lib/cartographer/conversation";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException } from "@/lib/observability/sentry";

/**
 * POST /api/cartographer/conversation
 *
 * Adaptive conversation engine for onboarding.
 *
 * Body:
 *   { action: "next_question", questionHistory: string[], fromApp?: string }
 *   { action: "submit_answer", question: string, answer: string }
 *   { action: "fill_status" }
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

  if (action === "next_question") {
    const questionHistory = Array.isArray(body.questionHistory)
      ? (body.questionHistory as string[])
      : [];
    const fromApp =
      typeof body.fromApp === "string" ? body.fromApp : null;

    try {
      const question = await generateNextQuestion(
        admin,
        accountId,
        fromApp,
        questionHistory
      );

      if (!question) {
        const fillStatus = await getContextFillStatus(admin, accountId);
        return apiSuccess({ done: true, fillStatus });
      }

      return apiSuccess({ question });
    } catch (err) {
      await captureException(err, {
        tags: {
          route: "/api/cartographer/conversation",
          action: "cartographer.next_question",
          stage: "execute",
          app: "id",
        },
        user: accountId ? { id: accountId } : undefined,
        extra: { fromApp, questionHistoryCount: questionHistory.length },
      });
      return apiError("Failed to generate question", 500);
    }
  }

  if (action === "submit_answer") {
    const question = body.question as string | undefined;
    const answer = body.answer as string | undefined;

    if (!question || typeof question !== "string") {
      return apiError("Missing question", 400);
    }
    if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
      return apiError("Missing or empty answer", 400);
    }

    try {
      const result = await processAnswer(admin, accountId, question, answer);
      return apiSuccess({ result });
    } catch (err) {
      await captureException(err, {
        tags: {
          route: "/api/cartographer/conversation",
          action: "cartographer.submit_answer",
          stage: "execute",
          app: "id",
        },
        user: accountId ? { id: accountId } : undefined,
        extra: {},
      });
      return apiError("Failed to process answer", 500);
    }
  }

  if (action === "fill_status") {
    try {
      const fillStatus = await getContextFillStatus(admin, accountId);
      return apiSuccess({ fillStatus });
    } catch (err) {
      await captureException(err, {
        tags: {
          route: "/api/cartographer/conversation",
          action: "cartographer.fill_status",
          stage: "query",
          app: "id",
        },
        user: accountId ? { id: accountId } : undefined,
        extra: {},
      });
      return apiError("Failed to get fill status", 500);
    }
  }

  return apiError("Invalid action", 400);
}
