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

const STEP_STATUSES = new Set(["queued", "working", "done", "skipped", "failed"]);

/** Narrow the jsonb `steps` column to the typed step array, dropping malformed
 *  entries rather than letting them break skip/progress logic later. */
export function parseSteps(steps: ActiveTaskRow["steps"]): ActiveTaskStep[] {
  if (!Array.isArray(steps)) return [];
  return (steps as unknown[]).filter((s): s is ActiveTaskStep => {
    if (typeof s !== "object" || s === null) return false;
    const step = s as Record<string, unknown>;
    return (
      typeof step.index === "number" &&
      typeof step.app_name === "string" &&
      typeof step.label === "string" &&
      typeof step.status === "string" &&
      STEP_STATUSES.has(step.status)
    );
  });
}

/**
 * Skip the current step (§8.4): mark it `skipped`, advance the next queued step
 * to `working`, and bump the current index when there is a next step. Pure, so
 * the advance logic is unit-tested without a DB.
 */
export function applySkipStep(
  steps: ActiveTaskStep[],
  currentStepIndex: number,
  skipIndex: number,
): { steps: ActiveTaskStep[]; currentStepIndex: number } {
  // Only the current step may be skipped (§8.4) — guard against a stale or
  // malicious client targeting an arbitrary step.
  if (skipIndex !== currentStepIndex) {
    return { steps, currentStepIndex };
  }
  const nextSteps = steps.map((s) => {
    if (s.index === skipIndex) return { ...s, status: "skipped" as const };
    if (s.index === skipIndex + 1 && s.status === "queued") return { ...s, status: "working" as const };
    return s;
  });
  const hasNext = steps.some((s) => s.index === skipIndex + 1);
  return { steps: nextSteps, currentStepIndex: hasNext ? skipIndex + 1 : currentStepIndex };
}
