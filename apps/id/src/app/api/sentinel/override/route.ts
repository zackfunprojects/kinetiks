import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processOverride } from "@/lib/sentinel/learning";
import type { OverrideUserAction } from "@kinetiks/types";
import { NextResponse } from "next/server";

const VALID_ACTIONS: OverrideUserAction[] = [
  "sent_unchanged",
  "edited",
  "rejected",
];

/**
 * PATCH /api/sentinel/override
 *
 * User decision on a held or flagged review.
 * Only user session auth - no service calls. Only humans override Sentinel.
 *
 * Body: { review_id: string, action: OverrideUserAction, edit_diff?: string }
 */
export async function PATCH(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { review_id: string; action: OverrideUserAction; edit_diff?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { review_id, action, edit_diff } = body;

  if (!review_id || typeof review_id !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid review_id" },
      { status: 400 }
    );
  }

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      {
        error: `Invalid action: ${action}. Must be sent_unchanged, edited, or rejected`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify user owns the review's account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 }
    );
  }

  // Verify review exists and belongs to this account
  const { data: review } = await admin
    .from("kinetiks_sentinel_reviews")
    .select("id, verdict")
    .eq("id", review_id)
    .eq("account_id", account.id)
    .single();

  if (!review) {
    return NextResponse.json(
      { error: "Review not found" },
      { status: 404 }
    );
  }

  // Only held or flagged reviews can be overridden
  const verdict = review.verdict as string;
  if (verdict !== "held" && verdict !== "flagged") {
    return NextResponse.json(
      { error: `Cannot override a review with verdict '${verdict}'. Only held or flagged reviews can be overridden.` },
      { status: 400 }
    );
  }

  const result = await processOverride(admin, account.id as string, review_id, action, edit_diff);

  if (!result.success) {
    return NextResponse.json(
      { error: "Override failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
