/**
 * POST /api/reply/draft — create or update a draft reply.
 *
 * Phase 2 stub gate: every draft passes through PASS_THROUGH_GATE_RESULT.
 * Phase 3 wires the real Lens engine here, including the advisory-only
 * mode for the first 30 days per user.
 *
 * The route accepts a monotonic `revision` from the editor. Out-of-order
 * autosaves are rejected with 409 + the current revision so the client
 * can decide whether to bump and retry. Frozen rows (already posted, or
 * mid-handoff for Quora) are rejected with 409 + status so the editor
 * surface can transition to a read-only state.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getActionableOpportunityById } from "@/lib/opportunities/queue";
import {
  upsertDraftReply,
  PASS_THROUGH_GATE_RESULT,
} from "@/lib/reply/service";

export const dynamic = "force-dynamic";

const MAX_REPLY_LENGTH = 10_000;

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const opportunityId = (raw as { opportunity_id?: unknown }).opportunity_id;
  const content = (raw as { content?: unknown }).content;
  const revisionRaw = (raw as { revision?: unknown }).revision;

  if (typeof opportunityId !== "string" || opportunityId.length === 0) {
    return NextResponse.json(
      { success: false, error: "Missing opportunity_id" },
      { status: 400 }
    );
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "Reply content is required" },
      { status: 400 }
    );
  }
  if (content.length > MAX_REPLY_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Reply exceeds ${MAX_REPLY_LENGTH} characters` },
      { status: 413 }
    );
  }

  const revision =
    typeof revisionRaw === "number" && Number.isFinite(revisionRaw)
      ? Math.max(0, Math.floor(revisionRaw))
      : 0;

  const supabase = createDeskOfServerClient();
  const opportunity = await getActionableOpportunityById(
    supabase,
    auth.session.user_id,
    opportunityId
  );
  if (!opportunity) {
    return NextResponse.json(
      { success: false, error: "Opportunity not found" },
      { status: 404 }
    );
  }

  try {
    const result = await upsertDraftReply(supabase, {
      user_id: auth.session.user_id,
      opportunity_id: opportunityId,
      platform: opportunity.thread.platform,
      thread_url: opportunity.thread.url,
      content,
      gate_result: PASS_THROUGH_GATE_RESULT,
      gate_overrides: [],
      revision,
    });

    if (result.kind === "stale") {
      return NextResponse.json(
        {
          success: false,
          error: "Stale draft revision",
          current_revision: result.current_revision,
        },
        { status: 409 }
      );
    }

    if (result.kind === "frozen") {
      return NextResponse.json(
        {
          success: false,
          error: "Draft is frozen",
          status: result.status,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      reply_id: result.reply.id,
      gate_result: result.reply.gate_result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
