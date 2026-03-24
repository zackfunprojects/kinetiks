import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { askClaude } from "@kinetiks/ai";
import { assembleContext } from "@/lib/marcus/context-assembly";
import {
  buildDailyBriefPrompt,
  buildWeeklyDigestPrompt,
  buildMonthlyReviewPrompt,
} from "@/lib/ai/prompts/marcus-brief";
import type { MarcusScheduleType } from "@kinetiks/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/marcus/brief
 *
 * Generate a scheduled brief on demand.
 * Called by users (preview) or CRON Edge Functions (delivery).
 *
 * Body: { type: 'daily_brief' | 'weekly_digest' | 'monthly_review', account_id?: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const { type, account_id: bodyAccountId } = body as {
    type?: MarcusScheduleType;
    account_id?: string;
  };

  const validTypes: MarcusScheduleType[] = [
    "daily_brief",
    "weekly_digest",
    "monthly_review",
  ];

  if (!type || !validTypes.includes(type)) {
    return apiError("type must be one of: daily_brief, weekly_digest, monthly_review", 400);
  }

  const admin = createAdminClient();

  // Resolve account
  let accountId: string;
  if (auth.auth_method === "internal" && typeof bodyAccountId === "string" && bodyAccountId) {
    accountId = bodyAccountId;
  } else {
    accountId = auth.account_id;
  }

  // Assemble context for the brief (strategic intent gets the most data)
  const contextSummary = await assembleContext(
    admin,
    accountId,
    "strategic"
  );

  // Get recent activity based on brief type
  const recentActivity = await getRecentActivity(admin, accountId, type);

  // Build prompt based on type
  let prompt: string;
  switch (type) {
    case "daily_brief":
      prompt = buildDailyBriefPrompt(contextSummary, recentActivity);
      break;
    case "weekly_digest":
      prompt = buildWeeklyDigestPrompt(contextSummary, recentActivity);
      break;
    case "monthly_review":
      prompt = buildMonthlyReviewPrompt(contextSummary, recentActivity);
      break;
  }

  // Generate brief
  const content = await askClaude(prompt, {
    model: "claude-sonnet-4-20250514",
    maxTokens: type === "monthly_review" ? 4096 : 2048,
  });

  return apiSuccess({ type, content });
}

async function getRecentActivity(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  type: MarcusScheduleType
): Promise<string> {
  const now = new Date();
  let since: Date;

  switch (type) {
    case "daily_brief":
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "weekly_digest":
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly_review":
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  const sinceStr = since.toISOString();
  const parts: string[] = [];

  // Recent proposals
  const { data: proposals } = await admin
    .from("kinetiks_proposals")
    .select("source_app, target_layer, action, status, submitted_at")
    .eq("account_id", accountId)
    .gte("submitted_at", sinceStr)
    .order("submitted_at", { ascending: false })
    .limit(20);

  if (proposals?.length) {
    const accepted = proposals.filter((p) => p.status === "accepted").length;
    const declined = proposals.filter((p) => p.status === "declined").length;
    const pending = proposals.filter((p) => p.status === "submitted").length;
    parts.push(
      `Proposals: ${proposals.length} total (${accepted} accepted, ${declined} declined, ${pending} pending)`
    );
  }

  // Recent ledger entries
  const { data: ledger } = await admin
    .from("kinetiks_ledger")
    .select("event_type, source_app, target_layer, created_at")
    .eq("account_id", accountId)
    .gte("created_at", sinceStr)
    .order("created_at", { ascending: false })
    .limit(20);

  if (ledger?.length) {
    const types = [...new Set(ledger.map((l) => l.event_type))];
    parts.push(`Ledger activity: ${ledger.length} entries (${types.join(", ")})`);
  }

  // Confidence changes
  const { data: confidence } = await admin
    .from("kinetiks_confidence")
    .select("aggregate, updated_at")
    .eq("account_id", accountId)
    .single();

  if (confidence) {
    parts.push(`Current confidence: ${confidence.aggregate}%`);
  }

  return parts.length > 0
    ? parts.join("\n")
    : "No recent activity in this period.";
}
