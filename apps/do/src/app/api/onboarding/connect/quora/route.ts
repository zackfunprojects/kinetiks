/**
 * POST /api/onboarding/connect/quora
 *
 * Persists the user's Quora profile URL into deskof_platform_accounts.
 * Quora has no OAuth — we just need the handle so Mirror's history
 * scrape (Phase 7) and Pulse's 3-layer answer match flow (Phase 5)
 * know who to look for.
 *
 * Phase 2.5 ships the storage step. The history-scrape job lands later.
 */
import { NextResponse } from "next/server";
import { requireDeskOfSession } from "@/lib/auth/session";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { createDeskOfServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["quora.com", "www.quora.com"]);

function parseQuoraProfile(raw: unknown): {
  url: string;
  handle: string;
} | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
  if (!parsed.pathname.startsWith("/profile/")) return null;
  const handle = parsed.pathname.replace(/^\/profile\//, "").replace(/\/$/, "");
  if (!handle) return null;
  parsed.protocol = "https:";
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  return { url: parsed.toString(), handle };
}

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

  const profile = parseQuoraProfile(
    (raw as { profile_url?: unknown }).profile_url
  );
  if (!profile) {
    return NextResponse.json(
      {
        success: false,
        error: "Provide a valid Quora profile URL (https://www.quora.com/profile/...)",
      },
      { status: 400 }
    );
  }

  // Service role write — deskof_platform_accounts has no insert
  // policy for the authenticated role (Edge Functions own all writes
  // to that table because of the encrypted token columns).
  const admin = createDeskOfAdminClient();
  const { error: writeError } = await admin
    .from("deskof_platform_accounts")
    .upsert(
      {
        user_id: auth.session.user_id,
        platform: "quora",
        account_handle: profile.handle,
      },
      { onConflict: "user_id,platform" }
    );

  if (writeError) {
    return NextResponse.json(
      { success: false, error: writeError.message },
      { status: 500 }
    );
  }

  // Mark the Quora half of the connect step complete on the onboarding
  // state row. We do NOT auto-advance current_step because the user may
  // still need to handle the Reddit half — that ships when the OAuth
  // client lands. The connect-skip route is what advances current_step.
  const supabase = createDeskOfServerClient();
  await supabase
    .from("deskof_onboarding_state")
    .update({ quora_connected_at: new Date().toISOString() })
    .eq("user_id", auth.session.user_id);

  return NextResponse.json({
    success: true,
    handle: profile.handle,
    url: profile.url,
  });
}
