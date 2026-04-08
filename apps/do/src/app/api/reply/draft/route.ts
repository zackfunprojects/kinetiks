/**
 * POST /api/reply/draft — create or update a draft reply.
 *
 * Phase 3: every draft is run through the Lens quality gate. The
 * resulting `GateResult` is stored on the row and returned to the
 * editor so it can render the gate panel inline. During the user's
 * first 30 days the gate is advisory-only and never blocks; after
 * that, blocking is enabled incrementally per Final Supplement §6.3.
 *
 * The route accepts a monotonic `revision` from the editor. Out-of-order
 * autosaves are rejected with 409 + the current revision so the client
 * can decide whether to bump and retry. Frozen rows (already posted, or
 * mid-handoff for Quora) are rejected with 409 + status so the editor
 * surface can transition to a read-only state.
 *
 * The draft route NEVER returns 422 on a blocked gate result — the
 * editor still needs to save the user's text. The post route is what
 * enforces hard blocks (build-plan §3.6).
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getActionableOpportunityById } from "@/lib/opportunities/queue";
import { upsertDraftReply, previewDraftState } from "@/lib/reply/service";
import { runLensForRequest } from "@/lib/lens/run";

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

  // Preflight: short-circuit stale or frozen autosaves BEFORE paying
  // the Lens DB + LLM cost. The full upsertDraftReply below also
  // re-checks because a concurrent autosave can race in between, but
  // skipping the gate on a known-bad write saves wasted work and
  // makes overlapping autosaves much less likely to let an older
  // revision overtake a newer one.
  try {
    const preflight = await previewDraftState(supabase, {
      user_id: auth.session.user_id,
      opportunity_id: opportunityId,
      platform: opportunity.thread.platform,
      revision,
    });
    if (preflight.kind === "stale") {
      return NextResponse.json(
        {
          success: false,
          error: "Stale draft revision",
          current_revision: preflight.current_revision,
        },
        { status: 409 }
      );
    }
    if (preflight.kind === "frozen") {
      return NextResponse.json(
        {
          success: false,
          error: "Draft is frozen",
          status: preflight.status,
        },
        { status: 409 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }

  // Run the Lens quality gate. NEVER throws — the orchestrator
  // collapses any DB / LLM failure into a clear-with-skipped result
  // so the autosave still completes.
  const gateResult = await runLensForRequest(supabase, {
    user_id: auth.session.user_id,
    user_tier: auth.session.tier,
    opportunity_id: opportunityId,
    platform: opportunity.thread.platform,
    community: opportunity.thread.community ?? null,
    thread_question: opportunity.thread.title,
    content,
  });

  try {
    const result = await upsertDraftReply(supabase, {
      user_id: auth.session.user_id,
      opportunity_id: opportunityId,
      platform: opportunity.thread.platform,
      thread_url: opportunity.thread.url,
      content,
      gate_result: gateResult,
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
