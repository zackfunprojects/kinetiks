/**
 * POST /api/reply/draft — create or update a draft reply.
 *
 * Phase 2 stub gate: every draft passes through PASS_THROUGH_GATE_RESULT.
 * Phase 3 wires the real Lens engine here, including the advisory-only
 * mode for the first 30 days per user.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getOpportunityById } from "@/lib/opportunities/queue";
import {
  upsertDraftReply,
  PASS_THROUGH_GATE_RESULT,
} from "@/lib/reply/service";

export const dynamic = "force-dynamic";

const MAX_REPLY_LENGTH = 10_000;

interface DraftBody {
  opportunity_id?: string;
  content?: string;
}

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let body: DraftBody;
  try {
    body = (await request.json()) as DraftBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body.opportunity_id || typeof body.opportunity_id !== "string") {
    return NextResponse.json(
      { success: false, error: "Missing opportunity_id" },
      { status: 400 }
    );
  }
  if (typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "Reply content is required" },
      { status: 400 }
    );
  }
  if (body.content.length > MAX_REPLY_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Reply exceeds ${MAX_REPLY_LENGTH} characters` },
      { status: 413 }
    );
  }

  const supabase = createDeskOfServerClient();
  const opportunity = await getOpportunityById(
    supabase,
    auth.session.user_id,
    body.opportunity_id
  );
  if (!opportunity) {
    return NextResponse.json(
      { success: false, error: "Opportunity not found" },
      { status: 404 }
    );
  }

  try {
    const reply = await upsertDraftReply(supabase, {
      user_id: auth.session.user_id,
      opportunity_id: body.opportunity_id,
      platform: opportunity.thread.platform,
      thread_url: opportunity.thread.url,
      content: body.content,
      gate_result: PASS_THROUGH_GATE_RESULT,
      gate_overrides: [],
    });
    return NextResponse.json({
      success: true,
      reply_id: reply.id,
      gate_result: reply.gate_result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
