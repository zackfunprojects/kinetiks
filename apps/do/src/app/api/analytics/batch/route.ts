/**
 * Analytics batch ingest endpoint.
 *
 * Receives a batch of events from the client analytics wrapper and
 * persists them to deskof_analytics_events. user_id_hash is provided
 * by the client; we never join it back to a real user from this path.
 *
 * The endpoint is auth-optional — anonymous events still need to be
 * accepted (e.g., the privacy disclosure modal fires before the user
 * is authenticated).
 *
 * Per CLAUDE.md cross-cutting requirement #5: analytics is instrumented
 * during component build, not as a Phase 8 retrofit.
 */
import { NextResponse } from "next/server";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface IncomingEvent {
  name: string;
  properties: Record<string, unknown>;
  occurred_at: string;
  context: {
    user_id_hash: string | null;
    session_id: string;
    user_tier: "free" | "standard" | "hero" | null;
    user_track: "minimal" | "standard" | "hero" | null;
    platform: "web" | "pwa";
    app_version: string;
  };
}

interface IncomingBatch {
  events: IncomingEvent[];
}

const MAX_BATCH_SIZE = 100;
const MAX_NAME_LENGTH = 80;

export async function POST(request: Request) {
  let body: IncomingBatch;
  try {
    body = (await request.json()) as IncomingBatch;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json(
      { success: false, error: "events must be a non-empty array" },
      { status: 400 }
    );
  }

  if (body.events.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { success: false, error: `events length exceeds ${MAX_BATCH_SIZE}` },
      { status: 413 }
    );
  }

  const rows = body.events
    .filter((e) => typeof e.name === "string" && e.name.length <= MAX_NAME_LENGTH)
    .map((e) => ({
      user_id_hash: e.context?.user_id_hash ?? null,
      session_id: e.context?.session_id ?? "unknown",
      event_name: e.name,
      properties: e.properties ?? {},
      user_tier: e.context?.user_tier ?? null,
      user_track: e.context?.user_track ?? null,
      platform: e.context?.platform ?? "web",
      app_version: e.context?.app_version ?? null,
      occurred_at: e.occurred_at ?? new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ success: true, accepted: 0 });
  }

  const admin = createDeskOfAdminClient();
  const { error } = await admin.from("deskof_analytics_events").insert(rows);

  if (error) {
    // Analytics failures should never surface to the user, but log
    // server-side for ops monitoring.
    console.error("analytics ingest failed:", error.message);
    return NextResponse.json(
      { success: false, error: "ingest failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, accepted: rows.length });
}
