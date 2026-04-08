/**
 * POST /api/reply/post — submit a gate-cleared, human-confirmed reply.
 *
 * The single-use confirmation token issued by /api/reply/prepare-confirmation
 * MUST match the current content. If anything has changed since
 * confirmation (content edits, token expiry, wrong user) the post is
 * rejected and the client must re-confirm.
 *
 * Phase 2:
 *   - Quora: returns a browser handoff (clipboard text + URL) and marks
 *     the reply pending. The user pastes manually on Quora and confirms
 *     in DeskOf via the "I posted this" flow (Phase 5 wires Pulse to
 *     match the answer back via the 3-layer fingerprint pipeline).
 *   - Reddit: deferred until the Reddit OAuth follow-up PR. Calling
 *     this endpoint with a Reddit opportunity returns a 503 explaining
 *     Reddit posting is not yet enabled in this build.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { getActionableOpportunityById } from "@/lib/opportunities/queue";
import { consumeConfirmationToken } from "@/lib/reply/confirmation-token";
import { markQuoraHandoffPending } from "@/lib/reply/service";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { runLensForRequest } from "@/lib/lens/run";

export const dynamic = "force-dynamic";

interface PostBody {
  opportunity_id?: string;
  content?: string;
  confirmation_token?: string;
}

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body.opportunity_id || !body.content || !body.confirmation_token) {
    return NextResponse.json(
      {
        success: false,
        error: "opportunity_id, content, and confirmation_token are required",
      },
      { status: 400 }
    );
  }

  // 1. Consume the single-use confirmation token. This is the API-layer
  //    enforcement of human-only publishing.
  const tokenResult = consumeConfirmationToken({
    token: body.confirmation_token,
    user_id: auth.session.user_id,
    content: body.content,
  });
  if (!tokenResult.ok) {
    return NextResponse.json(
      { success: false, error: tokenResult.reason },
      { status: 401 }
    );
  }
  if (tokenResult.opportunity_id !== body.opportunity_id) {
    return NextResponse.json(
      { success: false, error: "Confirmation token does not match opportunity" },
      { status: 401 }
    );
  }

  // 2. Load the opportunity to determine the platform.
  const supabase = createDeskOfServerClient();
  const opportunity = await getActionableOpportunityById(
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

  const platform = opportunity.thread.platform;

  // 2b. Server-side gate re-validation (build-plan §3.6).
  // Re-runs Lens against the just-confirmed content. If the gate is
  // past advisory phase AND returns "blocked", we refuse to consume
  // the confirmation token so the client cannot bypass an in-editor
  // override. The token validation above intentionally does NOT mark
  // the token consumed yet — only the Quora handoff path commits.
  const serverGate = await runLensForRequest(supabase, {
    user_id: auth.session.user_id,
    user_tier: auth.session.tier,
    opportunity_id: body.opportunity_id,
    platform,
    community: opportunity.thread.community ?? null,
    thread_question: opportunity.thread.title,
    content: body.content,
  });
  if (serverGate.status === "blocked" && !serverGate.advisory_only) {
    return NextResponse.json(
      {
        success: false,
        error: "gate_blocked",
        gate_result: serverGate,
      },
      { status: 422 }
    );
  }

  // 3. Phase 2 dispatch — Quora handoff or Reddit-not-yet-available.
  if (platform === "reddit") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Reddit posting is not enabled in this build. The Reddit OAuth client lands in a follow-up PR once Reddit Data API access is approved.",
      },
      { status: 503 }
    );
  }

  if (platform === "quora") {
    // Mark the reply ready and pending Quora confirmation. The DB-level
    // posted_at constraint is NOT satisfied here — Quora has no API and
    // we never set posted_at server-side until the user confirms via
    // /api/reply/quora-confirm (Phase 5).
    //
    // markQuoraHandoffPending guards against rewriting human_confirmed_at
    // on a repeat call, so a double-tap of Post is idempotent rather than
    // skewing Pulse's retry window anchor.
    const admin = createDeskOfAdminClient();
    let result;
    try {
      result = await markQuoraHandoffPending(admin, {
        user_id: auth.session.user_id,
        opportunity_id: body.opportunity_id,
        confirmed_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }

    // Map the result. "marked" and "already_confirmed" are both success
    // (idempotent re-tap of Post). "not_found" means the draft autosave
    // hasn't created the row yet — surface 404 so the editor can retry.
    // "wrong_platform" should be impossible at this point because we
    // checked platform above, but handle defensively.
    if (result.kind === "not_found") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Draft has not been saved yet — wait for the next autosave and try again",
        },
        { status: 404 }
      );
    }
    if (result.kind === "wrong_platform") {
      return NextResponse.json(
        {
          success: false,
          error: `Reply row is for platform ${result.platform}, not Quora`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      kind: "browser_handoff",
      handoff_url: opportunity.thread.url,
      clipboard_text: body.content,
    });
  }

  return NextResponse.json(
    { success: false, error: `Unsupported platform: ${platform}` },
    { status: 400 }
  );
}
