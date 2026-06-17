import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@kinetiks/supabase";
import type { ActiveTaskStep } from "@kinetiks/types";

export type ActiveTaskRow = Database["public"]["Tables"]["kinetiks_active_tasks"]["Row"];
type Admin = ReturnType<typeof createAdminClient>;

/**
 * Shared readers for the task drawer (spec §8). Both the lifecycle route and
 * the kill route load through these. Account-scoped; service-role caller.
 */

/** The single active/paused task for a thread (panel is thread-scoped, §17.1). */
export async function loadOpenTaskForThread(
  admin: Admin,
  accountId: string,
  threadId: string,
): Promise<ActiveTaskRow | null> {
  const { data, error } = await admin
    .from("kinetiks_active_tasks")
    .select("*")
    .eq("account_id", accountId)
    .eq("thread_id", threadId)
    .in("status", ["active", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ActiveTaskRow | null) ?? null;
}

export async function loadTaskById(
  admin: Admin,
  accountId: string,
  taskId: string,
): Promise<ActiveTaskRow | null> {
  const { data, error } = await admin
    .from("kinetiks_active_tasks")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  return (data as ActiveTaskRow | null) ?? null;
}

/** Narrow the jsonb `steps` column to the typed step array. */
export function parseSteps(steps: ActiveTaskRow["steps"]): ActiveTaskStep[] {
  if (!Array.isArray(steps)) return [];
  return steps as unknown as ActiveTaskStep[];
}
