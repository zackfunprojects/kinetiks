import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * PATCH /api/account/onboarding-complete
 *
 * Mark the authenticated user's account as onboarding complete.
 * Uses the authenticated server client so RLS enforces access control.
 */
export async function PATCH() {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: updateError } = await serverClient
    .from("kinetiks_accounts")
    .update({
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Failed to mark onboarding complete:", updateError.message);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
