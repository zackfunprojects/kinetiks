/**
 * POST /api/reply/prepare-confirmation
 *
 * Issues a single-use, content-hash-bound, 5-minute confirmation token
 * the client uses on the subsequent /api/reply/post call. This is the
 * UI-only side of the human-only-publishing constraint.
 *
 * The token is generated server-side and returned to the browser. It
 * cannot be requested from MCP or any agent context — Phase 8's MCP
 * deskof_post tool will reject any request that doesn't include a
 * token issued from this UI-bound endpoint within the prior 5 minutes.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { issueConfirmationToken } from "@/lib/reply/confirmation-token";

export const dynamic = "force-dynamic";

const MAX_REPLY_LENGTH = 10_000;

interface PrepareBody {
  opportunity_id?: string;
  content?: string;
}

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let body: PrepareBody;
  try {
    body = (await request.json()) as PrepareBody;
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

  const issued = issueConfirmationToken({
    user_id: auth.session.user_id,
    opportunity_id: body.opportunity_id,
    content: body.content,
  });

  return NextResponse.json({
    success: true,
    confirmation_token: issued.token,
    expires_at: new Date(issued.expires_at).toISOString(),
  });
}
