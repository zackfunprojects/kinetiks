"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentCursor, TempoControl, type AgentCursorState } from "@kinetiks/ui";
import {
  useAgentPresence,
  useCollaborative,
  useTempoMode,
  useDelegateRegion,
  type RealtimePresenceTransport,
} from "@kinetiks/collaborative";
import type { PresenceEvent, PresenceEventType } from "@kinetiks/types";
import { captureException } from "@/lib/observability/sentry";
import { ReferenceSequenceBuilder } from "./ReferenceSequenceBuilder";
import { AnnotationLayer } from "./AnnotationLayer";
import { UndoStackPanel } from "./UndoStackPanel";
import { TaskDrawerSurface } from "./TaskDrawerSurface";
import { ApprovalSurface } from "./ApprovalSurface";

/**
 * Scripted agent playback. The reference surface has no real agent, so a
 * clearly-labeled fixture sequence drives the agent's presence over the
 * Realtime channel (publishAgentPresence) — the same path a real server agent
 * would use. Honors the fixtures contract.
 */
const PLAYBACK: Array<{
  component_id: string;
  field_name: string;
  event_type: PresenceEventType;
  reason?: string;
  hold_ms: number;
}> = [
  { component_id: "sequence", field_name: "segment", event_type: "focus", hold_ms: 1100 },
  { component_id: "sequence", field_name: "topic", event_type: "type", hold_ms: 1600 },
  {
    component_id: "sequence",
    field_name: "tone",
    event_type: "uncertain",
    reason: "Two tones tested evenly — your call on which to lead with",
    hold_ms: 2200,
  },
  { component_id: "step-1", field_name: "label", event_type: "type", hold_ms: 1500 },
  { component_id: "step-2", field_name: "label", event_type: "type", hold_ms: 1500 },
];

function cursorState(eventType: PresenceEventType): AgentCursorState {
  if (eventType === "uncertain") return "uncertain";
  if (eventType === "type") return "typing";
  if (eventType === "select") return "selecting";
  return "idle";
}

function fieldKey(componentId: string, fieldName?: string): string {
  return `${componentId}:${fieldName ?? ""}`;
}

interface PresenceSurfaceProps {
  systemName: string | null;
  entityId: string | null;
  accountId: string;
  threadId: string | null;
  collaborative: boolean;
  transport: RealtimePresenceTransport | undefined;
}

