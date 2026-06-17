import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import { assertTransition } from "@kinetiks/lib/state-machines";
import { activeTaskSchema } from "@/lib/embed/contract";
import { loadOpenTaskForThread, loadTaskById, parseSteps } from "@/lib/embed/active-task";
import type { Json } from "@kinetiks/supabase";

/**
 * POST /api/id/embed/active-task
 *
 * Task drawer lifecycle (spec §8): `open` a task, stream `progress`, `pause` /
 * `resume` / `complete`, and `skip_step` a single step (§8.4). Status writes go
 * through `assertTransition` (server-action layer; the 00090 trigger + RLS are
 * the other two). Kill is a separate route (it fires the 2× learning signal).
 * Account + thread scoped, service-role write, fixture-labeled, realtime-synced.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = activeTaskSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid active-task request", 400);

  const intent = parsed.data;
  const accountId = auth.account_id;
  const admin = createAdminClient();

  try {
    if (intent.op === "open") {
      // Idempotent: one active/paused task per thread (§17.1). If one is
      // already open, return it instead of colliding on the unique index.
      const existing = await loadOpenTaskForThread(admin, accountId, intent.thread_id);
      if (existing) return apiSuccess({ task: existing, reused: true });

      const { data, error: insErr } = await admin
        .from("kinetiks_active_tasks")
        .insert({
          account_id: accountId,
          thread_id: intent.thread_id,
          name: intent.name,
          description: intent.description ?? null,
          app_name: intent.app_name,
          status: "active",
          progress: intent.progress,
          current_step_index: intent.current_step_index,
          steps: intent.steps as unknown as Json,
          command_id: intent.command_id ?? null,
          source_app: "kinetiks_fixtures",
        })
        .select("*")
        .single();
      if (insErr) throw insErr;
      return apiSuccess({ task: data, reused: false });
    }

    // All other ops act on an existing task.
    const task = await loadTaskById(admin, accountId, intent.task_id);
    if (!task) return apiError("Task not found", 404);

    if (intent.op === "progress") {
      const updates: Record<string, unknown> = {};
      if (intent.progress !== undefined) updates.progress = intent.progress;
      if (intent.current_step_index !== undefined)
        updates.current_step_index = intent.current_step_index;
      if (intent.steps !== undefined) updates.steps = intent.steps as unknown as Json;
      if (Object.keys(updates).length === 0) return apiSuccess({ task, noop: true });
      const { data, error: updErr } = await admin
        .from("kinetiks_active_tasks")
        .update(updates)
        .eq("id", task.id)
        .eq("account_id", accountId)
        .select("*")
        .single();
      if (updErr) throw updErr;
      return apiSuccess({ task: data });
    }

    if (intent.op === "skip_step") {
      // Skip the current step (§8.4) — not a status transition. Mark it
      // skipped, advance the next queued step to working.
      const steps = parseSteps(task.steps);
      const next = steps.map((s) => {
        if (s.index === intent.step_index) return { ...s, status: "skipped" as const };
        if (s.index === intent.step_index + 1 && s.status === "queued")
          return { ...s, status: "working" as const };
        return s;
      });
      const nextIndex = steps.some((s) => s.index === intent.step_index + 1)
        ? intent.step_index + 1
        : task.current_step_index;
      const { data, error: updErr } = await admin
        .from("kinetiks_active_tasks")
        .update({ steps: next as unknown as Json, current_step_index: nextIndex })
        .eq("id", task.id)
        .eq("account_id", accountId)
        .select("*")
        .single();
      if (updErr) throw updErr;
      return apiSuccess({ task: data });
    }

    // pause / resume / complete — status transitions, asserted before the write.
    const target = intent.op === "pause" ? "paused" : intent.op === "resume" ? "active" : "completed";
    assertTransition({
      entity: "kinetiks_active_tasks",
      from: task.status as "active" | "paused" | "killed" | "completed",
      to: target,
      actor:
        intent.op === "complete"
          ? { kind: "system", reason: "task completed" }
          : { kind: "user", userId: auth.user_id, accountId },
    });
    const { data, error: updErr } = await admin
      .from("kinetiks_active_tasks")
      .update({ status: target })
      .eq("id", task.id)
      .eq("account_id", accountId)
      .select("*")
      .single();
    if (updErr) throw updErr;
    return apiSuccess({ task: data });
  } catch (err) {
    if (err instanceof Error && err.name === "StateTransitionDenied") {
      return apiError(err.message, 409);
    }
    await captureException(err, {
      tags: { route: "/api/id/embed/active-task", action: "embed.active_task", stage: "persist", app: "id" },
      user: { id: accountId },
      extra: { op: intent.op, threadId: intent.thread_id },
    });
    return apiError(USER_SAFE.GENERIC_ERROR, 500);
  }
}
