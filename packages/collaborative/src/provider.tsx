"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  PresenceEvent,
  Annotation,
  WorkspaceAction,
  DelegationRegion,
  TempoMode,
} from "@kinetiks/types";
import type { CollaborativeTransport } from "./transport";

/**
 * The collaborative session context (spec §11.3). App components read presence,
 * annotations, the undo stack, and tempo, and dispatch delegation / undo /
 * annotation actions through it. The provider owns local state and, when a
 * transport is supplied (Phase 8.3+), mirrors that state to/from Realtime.
 */
export interface CollaborativeContextValue {
  isCollaborative: boolean;
  accountId: string | null;
  threadId: string | null;
  agentPresence: PresenceEvent | null;
  userPresence: PresenceEvent | null;
  annotations: Annotation[];
  undoStack: WorkspaceAction[];
  tempoMode: TempoMode;
  setTempoMode: (mode: TempoMode) => void;
  /** Emit a local user presence event (and publish it if a transport exists). */
  emitUserPresence: (event: PresenceEvent) => void;
  delegate: (region: DelegationRegion) => void;
  undo: (actionId: string) => void;
  addAnnotation: (annotation: Annotation) => void;
  dismissAnnotation: (annotationId: string) => void;
}

const noop = () => {};

const DEFAULT_VALUE: CollaborativeContextValue = {
  isCollaborative: false,
  accountId: null,
  threadId: null,
  agentPresence: null,
  userPresence: null,
  annotations: [],
  undoStack: [],
  tempoMode: "system_leads",
  setTempoMode: noop,
  emitUserPresence: noop,
  delegate: noop,
  undo: noop,
  addAnnotation: noop,
  dismissAnnotation: noop,
};

export const CollaborativeContext =
  createContext<CollaborativeContextValue>(DEFAULT_VALUE);

export interface CollaborativeProviderProps {
  /** Whether collaborative mode is active (mode=collaborative). */
  enabled: boolean;
  accountId: string | null;
  threadId: string | null;
  /**
   * Realtime/HTTP transport. Omitted in Phase 8.0 (local state only); injected
   * in Phase 8.3+. The provider behaves identically either way from a
   * component's perspective.
   */
  transport?: CollaborativeTransport;
  /** Initial tempo (spec §7.1): System Leads when the system initiates work. */
  initialTempo?: TempoMode;
  /**
   * Reports a rejected transport call so the host app can route it to Sentry.
   * The package stays Sentry-agnostic; optimistic UI state self-corrects from
   * the authoritative onAnnotations / onUndoStack streams.
   */
  onTransportError?: (err: unknown) => void;
  children: ReactNode;
}

export function CollaborativeProvider({
  enabled,
  accountId,
  threadId,
  transport,
  initialTempo = "system_leads",
  onTransportError,
  children,
}: CollaborativeProviderProps) {
  const [agentPresence, setAgentPresence] = useState<PresenceEvent | null>(null);
  const [userPresence, setUserPresence] = useState<PresenceEvent | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<WorkspaceAction[]>([]);
  const [tempoMode, setTempoMode] = useState<TempoMode>(initialTempo);

  // Reset collaborative state when the scope changes (thread switch, account
  // change, or leaving collaborative mode) so stale cross-thread/account
  // presence, annotations, and undo history never surface (spec §17.1).
  useEffect(() => {
    setAgentPresence(null);
    setUserPresence(null);
    setAnnotations([]);
    setUndoStack([]);
  }, [enabled, accountId, threadId]);

  // Subscribe to transport streams when one is present (Phase 8.3+).
  useEffect(() => {
    if (!enabled || !transport) return;
    const unsubAgent = transport.onAgentPresence(setAgentPresence);
    const unsubAnnotations = transport.onAnnotations(setAnnotations);
    const unsubUndo = transport.onUndoStack(setUndoStack);
    return () => {
      unsubAgent();
      unsubAnnotations();
      unsubUndo();
    };
  }, [enabled, transport]);

  const emitUserPresence = useCallback(
    (event: PresenceEvent) => {
      setUserPresence(event);
      transport?.publishUserPresence(event);
    },
    [transport]
  );

  const reportError = useCallback(
    (err: unknown) => onTransportError?.(err),
    [onTransportError]
  );

  const delegate = useCallback(
    (region: DelegationRegion) => {
      transport?.delegate(region).catch(reportError);
    },
    [transport, reportError]
  );

  const undo = useCallback(
    (actionId: string) => {
      // Optimistic local removal; authoritative state arrives via onUndoStack.
      setUndoStack((stack) => stack.filter((a) => a.id !== actionId));
      transport?.applyUndo(actionId).catch(reportError);
    },
    [transport, reportError]
  );

  const addAnnotation = useCallback(
    (annotation: Annotation) => {
      setAnnotations((prev) => [...prev, annotation]);
      transport?.persistAnnotation(annotation).catch(reportError);
    },
    [transport, reportError]
  );

  const dismissAnnotation = useCallback(
    (annotationId: string) => {
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === annotationId ? { ...a, dismissed: true } : a
        )
      );
      transport?.dismissAnnotation(annotationId).catch(reportError);
    },
    [transport, reportError]
  );

  const value = useMemo<CollaborativeContextValue>(
    () => ({
      isCollaborative: enabled,
      accountId,
      threadId,
      agentPresence,
      userPresence,
      annotations,
      undoStack,
      tempoMode,
      setTempoMode,
      emitUserPresence,
      delegate,
      undo,
      addAnnotation,
      dismissAnnotation,
    }),
    [
      enabled,
      accountId,
      threadId,
      agentPresence,
      userPresence,
      annotations,
      undoStack,
      tempoMode,
      emitUserPresence,
      delegate,
      undo,
      addAnnotation,
      dismissAnnotation,
    ]
  );

  return (
    <CollaborativeContext.Provider value={value}>
      {children}
    </CollaborativeContext.Provider>
  );
}
