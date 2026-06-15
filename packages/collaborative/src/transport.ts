import type {
  PresenceEvent,
  Annotation,
  WorkspaceAction,
  DelegationRegion,
} from "@kinetiks/types";

/**
 * The pluggable seam between the CollaborativeProvider and the outside world
 * (Supabase Realtime channels + the embed API routes).
 *
 * Phase 8.0 ships the provider with NO transport (local state only) so the
 * API surface and rendering can be built and tested in isolation. Phase 8.3+
 * injects a Realtime-backed implementation; the provider does not change.
 *
 * App-agnostic: a transport knows about channels and HTTP, never about a
 * specific suite app or fixtures.
 */
export interface CollaborativeTransport {
  /** Push a user presence event upward (to the agent / shell). */
  publishUserPresence(event: PresenceEvent): void;

  /** Subscribe to agent presence beats. Returns an unsubscribe fn. */
  onAgentPresence(callback: (event: PresenceEvent) => void): () => void;

  /** Subscribe to the live annotation set for this session. */
  onAnnotations(callback: (annotations: Annotation[]) => void): () => void;

  /** Subscribe to the live shared undo stack. */
  onUndoStack(callback: (stack: WorkspaceAction[]) => void): () => void;

  /** Persist + broadcast a new annotation (write-before-publish). */
  persistAnnotation(annotation: Annotation): Promise<void>;

  /** Dismiss an annotation by id. */
  dismissAnnotation(annotationId: string): Promise<void>;

  /** Apply an undo for a specific action (either participant). */
  applyUndo(actionId: string): Promise<void>;

  /** Hand a drag-to-delegate region to the agent. */
  delegate(region: DelegationRegion): Promise<void>;
}
