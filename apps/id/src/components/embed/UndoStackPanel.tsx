"use client";

import { useEffect, useRef, useState } from "react";
import { Button, UndoTimeline } from "@kinetiks/ui";
import {
  useWorkspaceActions,
  type RecordActionInput,
} from "@/lib/embed/useWorkspaceActions";

/** A few agent actions the reference agent "took", so the stack has content. */
const SEED: RecordActionInput[] = [
  { participant: "agent", action_type: "field_update", target: "sequence.topic" },
  { participant: "agent", action_type: "field_update", target: "step-1.label" },
  { participant: "agent", action_type: "reorder", target: "step-2" },
];

function isTextEntry(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

/**
 * Shared undo stack surface (spec §7.3): a floating history panel + keyboard
 * shortcuts. Cmd/Ctrl+Z undoes the last action (either participant),
 * Cmd/Ctrl+Shift+Z undoes the agent's last, Cmd/Ctrl+Alt+Z opens the timeline.
 * Shortcuts defer to native undo while a text field is focused.
 */
export function UndoStackPanel({
  accountId,
  threadId,
  enabled,
}: {
  accountId: string;
  threadId: string | null;
  enabled: boolean;
}) {
  const { actions, record, undo, undoLast } = useWorkspaceActions(accountId, threadId);
  const seeded = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    seeded.current = false;
  }, [threadId]);

  useEffect(() => {
    if (!enabled || !threadId || seeded.current) return;
    if (actions.length > 0) {
      seeded.current = true;
      return;
    }
    const t = setTimeout(() => {
      if (seeded.current || actions.length > 0) return;
      seeded.current = true;
      // Sequential: each record reads max(sequence_index)+1, so parallel
      // inserts would collide on the unique (account, thread, sequence_index).
      void (async () => {
        for (const a of SEED) await record(a);
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [enabled, threadId, actions.length, record]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "z") return;
      if (e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (isTextEntry(e.target)) return; // let native text undo run
      e.preventDefault();
      undoLast(e.shiftKey ? "agent" : undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, undoLast]);

  if (!enabled) return null;

  const activeCount = actions.filter((a) => !a.undone).length;

  return (
    <div style={{ position: "absolute", right: "var(--kt-s-3)", bottom: "var(--kt-s-3)", zIndex: 21 }}>
      {open ? (
        <div
          style={{
            width: 260,
            maxHeight: 280,
            overflowY: "auto",
            backgroundColor: "var(--kt-bg-elevated)",
            border: "1px solid var(--kt-border-2)",
            borderRadius: "var(--kt-radius-2)",
            boxShadow: "var(--kt-shadow-md)",
            padding: "var(--kt-s-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--kt-s-2)",
            }}
          >
            <span style={{ fontSize: "var(--kt-fs-13)", fontWeight: "var(--kt-fw-med)" }}>
              History
            </span>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close history">
              ×
            </Button>
          </div>
          <UndoTimeline items={actions} onUndo={(id) => void undo(id)} />
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          History ({activeCount})
        </Button>
      )}
    </div>
  );
}
