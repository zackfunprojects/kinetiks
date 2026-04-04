import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * GET /api/marcus/threads/[threadId]/messages
 * Load messages for a specific thread.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { threadId } = await params;

  const admin = createAdminClient();

  // Verify thread belongs to this account
  const { data: thread } = await admin
    .from("kinetiks_marcus_threads")
    .select("id")
    .eq("id", threadId)
    .eq("account_id", auth.account_id)
    .single();

  if (!thread) {
    return apiError("Thread not found", 404);
  }

  const { data: messages, error: queryError } = await admin
    .from("kinetiks_marcus_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (queryError) {
    return apiError(`Failed to fetch messages: ${queryError.message}`, 500);
  }

  return apiSuccess({ messages: messages ?? [] });
}
