import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/me — return the minimal session shape needed by
 * client components. The full session is server-only.
 */
export async function GET() {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  return NextResponse.json({
    user_id: auth.session.user_id,
    email: auth.session.email,
    tier: auth.session.tier,
  });
}
