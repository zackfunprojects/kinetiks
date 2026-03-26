import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { OverviewMetrics, CampaignMetric, SequenceMetric } from "@/types/analytics";

type AnalyticsView = "overview" | "campaigns" | "sequences";

/**
 * GET /api/hv/analytics?view=overview|campaigns|sequences
 * Returns email analytics for the authenticated account.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const view = (url.searchParams.get("view") ?? "overview") as AnalyticsView;

  if (view === "overview") {
    const { data: emails, error: queryError } = await admin
      .from("hv_emails")
      .select("status, sent_at, opened_at, clicked_at, replied_at, bounced_at")
      .eq("kinetiks_id", auth.account_id)
      .not("sent_at", "is", null);

    if (queryError) return apiError(queryError.message, 500);

    const rows = emails ?? [];
    const total_sent = rows.length;
    const total_opened = rows.filter((e) => e.opened_at !== null).length;
    const total_clicked = rows.filter((e) => e.clicked_at !== null).length;
    const total_replied = rows.filter((e) => e.replied_at !== null).length;
    const total_bounced = rows.filter((e) => e.bounced_at !== null).length;

    const metrics: OverviewMetrics = {
      total_sent,
      total_opened,
      total_clicked,
      total_replied,
      total_bounced,
      open_rate: total_sent > 0 ? Math.round((total_opened / total_sent) * 10000) / 100 : 0,
      click_rate: total_sent > 0 ? Math.round((total_clicked / total_sent) * 10000) / 100 : 0,
      reply_rate: total_sent > 0 ? Math.round((total_replied / total_sent) * 10000) / 100 : 0,
      bounce_rate: total_sent > 0 ? Math.round((total_bounced / total_sent) * 10000) / 100 : 0,
    };

    return apiSuccess(metrics);
  }

  if (view === "campaigns") {
    const { data: campaigns, error: queryError } = await admin
      .from("hv_campaigns")
      .select("id, name, status, stats")
      .eq("kinetiks_id", auth.account_id)
      .order("updated_at", { ascending: false });

    if (queryError) return apiError(queryError.message, 500);

    const metrics: CampaignMetric[] = (campaigns ?? []).map((c) => {
      const stats = (c.stats ?? {}) as Record<string, number>;
      const sent = stats.sent ?? 0;
      const opened = stats.opened ?? 0;
      const replied = stats.replied ?? 0;
      const bounced = stats.bounced ?? 0;
      return {
        id: c.id as string,
        name: c.name as string,
        status: c.status as string,
        sent,
        opened,
        replied,
        bounced,
        open_rate: sent > 0 ? Math.round((opened / sent) * 10000) / 100 : 0,
        reply_rate: sent > 0 ? Math.round((replied / sent) * 10000) / 100 : 0,
      };
    });

    return apiSuccess(metrics);
  }

  if (view === "sequences") {
    const { data: sequences, error: queryError } = await admin
      .from("hv_sequences")
      .select("id, name, status, stats")
      .eq("kinetiks_id", auth.account_id)
      .order("updated_at", { ascending: false });

    if (queryError) return apiError(queryError.message, 500);

    const metrics: SequenceMetric[] = (sequences ?? []).map((s) => {
      const stats = (s.stats ?? {}) as Record<string, number>;
      const enrolled = stats.enrolled ?? 0;
      const completed = stats.completed ?? 0;
      const replied = stats.replied ?? 0;
      const bounced = stats.bounced ?? 0;
      return {
        id: s.id as string,
        name: s.name as string,
        status: s.status as string,
        enrolled,
        completed,
        replied,
        bounced,
        completion_rate: enrolled > 0 ? Math.round((completed / enrolled) * 10000) / 100 : 0,
        reply_rate: enrolled > 0 ? Math.round((replied / enrolled) * 10000) / 100 : 0,
      };
    });

    return apiSuccess(metrics);
  }

  return apiError(`Invalid view: ${view}. Use overview, campaigns, or sequences.`, 400);
}
