import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { extractActions, executeActions } from "@/lib/marcus/action-extractor";
import { assembleContext } from "@/lib/marcus/context-assembly";
import { NextResponse } from "next/server";

/**
 * POST /api/marcus/extract
 *
 * Run action extraction on a specific conversation turn.
 * Primarily for manual re-extraction or debugging.
 *
 * Body: { thread_id: string, message_id?: string }
 */
export async function POST(request: Request) {
  // Auth check - user or internal service
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { thread_id } = body;

  if (typeof thread_id !== "string" || !thread_id) {
    return NextResponse.json(
      { error: "Missing thread_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Get account ID
  let accountId: string;
  if (isServiceCall && body.account_id) {
    accountId = body.account_id;
  } else if (user) {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    accountId = account.id;
  } else {
    return NextResponse.json({ error: "Cannot resolve account" }, { status: 400 });
  }

  // Get the last user message and last Marcus response from the thread
  const { data: messages } = await admin
    .from("kinetiks_marcus_messages")
    .select("role, content")
    .eq("thread_id", thread_id)
    .order("created_at", { ascending: false })
    .limit(4);

  if (!messages || messages.length < 2) {
    return NextResponse.json(
      { error: "Not enough messages in thread for extraction" },
      { status: 400 }
    );
  }

  const marcusMsg = messages.find((m) => m.role === "marcus");
  const userMsg = messages.find((m) => m.role === "user");

  if (!marcusMsg || !userMsg) {
    return NextResponse.json(
      { error: "Thread missing user or marcus message" },
      { status: 400 }
    );
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

  return NextResponse.json({
    actions,
    disclosure,
    extracted_count: actions.length,
  });
}
