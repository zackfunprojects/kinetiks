/**
 * POST /api/reply/quora-confirm
 *
 * The user has manually pasted their reply on Quora, submitted it,
 * and come back to DeskOf to confirm. This endpoint:
 *
 *   1. Authenticates the user
 *   2. Verifies the reply row exists and belongs to them
 *   3. Records the human confirmation (if not already)
 *   4. Sets the row's quora_match_status to 'pending'
 *
 * Phase 5 will additionally enqueue a Pulse job that runs the 3-layer
 * answer match (fingerprint → URL fallback → 48hr timed retry). For
 * Phase 2.5 we just persist the timestamp so the future Pulse job has
 * a starting point.
 *
 * Note: this endpoint does NOT set posted_at on the reply row. Quora
 * has no API confirmation that an answer landed; we only know once
 * Pulse matches the fingerprint against the question page.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { markQuoraHandoffPending } from "@/lib/reply/service";

export const dynamic = "force-dynamic";

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
  if (typeof opportunityId !== "string" || opportunityId.length === 0) {
    return NextResponse.json(
      { success: false, error: "Missing opportunity_id" },
      { status: 400 }
    );
  }

  // markQuoraHandoffPending writes the human_confirmed_at timestamp
  // and the quora_match_status='pending' marker. The reply must
  // already exist (the editor's draft autosave creates it before the
  // user can post). The function returns a discriminated result so
  // we can map missing / wrong-platform / already-confirmed cases to
  // 404 / 409 instead of unconditionally returning 200.
  const admin = createDeskOfAdminClient();
  let result;
  try {
    result = await markQuoraHandoffPending(admin, {
      user_id: auth.session.user_id,
      opportunity_id: opportunityId,
      confirmed_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }

  switch (result.kind) {
    case "marked":
      return NextResponse.json({ success: true, status: "marked" });
    case "already_confirmed":
      // Treat as success — the caller's intent (mark this confirmed)
      // is satisfied — but distinguish in the response so the UI can
      // skip the "starting tracking..." spinner.
      return NextResponse.json(
        { success: true, status: "already_confirmed" },
        { status: 200 }
      );
    case "wrong_platform":
      return NextResponse.json(
        {
          success: false,
          error: `quora-confirm called for a non-Quora platform (${result.platform})`,
        },
        { status: 409 }
      );
    case "not_found":
      return NextResponse.json(
        { success: false, error: "Reply not found for this opportunity" },
        { status: 404 }
      );
  }
}
