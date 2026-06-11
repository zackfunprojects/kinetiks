import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { askClaude } from "@kinetiks/ai";
import { serverEnv } from "@kinetiks/lib/env";
import { ToolError } from "@kinetiks/tools";
import { assembleContext } from "@/lib/marcus/context-assembly";
import {
  buildDailyBriefPrompt,
  buildWeeklyDigestPrompt,
  buildMonthlyReviewPrompt,
} from "@/lib/ai/prompts/marcus-brief";
import { briefContentTemplate } from "@/lib/email/templates";
import { resolveOwnerEmail, sendSystemEmail } from "@/lib/email/sender";
import { createInAppAlert, deliverSlackDm } from "@/lib/comms/proactive-delivery";
import { captureException } from "@/lib/observability/sentry";
import type { MarcusScheduleType } from "@kinetiks/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

const BRIEF_TITLES: Record<MarcusScheduleType, string> = {
  daily_brief: "Daily Brief",
  weekly_digest: "Weekly Digest",
  monthly_review: "Monthly Review",
};

/**
 * What happened to each leg of a deliver:true request. Honest per
 * leg: "sent"/"created" mean it actually happened; "skipped" means
 * the channel preference excluded the leg; "unavailable" means the
 * leg has no working transport (no slack connection / installer
 * mapping); "failed" means it was attempted (or blocked by an
 * infrastructure failure) and captured.
 */
export interface BriefDelivery {
  email: "sent" | "skipped" | "failed";
  slack: "sent" | "skipped" | "unavailable" | "failed";
  in_app: "created" | "failed";
}

/**
 * POST /api/marcus/brief
 *
 * Generate a scheduled brief on demand — and, since D2, optionally
 * deliver it ("Send now" actually sends).
 *
 * Body: {
 *   type: 'daily_brief' | 'weekly_digest' | 'monthly_review',
 *   account_id?: string,   // internal callers only
 *   deliver?: boolean      // false/absent = preview-only (pre-D2 behavior)
 * }
 *
 * Delivery is explicit user intent (the Send-now button), so it sends
 * without an approval card per comms spec §2.4 ("the user explicitly
 * asked"); the sender still enforces the internal-recipient policy
 * and the 20/24h cap regardless of caller.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-only", allowInternal: true });
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
  const deliver = body.deliver === true;

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
      prompt = await buildWeeklyDigestPrompt(contextSummary, recentActivity);
      break;
    case "monthly_review":
      prompt = await buildMonthlyReviewPrompt(contextSummary, recentActivity);
      break;
  }

  // Generate brief
  const content = await askClaude(prompt, {
    model: "claude-sonnet-4-20250514",
    maxTokens: type === "monthly_review" ? 4096 : 2048,
  });

  if (!deliver) {
    return apiSuccess({ type, content });
  }

  const delivery = await deliverBrief({ admin, accountId, type, content });
  return apiSuccess({ type, content, delivery });
}

async function deliverBrief(args: {
  admin: ReturnType<typeof createAdminClient>;
  accountId: string;
  type: MarcusScheduleType;
  content: string;
}): Promise<BriefDelivery> {
  const { admin, accountId, type, content } = args;

  // The schedule's channel decides the email/slack legs. No schedule
  // ROW = email-only; the in-app alert is unconditional (the app is
  // the system's home surface). A failed LOOKUP must not default
  // anywhere (CR: a transient DB error on a slack-only account would
  // otherwise send email against the customer's preference): both
  // send legs report failed and nothing external sends.
  const { data: schedule, error: scheduleError } = await admin
    .from("kinetiks_marcus_schedules")
    .select("channel")
    .eq("account_id", accountId)
    .eq("type", type)
    .maybeSingle();
  if (scheduleError) {
    await captureException(scheduleError, {
      tags: {
        route: "/api/marcus/brief",
        action: "brief.deliver",
        stage: "schedule_lookup",
        app: "id",
      },
      user: { id: accountId },
      extra: { brief_type: type },
    });
    return { email: "failed", slack: "failed", in_app: "failed" };
  }
  const channel = (schedule?.channel as string | undefined) ?? "email";
  const wantsEmail = channel === "email" || channel === "both";
  const wantsSlack = channel === "slack" || channel === "both";

  const delivery: BriefDelivery = {
    email: wantsEmail ? "failed" : "skipped",
    slack: wantsSlack ? "failed" : "skipped",
    in_app: "failed",
  };

  const appUrl = serverEnv().NEXT_PUBLIC_APP_URL ?? "https://kinetiks.ai";
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("system_name")
    .eq("id", accountId)
    .maybeSingle();
  const systemName =
    typeof account?.system_name === "string" && account.system_name.trim()
      ? account.system_name.trim()
      : "Kinetiks";

  if (wantsEmail) {
    try {
      const rendered = briefContentTemplate({
        systemName,
        appUrl,
        briefTitle: BRIEF_TITLES[type],
        content,
      });
      const ownerEmail = await resolveOwnerEmail(accountId);
      await sendSystemEmail({
        account_id: accountId,
        to: [ownerEmail],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        kind: "brief",
      });
      delivery.email = "sent";
    } catch (err) {
      const errorClass = err instanceof ToolError ? err.errorClass : "unknown";
      // Per CLAUDE.md, real throttling (the 20/24h cap) is expected
      // behavior, maps to a failed leg, and never goes to Sentry.
      if (errorClass !== "rate_limited") {
        await captureException(err, {
          tags: {
            route: "/api/marcus/brief",
            action: "brief.deliver",
            stage: "email_send",
            app: "id",
          },
          user: { id: accountId },
          extra: { brief_type: type, error_class: errorClass },
        });
      }
      delivery.email = "failed";
    }
  }

  if (wantsSlack) {
    try {
      // DM the customer as the named system (D4): the brief body plus
      // a link back. "unavailable" = no live connection or no
      // installer mapping - reported, never faked.
      const outcome = await deliverSlackDm({
        account_id: accountId,
        body: `*${BRIEF_TITLES[type]}*\n\n${content}\n\n<${appUrl}/chat|Open ${systemName}>`,
      });
      delivery.slack = outcome;
    } catch (err) {
      const errorClass = err instanceof ToolError ? err.errorClass : "unknown";
      if (errorClass !== "rate_limited") {
        await captureException(err, {
          tags: {
            route: "/api/marcus/brief",
            action: "brief.deliver",
            stage: "slack_send",
            app: "id",
          },
          user: { id: accountId },
          extra: { brief_type: type, error_class: errorClass },
        });
      }
      delivery.slack = "failed";
    }
  }

  try {
    await createInAppAlert({
      account_id: accountId,
      title: BRIEF_TITLES[type],
      body: content,
      severity: "info",
      trigger_type: "gap",
      delivered_via: [
        "in_app",
        ...(delivery.email === "sent" ? ["email"] : []),
        ...(delivery.slack === "sent" ? ["slack"] : []),
      ],
    });
    delivery.in_app = "created";
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/marcus/brief",
        action: "brief.deliver",
        stage: "in_app_alert",
        app: "id",
      },
      user: { id: accountId },
      extra: { brief_type: type },
    });
    delivery.in_app = "failed";
  }

  return delivery;
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
