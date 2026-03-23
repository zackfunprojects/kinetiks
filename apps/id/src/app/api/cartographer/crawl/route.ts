import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { crawlAndExtract } from "@/lib/cartographer/crawl";
import { NextResponse } from "next/server";

/**
 * POST /api/cartographer/crawl
 *
 * Crawl a website and extract data into the Context Structure.
 * Creates Proposals for each extracted layer and evaluates them through the Cortex pipeline.
 *
 * Body: { url: string }
 */
export async function POST(request: Request) {
  // Auth - user only
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url } = body as { url?: string };

  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'url' field" },
      { status: 400 }
    );
  }

  // Validate URL format
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    new URL(normalized);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Resolve the user's Kinetiks account
  const { data: account, error: accountError } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json(
      { error: "Kinetiks account not found" },
      { status: 404 }
    );
  }

  if (typeof account.id !== "string") {
    return NextResponse.json(
      { error: "Invalid account data" },
      { status: 500 }
    );
  }

  const accountId = account.id;

  // Rate limit: check for recent crawl events (within last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentCrawls } = await admin
    .from("kinetiks_ledger")
    .select("id")
    .eq("account_id", accountId)
    .eq("event_type", "cartographer_crawl")
    .gte("created_at", fiveMinutesAgo)
    .limit(1);

  if (recentCrawls && recentCrawls.length > 0) {
    return NextResponse.json(
      { error: "Rate limited. Please wait 5 minutes between crawls." },
      { status: 429 }
    );
  }

  // Run the crawl pipeline
  try {
    const result = await crawlAndExtract(admin, accountId, url);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Crawl pipeline error:", message);
    return NextResponse.json(
      { error: "Crawl pipeline failed", detail: message },
      { status: 500 }
    );
  }
}
