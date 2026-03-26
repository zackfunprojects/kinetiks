import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

interface RouteContext {
  params: { id: string };
}

/**
 * POST /api/hv/contacts/[id]/tags
 * Add or remove tags on a contact.
 * Body: { action: "add" | "remove", tags: string[] }
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: { action: string; tags: string[] };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as { action: string; tags: string[] };
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.action || !["add", "remove"].includes(body.action)) {
    return apiError('action must be "add" or "remove"', 400);
  }
  if (!Array.isArray(body.tags) || body.tags.length === 0) {
    return apiError("tags must be a non-empty string array", 400);
  }

  const admin = createAdminClient();

  // Fetch current tags
  const { data: contact, error: selectError } = await admin
    .from("hv_contacts")
    .select("tags")
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (selectError) {
    return apiError(`Failed to fetch contact: ${selectError.message}`, 500);
  }

  if (!contact) {
    return apiError("Contact not found", 404);
  }

  const currentTags = (contact.tags as string[]) ?? [];
  let newTags: string[];

  if (body.action === "add") {
    const tagSet = new Set(currentTags);
    for (const tag of body.tags) {
      const trimmed = tag.trim();
      if (trimmed) tagSet.add(trimmed);
    }
    newTags = Array.from(tagSet);
  } else {
    const removeSet = new Set(body.tags.map((t) => t.trim()));
    newTags = currentTags.filter((t) => !removeSet.has(t));
  }

  const { error: updateError } = await admin
    .from("hv_contacts")
    .update({ tags: newTags, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("kinetiks_id", auth.account_id);

  if (updateError) {
    return apiError(`Failed to update tags: ${updateError.message}`, 500);
  }

  return apiSuccess({ tags: newTags });
}
