/**
 * POST /api/dev/seed-fixtures
 *
 * Dev-only fixture loader that drops a small set of realistic Quora
 * thread + opportunity rows into the DB for the signed-in user. Used
 * to exercise the Write loop end-to-end before the real Reddit /
 * Quora ingestion paths exist.
 *
 * Production safety:
 *   - Refuses unless NODE_ENV !== "production" OR
 *     DESKOF_ALLOW_DEV_SEED === "true"
 *   - Requires an authenticated session
 *   - Uses the service-role admin client because deskof_threads has
 *     no insert policy for the authenticated role
 *
 * The fixtures themselves are clearly labeled with "[Fixture]" in the
 * title so any leak into a production environment is obvious.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { seedFixturesForUser } from "@/lib/dev/thread-fixtures";

export const dynamic = "force-dynamic";

function isAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.DESKOF_ALLOW_DEV_SEED === "true";
}

export async function POST() {
  if (!isAllowed()) {
    return NextResponse.json(
      { success: false, error: "Dev seed disabled in this environment" },
      { status: 403 }
    );
  }

  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  const admin = createDeskOfAdminClient();
  try {
    const result = await seedFixturesForUser(admin, auth.session.user_id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
