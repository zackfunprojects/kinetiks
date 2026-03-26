import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/hv/contacts/bulk
 * Bulk operations on contacts.
 * Body: { ids: string[], action: "tag" | "suppress", tags?: string[], suppression_reason?: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: {
    ids: string[];
    action: string;
    tags?: string[];
    suppression_reason?: string;
  };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as typeof body;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return apiError("ids must be a non-empty string array", 400);
  }
  if (body.ids.length > 200) {
    return apiError("Maximum 200 contacts per bulk operation", 400);
  }
  if (!body.action || !["tag", "suppress"].includes(body.action)) {
    return apiError('action must be "tag" or "suppress"', 400);
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (body.action === "tag") {
    if (!Array.isArray(body.tags) || body.tags.length === 0) {
      return apiError("tags required for tag action", 400);
    }

    // Fetch current tags for all contacts
    const { data: contacts } = await admin
      .from("hv_contacts")
      .select("id, tags")
      .eq("kinetiks_id", auth.account_id)
      .in("id", body.ids);

    if (!contacts || contacts.length === 0) {
      return apiError("No matching contacts found", 404);
    }

    // Update each contact's tags (merge, dedup)
    let updated = 0;
    for (const contact of contacts) {
      const currentTags = (contact.tags as string[]) ?? [];
      const tagSet = new Set(currentTags);
      for (const tag of body.tags) {
        tagSet.add(tag.trim());
      }
      const { error: updateError } = await admin
        .from("hv_contacts")
        .update({ tags: Array.from(tagSet), updated_at: now })
        .eq("id", contact.id)
        .eq("kinetiks_id", auth.account_id);

      if (!updateError) updated++;
    }

    return apiSuccess({ updated });
  }

  if (body.action === "suppress") {
    const reason = body.suppression_reason ?? "bulk_suppressed";

    // Suppress all contacts
    const { error: suppressError, count } = await admin
      .from("hv_contacts")
      .update({
        suppressed: true,
        suppression_reason: reason,
        suppressed_at: now,
        updated_at: now,
      })
      .eq("kinetiks_id", auth.account_id)
      .in("id", body.ids);

    if (suppressError) {
      return apiError(`Failed to suppress contacts: ${suppressError.message}`, 500);
    }

    // Log suppressions for contacts with emails
    const { data: contacts } = await admin
      .from("hv_contacts")
      .select("email")
      .eq("kinetiks_id", auth.account_id)
      .in("id", body.ids)
      .not("email", "is", null);

    if (contacts && contacts.length > 0) {
      const suppressionRecords = contacts
        .filter((c: { email: string | null }) => c.email)
        .map((c: { email: string | null }) => ({
          kinetiks_id: auth.account_id,
          email: c.email,
          type: "manual",
          reason,
          source_app: "harvest",
        }));

      if (suppressionRecords.length > 0) {
        const { error: logError } = await admin.from("hv_suppressions").insert(suppressionRecords);
        if (logError) {
          console.error(`Failed to log bulk suppressions (account ${auth.account_id}):`, logError.message);
          return apiError(`Contacts suppressed but failed to log suppressions: ${logError.message}`, 500);
        }
      }
    }

    return apiSuccess({ suppressed: count ?? 0 });
  }

  return apiError("Unknown action", 400);
}
