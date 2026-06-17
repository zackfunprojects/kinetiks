import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { captureException, USER_SAFE } from "@/lib/observability/sentry";
import { assertTransition } from "@kinetiks/lib/state-machines";
import { killTaskSchema, REFERENCE_ACTION_CATEGORY } from "@/lib/embed/contract";
import { loadTaskById } from "@/lib/embed/active-task";
import { applyInterventionSignal } from "@/lib/approvals/intervention-signals";
import type { KillReasonCode } from "@kinetiks/types";

const REASON_PHRASE: Record<KillReasonCode, string> = {
  wrong_tone: "the tone was off",
  wrong_data: "the data was wrong",
  wrong_approach: "the approach wasn't right",
  wrong_target: "the targeting was off",
  other: "you flagged a problem",
};

/**
 * POST /api/id/embed/active-task/kill
 *
 * The Kill Task flow (spec §8.3). Stops the task, reverts the system's
 * in-progress field updates via the undo stack, records the "What went wrong?"
 * answer, fires the 2× `task_killed` learning signal (trust contraction), and
 * returns a plain-language acknowledgement. Status write is asserted before the
 * DB layer (the 00090 trigger + RLS are the other two layers).
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

  const parsed = killTaskSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid kill request", 400);

  const intent = parsed.data;
  const accountId = auth.account_id;
  const admin = createAdminClient();

  try {
    const task = await loadTaskById(admin, accountId, intent.task_id);
    if (!task) return apiError("Task not found", 404);

    // 1. Stop the task — asserted transition (terminal states throw 409).
    assertTransition({
      entity: "kinetiks_active_tasks",
      from: task.status as "active" | "paused" | "killed" | "completed",
      to: "killed",
      actor: { kind: "user", userId: auth.user_id, accountId },
    });

    const { data: killed, error: updErr } = await admin
      .from("kinetiks_active_tasks")
      .update({
        status: "killed",
        kill_reason_code: intent.reason_code,
        kill_feedback: intent.feedback ?? null,
      })
      .eq("id", task.id)
      .eq("account_id", accountId)
      .select("*")
      .single();
    if (updErr) throw updErr;

    // 2. Revert the system's in-progress field updates via the undo stack
    //    (§8.3) — mark the thread's not-yet-undone agent actions undone.
    const { data: reverted, error: revErr } = await admin
      .from("kinetiks_workspace_actions")
      .update({ undone: true })
      .eq("account_id", accountId)
      .eq("thread_id", intent.thread_id)
      .eq("participant", "agent")
      .eq("undone", false)
      .select("id");
    if (revErr) throw revErr;
    const revertedCount = reverted?.length ?? 0;

    // 3. Fire the 2× kill signal — trust contraction + task_killed Ledger entry.
    await applyInterventionSignal(accountId, REFERENCE_ACTION_CATEGORY, "kill", {
      extra: {
        task_id: task.id,
        reason_code: intent.reason_code,
        feedback: intent.feedback ?? null,
        reverted_count: revertedCount,
      },
    });

    // 4. Plain-language acknowledgement (§8.3 step 4).
    const acknowledgement = `Got it — I stopped "${task.name}" because ${REASON_PHRASE[intent.reason_code]}${
      intent.feedback ? ` (${intent.feedback.trim()})` : ""
    }. I'll factor this in next time.`;

    return apiSuccess({ task: killed, reverted: revertedCount, acknowledgement });
  } catch (err) {
    if (err instanceof Error && err.name === "StateTransitionDenied") {
      return apiError(err.message, 409);
    }
    await captureException(err, {
      tags: { route: "/api/id/embed/active-task/kill", action: "embed.kill_task", stage: "persist", app: "id" },
      user: { id: accountId },
      extra: { taskId: intent.task_id, threadId: intent.thread_id },
    });
    return apiError(USER_SAFE.GENERIC_ERROR, 500);
  }
}
