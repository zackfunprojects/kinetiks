"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeChannel } from "@/lib/hooks/useRealtimeChannel";
import { captureException } from "@/lib/observability/sentry";
import type { UndoTimelineItem } from "@kinetiks/ui";
import type { Database } from "@kinetiks/supabase";

type WorkspaceActionRow = Database["public"]["Tables"]["kinetiks_workspace_actions"]["Row"];

function mapRow(row: WorkspaceActionRow): UndoTimelineItem {
  return {
    id: row.id,
    participant: row.participant === "agent" ? "agent" : "user",
    actionType: row.action_type,
    target: row.target,
    undone: row.undone,
  };
}

export interface RecordActionInput {
  participant: "agent" | "user";
  action_type: "field_update" | "entity_create" | "entity_delete" | "reorder" | "configuration";
  target: string;
  previous_value?: unknown;
  new_value?: unknown;
}

export interface WorkspaceActions {
  /** Chronological (oldest first). */
  actions: UndoTimelineItem[];
  record: (input: RecordActionInput) => Promise<void>;
  undo: (id: string) => Promise<void>;
  /** Undo the most recent non-undone action, optionally filtered by participant. */
  undoLast: (participant?: "agent" | "user") => void;
}

/**
 * The shared undo stack (spec §7.3): live fetch + postgres_changes sync of
 * kinetiks_workspace_actions, plus record / undo persisted via the embed route.
 */
export function useWorkspaceActions(
  accountId: string,
  threadId: string | null
): WorkspaceActions {
  const [actions, setActions] = useState<UndoTimelineItem[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (!threadId) {
      setActions([]);
      return;
    }
    const { data, error } = await supabase
      .from("kinetiks_workspace_actions")
      .select("*")
      .eq("account_id", accountId)
      .eq("thread_id", threadId)
      .order("sequence_index", { ascending: true });
    if (error) {
      void captureException(error, {
        tags: { route: "/embed", action: "workspace.fetch", stage: "execute", app: "id" },
        user: { id: accountId },
      });
      return;
    }
    setActions(((data ?? []) as WorkspaceActionRow[]).map(mapRow));
  }, [supabase, accountId, threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeChannel({
    channelName: threadId ? `workspace-pg:${accountId}:${threadId}` : null,
    bindings: [
      {
        kind: "postgres_changes",
        event: "*",
        schema: "public",
        table: "kinetiks_workspace_actions",
        filter: threadId ? `thread_id=eq.${threadId}` : undefined,
        onChange: () => {
          void refresh();
        },
      },
    ],
  });

  const post = useCallback(
    async (intent: Record<string, unknown>) => {
      if (!threadId) return;
      try {
        const res = await fetch("/api/id/embed/workspace-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: threadId, ...intent }),
        });
        if (!res.ok) throw new Error(`workspace-actions route returned ${res.status}`);
      } catch (err) {
        void captureException(err, {
          tags: { route: "/embed", action: "workspace.persist", stage: "persist", app: "id" },
          user: { id: accountId },
        });
      }
      void refresh();
    },
    [threadId, refresh, accountId]
  );

  const undoLast = useCallback(
    (participant?: "agent" | "user") => {
      const candidates = actions.filter(
        (a) => !a.undone && (!participant || a.participant === participant)
      );
      const last = candidates[candidates.length - 1];
      if (last) void post({ op: "undo", action_id: last.id });
    },
    [actions, post]
  );

  return {
    actions,
    record: (input) => post({ op: "record", ...input }),
    undo: (id) => post({ op: "undo", action_id: id }),
    undoLast,
  };
}
