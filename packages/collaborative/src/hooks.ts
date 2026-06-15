"use client";

import { useContext } from "react";
import type {
  PresenceEvent,
  Annotation,
  WorkspaceAction,
  DelegationRegion,
  TempoMode,
} from "@kinetiks/types";
import { CollaborativeContext, type CollaborativeContextValue } from "./provider";

/** Full collaborative context (escape hatch; prefer the focused hooks below). */
export function useCollaborative(): CollaborativeContextValue {
  return useContext(CollaborativeContext);
}

/** Whether the current surface is rendered in collaborative mode. */
export function useIsCollaborative(): boolean {
  return useContext(CollaborativeContext).isCollaborative;
}

/** The agent's current presence beat, or null (spec §5.1). */
export function useAgentPresence(): PresenceEvent | null {
  return useContext(CollaborativeContext).agentPresence;
}

/** Annotations anchored to a specific field, excluding dismissed ones (spec §6). */
export function useFieldAnnotations(fieldName: string): Annotation[] {
  const { annotations } = useContext(CollaborativeContext);
  return annotations.filter(
    (a) => a.anchor.field_name === fieldName && !a.dismissed
  );
}

/** True when the agent's cursor is focused on the given component (spec §5.1). */
export function useIsAgentFocused(componentId: string): boolean {
  const presence = useContext(CollaborativeContext).agentPresence;
  return (
    presence?.participant === "agent" &&
    presence.target.component_id === componentId &&
    presence.event_type !== "blur"
  );
}

/** Returns a delegate fn for handing a set of components to the agent (spec §7.2). */
export function useDelegateRegion(): (
  componentIds: string[],
  context?: string
) => void {
  const { delegate } = useContext(CollaborativeContext);
  return (componentIds: string[], context = "") => {
    const region: DelegationRegion = {
      component_ids: componentIds,
      context,
    };
    delegate(region);
  };
}

/** The shared undo stack and an undo dispatcher (spec §7.3). */
export function useUndoStack(): {
  stack: WorkspaceAction[];
  undo: (actionId: string) => void;
} {
  const { undoStack, undo } = useContext(CollaborativeContext);
  return { stack: undoStack, undo };
}

/** The current tempo and a setter (spec §7.1). */
export function useTempoMode(): [TempoMode, (mode: TempoMode) => void] {
  const { tempoMode, setTempoMode } = useContext(CollaborativeContext);
  return [tempoMode, setTempoMode];
}
