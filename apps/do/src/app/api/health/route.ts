import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness check for DeskOf. Returns app version and current commit
 * for ops dashboards. Does NOT check downstream service health — that
 * is the responsibility of dedicated probes per service in Phase 8.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "deskof",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
  });
}
