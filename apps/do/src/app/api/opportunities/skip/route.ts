/**
 * POST /api/opportunities/skip — record a skip with its reason.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { skipOpportunity } from "@/lib/opportunities/queue";
import type { SkipReason } from "@kinetiks/deskof";

export const dynamic = "force-dynamic";

const VALID_REASONS: ReadonlySet<SkipReason> = new Set<SkipReason>([
  "already_well_answered",
  "not_my_expertise",
  "too_promotional",
  "bad_timing",
  "other",
]);

interface SkipBody {
  opportunity_id?: string;
  reason?: string;
}

export async function POST(request: Request) {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  let body: SkipBody;
  try {
    body = (await request.json()) as SkipBody;
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
  if (!body.reason || !VALID_REASONS.has(body.reason as SkipReason)) {
    return NextResponse.json(
      { success: false, error: "Invalid skip reason" },
      { status: 400 }
    );
  }

  const supabase = createDeskOfServerClient();
  try {
    await skipOpportunity(
      supabase,
      auth.session.user_id,
      body.opportunity_id,
      body.reason as SkipReason
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
