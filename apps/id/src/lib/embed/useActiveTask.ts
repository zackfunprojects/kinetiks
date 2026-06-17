"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeChannel } from "@/lib/hooks/useRealtimeChannel";
import { captureException } from "@/lib/observability/sentry";
import type { Database } from "@kinetiks/supabase";
import type {
  ActiveTask,
  ActiveTaskStep,
  ActiveTaskStatus,
  KillReasonCode,
} from "@kinetiks/types";

type ActiveTaskRow = Database["public"]["Tables"]["kinetiks_active_tasks"]["Row"];

function mapRow(row: ActiveTaskRow): ActiveTask {
  return {
    id: row.id,
    account_id: row.account_id,
    thread_id: row.thread_id,
    name: row.name,
    description: row.description ?? undefined,
    app_name: row.app_name,
    status: row.status as ActiveTaskStatus,
    progress: row.progress,
    current_step_index: row.current_step_index,
    steps: Array.isArray(row.steps) ? (row.steps as unknown as ActiveTaskStep[]) : [],
    started_at: row.started_at,
    team_scope_id: row.team_scope_id,
  };
}

export interface OpenTaskInput {
  name: string;
  description?: string;
  app_name: string;
  steps?: ActiveTaskStep[];
  current_step_index?: number;
  progress?: number;
  command_id?: string;
}

export interface ProgressInput {
  progress?: number;
  current_step_index?: number;
  steps?: ActiveTaskStep[];
}

export interface KillInput {
  taskId: string;
  reasonCode: KillReasonCode;
  feedback?: string;
}

export interface KillResult {
  acknowledgement: string;
  reverted: number;
}

export interface UseActiveTask {
  /** The single active/paused task for the thread, or null. */
  task: ActiveTask | null;
  open: (input: OpenTaskInput) => Promise<ActiveTask | null>;
  advance: (taskId: string, input: ProgressInput) => Promise<void>;
  pause: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
  complete: (taskId: string) => Promise<void>;
  skipStep: (taskId: string, stepIndex: number) => Promise<void>;
  /** Kill the whole task (§8.3) — returns the chat acknowledgement. */
  kill: (input: KillInput) => Promise<KillResult | null>;
}

/**
 * The task drawer's data binding (spec §8): the live active/paused
 * kinetiks_active_tasks row for the thread, plus the lifecycle ops. Mirrors
 * useWorkspaceActions — fetch + postgres_changes sync, mutations via the route.
 */
export function useActiveTask(accountId: string, threadId: string | null): UseActiveTask {
  const [task, setTask] = useState<ActiveTask | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (!threadId) {
      setTask(null);
      return;
    }
    const { data, error } = await supabase
      .from("kinetiks_active_tasks")
      .select("*")
      .eq("account_id", accountId)
      .eq("thread_id", threadId)
      .in("status", ["active", "paused"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      void captureException(error, {
        tags: { route: "/embed", action: "active_task.fetch", stage: "execute", app: "id" },
        user: { id: accountId },
      });
      return;
    }
    setTask(data ? mapRow(data as ActiveTaskRow) : null);
  }, [supabase, accountId, threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeChannel({
    channelName: threadId ? `active-task-pg:${accountId}:${threadId}` : null,
    bindings: [
      {
        kind: "postgres_changes",
        event: "*",
        schema: "public",
        table: "kinetiks_active_tasks",
        filter: threadId ? `thread_id=eq.${threadId}` : undefined,
        onChange: () => {
          void refresh();
        },
      },
    ],
  });

  const post = useCallback(
    async (intent: Record<string, unknown>): Promise<unknown> => {
      if (!threadId) return null;
      try {
        const res = await fetch("/api/id/embed/active-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: threadId, ...intent }),
        });
        if (!res.ok) throw new Error(`active-task route returned ${res.status}`);
        const json = (await res.json()) as { data?: { task?: ActiveTaskRow } };
        void refresh();
        return json.data?.task ?? null;
      } catch (err) {
        void captureException(err, {
          tags: { route: "/embed", action: "active_task.persist", stage: "persist", app: "id" },
          user: { id: accountId },
        });
        return null;
      }
    },
    [threadId, refresh, accountId],
  );

  // Memoize the mutators so callers (e.g. the fixture-playback effect in
  // TaskDrawerSurface) get stable identities — otherwise an effect that depends
  // on them re-runs on every render and tears down its own scheduled timers.
  const open = useCallback(
    async (input: OpenTaskInput) => {
      const row = (await post({ op: "open", ...input })) as ActiveTaskRow | null;
      return row ? mapRow(row) : null;
    },
    [post],
  );
  const advance = useCallback(
    async (taskId: string, input: ProgressInput) => {
      await post({ op: "progress", task_id: taskId, ...input });
    },
    [post],
  );
  const pause = useCallback(
    async (taskId: string) => {
      await post({ op: "pause", task_id: taskId });
    },
    [post],
  );
  const resume = useCallback(
    async (taskId: string) => {
      await post({ op: "resume", task_id: taskId });
    },
    [post],
  );
  const complete = useCallback(
    async (taskId: string) => {
      await post({ op: "complete", task_id: taskId });
    },
    [post],
  );
  const skipStep = useCallback(
    async (taskId: string, stepIndex: number) => {
      await post({ op: "skip_step", task_id: taskId, step_index: stepIndex });
    },
    [post],
  );
  const kill = useCallback(
    async (input: KillInput): Promise<KillResult | null> => {
      if (!threadId) return null;
      try {
        const res = await fetch("/api/id/embed/active-task/kill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadId,
            task_id: input.taskId,
            reason_code: input.reasonCode,
            feedback: input.feedback,
          }),
        });
        if (!res.ok) throw new Error(`kill route returned ${res.status}`);
        const json = (await res.json()) as {
          data?: { acknowledgement?: string; reverted?: number };
        };
        void refresh();
        return {
          acknowledgement: json.data?.acknowledgement ?? "Task stopped.",
          reverted: json.data?.reverted ?? 0,
        };
      } catch (err) {
        void captureException(err, {
          tags: { route: "/embed", action: "active_task.kill", stage: "persist", app: "id" },
          user: { id: accountId },
        });
        return null;
      }
    },
    [threadId, refresh, accountId],
  );

  return useMemo(
    () => ({ task, open, advance, pause, resume, complete, skipStep, kill }),
    [task, open, advance, pause, resume, complete, skipStep, kill],
  );
}
