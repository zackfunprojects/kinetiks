import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusChannel, MarcusThread, MarcusMessage } from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";

/**
 * Create a new conversation thread.
 */
export async function createThread(
  admin: SupabaseClient,
  accountId: string,
  channel: MarcusChannel = "web",
  slackThreadTs?: string
): Promise<MarcusThread> {
  const { data, error } = await admin
    .from("kinetiks_marcus_threads")
    .insert({
      account_id: accountId,
      channel,
      slack_thread_ts: slackThreadTs ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create thread: ${error.message}`);
  return data as MarcusThread;
}

/**
 * Get an existing thread or create a new one.
 */
export async function getOrCreateThread(
  admin: SupabaseClient,
  accountId: string,
  threadId?: string,
  channel: MarcusChannel = "web",
  slackThreadTs?: string
): Promise<MarcusThread> {
  if (threadId) {
    const { data, error } = await admin
      .from("kinetiks_marcus_threads")
      .select()
      .eq("id", threadId)
      .eq("account_id", accountId)
      .single();

    if (error) throw new Error(`Thread not found: ${error.message}`);
    return data as MarcusThread;
  }

  // Look up by Slack thread timestamp if provided
  if (slackThreadTs) {
    const { data } = await admin
      .from("kinetiks_marcus_threads")
      .select()
      .eq("account_id", accountId)
      .eq("slack_thread_ts", slackThreadTs)
      .single();

    if (data) return data as MarcusThread;
  }

  return createThread(admin, accountId, channel, slackThreadTs);
}

/**
 * Add a message to a thread.
 */
export async function addMessage(
  admin: SupabaseClient,
  threadId: string,
  role: "user" | "marcus",
  content: string,
  channel: MarcusChannel = "web",
  extractedActions?: unknown,
  contextUsed?: Record<string, unknown>
): Promise<MarcusMessage> {
  const { data, error } = await admin
    .from("kinetiks_marcus_messages")
    .insert({
      thread_id: threadId,
      role,
      content,
      channel,
      extracted_actions: extractedActions ?? null,
      context_used: contextUsed ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add message: ${error.message}`);

  // Touch thread updated_at
  await admin
    .from("kinetiks_marcus_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  return data as MarcusMessage;
}

/**
 * Get messages for a thread, ordered by creation time.
 */
export async function getThreadMessages(
  admin: SupabaseClient,
  threadId: string,
  limit = 50
): Promise<MarcusMessage[]> {
  const { data, error } = await admin
    .from("kinetiks_marcus_messages")
    .select()
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get messages: ${error.message}`);
  return (data ?? []) as MarcusMessage[];
}

/**
 * Get the most recent messages for a thread, returned in chronological order.
 * Fetches newest N messages (desc) then reverses so callers get chronological order.
 */
export async function getRecentThreadMessages(
  admin: SupabaseClient,
  threadId: string,
  limit = 10
): Promise<MarcusMessage[]> {
  const { data, error } = await admin
    .from("kinetiks_marcus_messages")
    .select()
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get recent messages: ${error.message}`);
  return ((data ?? []) as MarcusMessage[]).reverse();
}

/**
 * Auto-generate a thread title from the first exchange.
 * Uses Haiku for speed.
 */
export async function autoTitleThread(
  admin: SupabaseClient,
  threadId: string
): Promise<string> {
  const messages = await getThreadMessages(admin, threadId, 4);
  if (messages.length < 2) return "";

  const exchange = messages
    .slice(0, 4)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const title = await askClaude(
    `Generate a 3-5 word title for this conversation. Return ONLY the title, no quotes, no punctuation at the end.\n\n${exchange}`,
    { model: "claude-haiku-4-5-20251001", maxTokens: 20 }
  );

  const cleanTitle = title.trim().replace(/[."]+$/, "").slice(0, 100);

  await admin
    .from("kinetiks_marcus_threads")
    .update({ title: cleanTitle })
    .eq("id", threadId);

  return cleanTitle;
}

/**
 * List threads for an account, most recent first.
 */
export async function listThreads(
  admin: SupabaseClient,
  accountId: string,
  limit = 30,
  offset = 0
): Promise<MarcusThread[]> {
  const { data, error } = await admin
    .from("kinetiks_marcus_threads")
    .select()
    .eq("account_id", accountId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to list threads: ${error.message}`);
  return (data ?? []) as MarcusThread[];
}

/**
 * Search threads by message content (basic text search).
 */
export async function searchThreads(
  admin: SupabaseClient,
  accountId: string,
  query: string,
  limit = 20
): Promise<MarcusThread[]> {
  // First find matching message thread IDs
  const { data: messages, error: msgError } = await admin
    .from("kinetiks_marcus_messages")
    .select("thread_id")
    .ilike("content", `%${query}%`)
    .limit(limit);

  if (msgError || !messages?.length) return [];

  const threadIds = [...new Set(messages.map((m) => m.thread_id))];

  // Then load those threads, filtered by account
  const { data: threads, error: threadError } = await admin
    .from("kinetiks_marcus_threads")
    .select()
    .eq("account_id", accountId)
    .in("id", threadIds)
    .order("updated_at", { ascending: false });

  if (threadError) return [];
  return (threads ?? []) as MarcusThread[];
}

/**
 * Toggle pin status on a thread.
 */
export async function togglePin(
  admin: SupabaseClient,
  threadId: string,
  pinned: boolean
): Promise<void> {
  const { error } = await admin
    .from("kinetiks_marcus_threads")
    .update({ pinned })
    .eq("id", threadId);

  if (error) throw new Error(`Failed to toggle pin: ${error.message}`);
}
