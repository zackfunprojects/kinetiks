import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { NextRequest } from "next/server";

/**
 * GET /api/marcus/threads
 * List threads for the account. Optional search.
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const search = request.nextUrl.searchParams.get("search");

  const admin = createAdminClient();

  let query = admin
    .from("kinetiks_marcus_threads")
    .select("*")
    .eq("account_id", auth.account_id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(30);

  if (search?.trim()) {
    query = query.ilike("title", `%${search.trim()}%`);
  }

  const { data: threads, error: queryError } = await query;

  if (queryError) {
    return apiError(`Failed to fetch threads: ${queryError.message}`, 500);
  }

  return apiSuccess({ threads: threads ?? [] });
}