export function PresenceSurface({
  systemName,
  entityId,
  accountId,
  threadId,
  collaborative,
  transport,
}: PresenceSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentPresence = useAgentPresence();
  const { emitUserPresence } = useCollaborative();
  const [tempoMode, setTempoMode] = useTempoMode();
  const delegate = useDelegateRegion();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Review phase (§9.1): the system finished work and is presenting it for
  // approval. Set by the task drawer when its work completes; cleared on kill.
  const [reviewArmed, setReviewArmed] = useState(false);
  // The field the user is currently on — the agent yields it (§7.2 inverse).
  const userFieldRef = useRef<string | null>(null);
  // The field the agent is currently targeting, and grabs already signalled —
  // so a user focus on the agent's field fires a grab once (§9.3).
  const agentTargetRef = useRef<string | null>(null);
  const firedGrabRef = useRef<Set<string>>(new Set());

  // Position the cursor over the agent's target field, relative to the surface.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!agentPresence || !container) {
      setPos(null);
      return;
    }
    const { component_id, field_name } = agentPresence.target;
    const selector = field_name
      ? `[data-component-id="${component_id}"][data-field-name="${field_name}"]`
      : `[data-component-id="${component_id}"]`;
    const el = container.querySelector(selector);
    if (!el) {
      setPos(null);
      return;
    }
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // Anchor just above the field's left edge.
    setPos({ x: r.left - c.left, y: r.top - c.top - 18 });
  }, [agentPresence]);

  // Track the agent's current target so a user grab can be detected (§9.3).
  useEffect(() => {
    agentTargetRef.current = agentPresence
      ? fieldKey(agentPresence.target.component_id, agentPresence.target.field_name)
      : null;
  }, [agentPresence]);

  // Agent fixture playback over the Realtime channel.
  useEffect(() => {
    if (!collaborative || !transport) return;
    let index = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const step = PLAYBACK[index % PLAYBACK.length];
      // Click-to-intervene: skip a field the user is actively on.
      if (userFieldRef.current !== fieldKey(step.component_id, step.field_name)) {
        transport.publishAgentPresence({
          participant: "agent",
          event_type: step.event_type,
          target: { component_id: step.component_id, field_name: step.field_name },
          metadata: step.reason ? { uncertainty_reason: step.reason } : undefined,
          timestamp: new Date().toISOString(),
        });
      }
      index += 1;
      timer = setTimeout(tick, step.hold_ms);
    };

    timer = setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [collaborative, transport]);

  // Drag-to-delegate (§7.2), keyboard variant: Cmd/Ctrl+D hands the focused
  // field to the agent, which visibly picks it up (cursor moves there).
  useEffect(() => {
    if (!collaborative) return;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "d") return;
      const key = userFieldRef.current;
      if (!key) return;
      e.preventDefault();
      const [componentId, fieldName] = key.split(":");
      delegate([componentId], `Delegated ${fieldName}`);
      transport?.publishAgentPresence({
        participant: "agent",
        event_type: "focus",
        target: { component_id: componentId, field_name: fieldName },
        timestamp: new Date().toISOString(),
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collaborative, delegate, transport]);

  const handleFieldFocus = useCallback(
    (componentId: string, fieldName: string) => {
      const key = fieldKey(componentId, fieldName);
      userFieldRef.current = key;

      // Grab (§9.3): the user took a field the agent was about to fill. Fire the
      // field-level penalty once per field; the server records the signal.
      if (agentTargetRef.current === key && !firedGrabRef.current.has(key)) {
        firedGrabRef.current.add(key);
        void fetch("/api/id/embed/intervention", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signal: "grab", component_id: componentId, field_name: fieldName }),
        }).catch((err) => {
          void captureException(err, {
            tags: { route: "/embed", action: "intervention.grab", stage: "persist", app: "id" },
            user: { id: accountId },
          });
        });
      }

      const event: PresenceEvent = {
        participant: "user",
        event_type: "focus",
        target: { component_id: componentId, field_name: fieldName },
        timestamp: new Date().toISOString(),
      };
      emitUserPresence(event);
    },
    [emitUserPresence, accountId]
  );

  const handleFieldBlur = useCallback(() => {
    userFieldRef.current = null;
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100%", overflow: "auto" }}>
      {collaborative && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "var(--kt-s-2) var(--kt-s-3)",
            borderBottom: "1px solid var(--kt-border-2)",
            position: "sticky",
            top: 0,
            backgroundColor: "var(--kt-bg-base)",
            zIndex: 20,
          }}
        >
          <TempoControl value={tempoMode} onChange={setTempoMode} />
        </div>
      )}
      <ReferenceSequenceBuilder
        systemName={systemName}
        entityId={entityId}
        onFieldFocus={handleFieldFocus}
        onFieldBlur={handleFieldBlur}
      />
      <AnnotationLayer
        containerRef={containerRef}
        accountId={accountId}
        threadId={threadId}
        enabled={collaborative}
      />
      <UndoStackPanel accountId={accountId} threadId={threadId} enabled={collaborative} />
      <TaskDrawerSurface
        systemName={systemName}
        accountId={accountId}
        threadId={threadId}
        enabled={collaborative}
        onWorkComplete={() => setReviewArmed(true)}
        onKilled={() => setReviewArmed(false)}
      />
      <ApprovalSurface
        systemName={systemName}
        accountId={accountId}
        armed={reviewArmed}
        enabled={collaborative}
        onResolved={() => setReviewArmed(false)}
      />
      {collaborative && agentPresence && pos && (
        <AgentCursor
          x={pos.x}
          y={pos.y}
          label={systemName ?? "Kinetiks"}
          state={cursorState(agentPresence.event_type)}
          uncertaintyReason={agentPresence.metadata?.uncertainty_reason}
        />
      )}
    </div>
  );
}
