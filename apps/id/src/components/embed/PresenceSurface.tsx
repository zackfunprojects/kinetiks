"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentCursor, type AgentCursorState } from "@kinetiks/ui";
import {
  useAgentPresence,
  useCollaborative,
  type RealtimePresenceTransport,
} from "@kinetiks/collaborative";
import type { PresenceEvent, PresenceEventType } from "@kinetiks/types";
import {
  ReferenceSequenceBuilder,
} from "./ReferenceSequenceBuilder";

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
  collaborative: boolean;
  transport: RealtimePresenceTransport | undefined;
}

export function PresenceSurface({
  systemName,
  entityId,
  collaborative,
  transport,
}: PresenceSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentPresence = useAgentPresence();
  const { emitUserPresence } = useCollaborative();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // The field the user is currently on — the agent yields it (§7.2 inverse).
  const userFieldRef = useRef<string | null>(null);

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

  const handleFieldFocus = useCallback(
    (componentId: string, fieldName: string) => {
      userFieldRef.current = fieldKey(componentId, fieldName);
      const event: PresenceEvent = {
        participant: "user",
        event_type: "focus",
        target: { component_id: componentId, field_name: fieldName },
        timestamp: new Date().toISOString(),
      };
      emitUserPresence(event);
    },
    [emitUserPresence]
  );

  const handleFieldBlur = useCallback(() => {
    userFieldRef.current = null;
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100%", overflow: "auto" }}>
      <ReferenceSequenceBuilder
        systemName={systemName}
        entityId={entityId}
        onFieldFocus={handleFieldFocus}
        onFieldBlur={handleFieldBlur}
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
