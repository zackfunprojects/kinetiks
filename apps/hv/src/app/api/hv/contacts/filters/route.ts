import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/hv/contacts/filters
 * Returns distinct values for filter dropdowns.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();

  const [sourcesResult, tagsResult] = await Promise.all([
    admin
      .from("hv_contacts")
      .select("source")
      .eq("kinetiks_id", auth.account_id)
      .eq("suppressed", false),
    admin
      .from("hv_contacts")
      .select("tags")
      .eq("kinetiks_id", auth.account_id)
      .eq("suppressed", false)
      .not("tags", "eq", "{}"),
  ]);

  if (sourcesResult.error) {
    return apiError(`Failed to fetch filter values: ${sourcesResult.error.message}`, 500);
  }
  if (tagsResult.error) {
    return apiError(`Failed to fetch filter values: ${tagsResult.error.message}`, 500);
  }

  // Extract unique sources
  const sourceSet = new Set<string>();
  for (const row of sourcesResult.data ?? []) {
    if ((row as { source: string }).source) {
      sourceSet.add((row as { source: string }).source);
    }
  }

  // Extract unique tags
  const tagSet = new Set<string>();
  for (const row of tagsResult.data ?? []) {
    for (const tag of (row as { tags: string[] }).tags ?? []) {
      tagSet.add(tag);
    }
  }

  return apiSuccess({
    sources: Array.from(sourceSet).sort(),
    tags: Array.from(tagSet).sort(),
    seniorities: ["cxo", "vp", "director", "manager", "senior", "entry"],
    verification_grades: ["verified", "likely", "unverified"],
  });
}
