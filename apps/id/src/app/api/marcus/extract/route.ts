import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { extractActions, executeActions } from "@/lib/marcus/action-extractor";
import { assembleContext } from "@/lib/marcus/context-assembly";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/marcus/extract
 *
 * Run action extraction on a specific conversation turn.
 * Primarily for manual re-extraction or debugging.
 *
 * Body: { thread_id: string, message_id?: string }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { allowInternal: true });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const { thread_id } = body;

  if (typeof thread_id !== "string" || !thread_id) {
    return apiError("Missing thread_id", 400);
  }

  const admin = createAdminClient();

  // Resolve account ID
  let accountId: string;
  if (auth.auth_method === "internal" && typeof body.account_id === "string") {
    accountId = body.account_id;
  } else {
    accountId = auth.account_id;
  }

  // Verify thread belongs to this account before reading messages
  const { data: thread } = await admin
    .from("kinetiks_marcus_threads")
    .select("id")
    .eq("id", thread_id)
    .eq("account_id", accountId)
    .single();

  if (!thread) {
    return apiError("Thread not found", 404);
  }

  // Get the last user message and last Marcus response from the thread
  const { data: messages } = await admin
    .from("kinetiks_marcus_messages")
    .select("role, content")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(4);

  if (!messages || messages.length < 2) {
    return apiError("Not enough messages in thread for extraction", 400);
  }

  const marcusMsg = messages.find((m) => m.role === "marcus");
  const userMsg = messages.find((m) => m.role === "user");

  if (!marcusMsg || !userMsg) {
    return apiError("Thread missing user or marcus message", 400);
  }

  // Assemble context for extraction
  const contextSummary = await assembleContext(
    admin,
    accountId,
    "implicit_intel",
    thread_id
  );

  // Extract and execute
  const actions = await extractActions(
    userMsg.content,
    marcusMsg.content,
    contextSummary
  );

  let disclosure = "";
  if (actions.length > 0) {
    disclosure = await executeActions(admin, accountId, actions, thread_id);
  }

  return apiSuccess({
    actions,
    disclosure,
    extracted_count: actions.length,
  });
}
