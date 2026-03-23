import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  generateNextQuestion,
  processAnswer,
  getContextFillStatus,
} from "@/lib/cartographer/conversation";
import { NextResponse } from "next/server";

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
        return NextResponse.json({ done: true, fillStatus });
      }

      return NextResponse.json({ question });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Question generation failed:", message);
      return NextResponse.json(
        { error: "Failed to generate question" },
        { status: 500 }
      );
    }
  }

  if (action === "submit_answer") {
    const question = body.question as string | undefined;
    const answer = body.answer as string | undefined;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Missing question" },
        { status: 400 }
      );
    }
    if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty answer" },
        { status: 400 }
      );
    }

    try {
      const result = await processAnswer(admin, accountId, question, answer);
      return NextResponse.json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Answer processing failed:", message);
      return NextResponse.json(
        { error: "Failed to process answer" },
        { status: 500 }
      );
    }
  }

  if (action === "fill_status") {
    try {
      const fillStatus = await getContextFillStatus(admin, accountId);
      return NextResponse.json({ fillStatus });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Fill status failed:", message);
      return NextResponse.json(
        { error: "Failed to get fill status" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
