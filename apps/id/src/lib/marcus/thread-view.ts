import type { MarcusThread, MarcusMessage } from "@kinetiks/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Narrow data interface for the threaded chat view. Kept separate from the
 * Supabase client so the authorization logic in {@link loadThreadView} is
 * unit-testable without a live database.
 */
export interface ThreadViewReader {
  /** True only when the thread exists AND belongs to the account. */
  isThreadOwned(accountId: string, threadId: string): Promise<boolean>;
  listThreads(accountId: string, limit: number): Promise<MarcusThread[]>;
  listMessages(threadId: string): Promise<MarcusMessage[]>;
}

export type ThreadView =
  | { owned: false }
  | { owned: true; threads: MarcusThread[]; messages: MarcusMessage[] };

/**
 * Load the threaded chat view, gating message access on thread ownership.
 *
 * The chat thread page uses the service-role admin client, which bypasses RLS,
 * so this ownership check IS the tenant-isolation boundary for that surface: a
 * thread's messages are read only after the thread is proven to belong to the
 * account. Without this gate any authenticated user could read another tenant's
 * conversation by guessing a thread id.
 */
export async function loadThreadView(
  reader: ThreadViewReader,
  accountId: string,
  threadId: string,
): Promise<ThreadView> {
  const owned = await reader.isThreadOwned(accountId, threadId);
  if (!owned) return { owned: false };

  const [threads, messages] = await Promise.all([
    reader.listThreads(accountId, 30),
    reader.listMessages(threadId),
  ]);
  return { owned: true, threads, messages };
}

/** Supabase-backed {@link ThreadViewReader} for production use. */
export function supabaseThreadViewReader(admin: AdminClient): ThreadViewReader {
  return {
    async isThreadOwned(accountId, threadId) {
      const { data } = await admin
        .from("kinetiks_marcus_threads")
        .select("id")
        .eq("id", threadId)
        .eq("account_id", accountId)
        .maybeSingle();
      return data !== null;
    },
    async listThreads(accountId, limit) {
      const { data } = await admin
        .from("kinetiks_marcus_threads")
        .select()
        .eq("account_id", accountId)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as MarcusThread[];
    },
    async listMessages(threadId) {
      const { data } = await admin
        .from("kinetiks_marcus_messages")
        .select()
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      return (data ?? []) as MarcusMessage[];
    },
  };
}
