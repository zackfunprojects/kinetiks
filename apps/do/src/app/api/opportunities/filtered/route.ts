/**
 * GET /api/opportunities/filtered — today's filtered threads.
 *
 * Phase 4 (Quality Addendum #7). Returns the rows Scout v2 dropped
 * before they reached the queue, with educational reasons. The Write
 * tab header counter and the FilteredFeedSheet both consume this.
 *
 * Tier gating: free tier sees the count via the GET (UI hides the
 * sheet contents). Standard+ sees the full list. Hero gets the
 * digest summary in a follow-up PR.
 *
 * Daily reset: only rows whose `filtered_at` falls in the user's
 * current calendar day are returned. The DB rows persist for Pulse
 * / Mirror calibration but the review surface treats each day as a
 * fresh slate.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import { canAccess } from "@/lib/tier-config";
import {
  countTodaysFilteredThreads,
  getTodaysFilteredThreads,
} from "@/lib/opportunities/filtered";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireDeskOfSession();
  if ("error" in auth) return auth.error;

  const supabase = createDeskOfServerClient();

  // Free tier: count only. The sheet UI is gated to Standard+ via
  // <UpgradeGate> on the client. Returning the count without the
  // list lets the header badge work for everyone (it's the
  // upgrade-conversion trigger).
  if (!canAccess("filtered_feed_full", auth.session.tier)) {
    try {
      const count = await countTodaysFilteredThreads(
        supabase,
        auth.session.user_id
      );
      return NextResponse.json({
        success: true,
        count,
        threads: [],
        gated: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }
  }

  try {
    const threads = await getTodaysFilteredThreads(
      supabase,
      auth.session.user_id
    );
    return NextResponse.json({
      success: true,
      count: threads.length,
      threads,
      gated: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
