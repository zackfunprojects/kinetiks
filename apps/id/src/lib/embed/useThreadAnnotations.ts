"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeChannel } from "@/lib/hooks/useRealtimeChannel";
import type {
  Annotation,
  AnnotationKind,
  AnnotationPosition,
  AnnotationReply,
  AnnotationReference,
} from "@kinetiks/types";
import type { Database } from "@kinetiks/supabase";

type AnnotationRow = Database["public"]["Tables"]["kinetiks_annotations"]["Row"];

/** Map a kinetiks_annotations row to the shared Annotation shape (DB
 *  evidence_refs <-> TS references; flat anchor columns -> anchor object). */
function mapRow(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    account_id: row.account_id,
    thread_id: row.thread_id,
    kind: row.kind as AnnotationKind,
    anchor: {
      component_id: row.component_id,
      field_name: row.field_name,
      position: row.position as AnnotationPosition,
      max_width: row.max_width,
    },
    summary: row.summary,
    body: row.body,
    pinned: row.pinned,
    dismissed: row.dismissed,
    replies: Array.isArray(row.replies) ? (row.replies as unknown as AnnotationReply[]) : [],
    references: Array.isArray(row.evidence_refs)
      ? (row.evidence_refs as unknown as AnnotationReference[])
      : [],
    created_at: row.created_at,
    team_scope_id: row.team_scope_id,
  };
}

export interface CreateAnnotationInput {
  kind: AnnotationKind;
  component_id: string;
  field_name: string;
  summary: string;
  body: string;
  position?: AnnotationPosition;
}

export interface ThreadAnnotations {
  annotations: Annotation[];
  create: (input: CreateAnnotationInput) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  pin: (id: string) => Promise<void>;
  reply: (id: string, body: string) => Promise<void>;
}

/**
 * Live thread annotations: initial fetch + postgres_changes sync on
 * kinetiks_annotations (the table is in the supabase_realtime publication), plus
 * persist actions that POST the embed annotations route (service-role write).
 */
export function useThreadAnnotations(
  accountId: string,
  threadId: string | null
): ThreadAnnotations {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (!threadId) {
      setAnnotations([]);
      return;
    }
    const { data } = await supabase
      .from("kinetiks_annotations")
      .select("*")
      .eq("account_id", accountId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setAnnotations(((data ?? []) as AnnotationRow[]).map(mapRow));
  }, [supabase, accountId, threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeChannel({
    channelName: threadId ? `annotations-pg:${accountId}:${threadId}` : null,
    bindings: [
      {
        kind: "postgres_changes",
        event: "*",
        schema: "public",
        table: "kinetiks_annotations",
        filter: `account_id=eq.${accountId}`,
        onChange: () => {
          void refresh();
        },
      },
    ],
  });

  const post = useCallback(
    async (intent: Record<string, unknown>) => {
      if (!threadId) return;
      await fetch("/api/id/embed/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, ...intent }),
      });
      // Optimistic refresh; postgres_changes will also fire.
      void refresh();
    },
    [threadId, refresh]
  );

  return {
    annotations,
    create: (input) => post({ op: "create", ...input }),
    dismiss: (id) => post({ op: "dismiss", annotation_id: id }),
    pin: (id) => post({ op: "pin", annotation_id: id }),
    reply: (id, body) => post({ op: "reply", annotation_id: id, body }),
  };
}
