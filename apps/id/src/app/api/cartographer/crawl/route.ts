import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { crawlAndExtract } from "@/lib/cartographer/crawl";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/cartographer/crawl
 *
 * Crawl a website and extract data into the Context Structure.
 * Creates Proposals for each extracted layer and evaluates them through the Cortex pipeline.
 *
 * Body: { url: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { url } = body as { url?: string };

  if (!url || typeof url !== "string" || url.trim().length === 0) {
    return apiError("Missing or invalid 'url' field", 400);
  }

  // Validate URL format (crawlAndExtract also normalizes, but we check early to reject bad input)
  try {
    new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return apiError("Invalid URL format", 400);
  }

  const admin = createAdminClient();
  const accountId = auth.account_id;

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
    return apiError("Rate limited. Please wait 5 minutes between crawls.", 429);
  }

  // Run the crawl pipeline
  try {
    const result = await crawlAndExtract(admin, accountId, url);
    return apiSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Crawl pipeline error:", message);
    return apiError("Crawl pipeline failed", 500, message);
  }
}
