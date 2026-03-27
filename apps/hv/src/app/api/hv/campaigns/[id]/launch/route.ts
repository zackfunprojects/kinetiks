import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { enrollBatch } from "@/lib/sequences/enroll";

interface RouteContext {
  params: { id: string };
}

interface ProspectFilter {
  seniority?: string;
  source?: string;
  tags?: string[];
  lead_score_min?: number;
}

/**
 * POST /api/hv/campaigns/:id/launch
 *
 * Launch a campaign: query contacts matching the prospect filter,
 * enroll them all into the campaign's sequence, and mark campaign active.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { id } = params;
  const admin = createAdminClient();

  // Load campaign
  const { data: campaign, error: campError } = await admin
    .from("hv_campaigns")
    .select("id, name, sequence_id, prospect_filter, status")
    .eq("id", id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (campError || !campaign) {
    return apiError("Campaign not found", 404);
  }

  if (campaign.status === "active") {
    return apiError("Campaign is already active", 400);
  }

  if (!campaign.sequence_id) {
    return apiError("Campaign has no sequence assigned", 400);
  }

  const filter = (campaign.prospect_filter ?? {}) as ProspectFilter;

  // Require at least one filter to prevent accidental mass enrollment
  const hasFilter =
    filter.seniority ||
    filter.source ||
    (filter.tags && filter.tags.length > 0) ||
    (filter.lead_score_min !== undefined && filter.lead_score_min > 0);

  if (!hasFilter) {
    return apiError("No prospect filter set. Add at least one filter criteria before launching.", 400);
  }

  // Build contact query based on filter
  let query = admin
    .from("hv_contacts")
    .select("id")
    .eq("kinetiks_id", auth.account_id)
    .eq("suppressed", false);

  if (filter.seniority) {
    query = query.eq("seniority", filter.seniority);
  }
  if (filter.source) {
    query = query.eq("source", filter.source);
  }
  if (filter.tags && filter.tags.length > 0) {
    query = query.overlaps("tags", filter.tags);
  }
  if (filter.lead_score_min !== undefined && filter.lead_score_min > 0) {
    query = query.gte("lead_score", filter.lead_score_min);
  }

  const { data: contacts, error: queryError } = await query;

  if (queryError) {
    return apiError(`Failed to query contacts: ${queryError.message}`, 500);
  }

  if (!contacts || contacts.length === 0) {
    return apiError("No contacts match the prospect filter", 400);
  }

  const contactIds = contacts.map((c: { id: string }) => c.id);

  // Enroll all matching contacts
  const batchResult = await enrollBatch(
    admin,
    auth.account_id,
    contactIds,
    campaign.sequence_id,
    campaign.id,
  );

  // Update campaign status to active
  await admin
    .from("hv_campaigns")
    .update({
      status: "active",
      stats: {
        enrolled: batchResult.enrolled,
        sent: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Log activity
  await admin
    .from("hv_activities")
    .insert({
      kinetiks_id: auth.account_id,
      type: "campaign_launched",
      content: {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        sequence_id: campaign.sequence_id,
        total_matched: contactIds.length,
        enrolled: batchResult.enrolled,
        skipped: batchResult.skipped,
      },
      source_app: "harvest",
      source_operator: "campaign_engine",
    })
    .then(({ error: activityErr }) => {
      if (activityErr) console.error("[launch] Failed to log activity:", activityErr.message);
    });

  return apiSuccess({
    enrolled: batchResult.enrolled,
    skipped: batchResult.skipped,
    total_matched: contactIds.length,
  });
}
