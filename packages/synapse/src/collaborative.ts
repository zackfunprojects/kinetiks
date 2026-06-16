/**
 * CollaborativeSynapse — the collaborative-mode extension every embeddable
 * app surface implements on top of its command handler (spec §11.1).
 *
 * This composes with `BaseCommandHandler` (the command surface) rather than
 * extending the class, so an app can adopt collaborative mode incrementally.
 * It is app-agnostic: the reference surface in `apps/id` implements it today;
 * real suite apps adopt the same interface later with zero platform changes.
 *
 * The data shapes (PresenceEvent, UIStateChange, AnnotationAnchor,
 * DelegationRegion, WorkspaceAction) are the shared contract in
 * `@kinetiks/types`.
 */

import type {
  PresenceEvent,
  UIStateChange,
  AnnotationAnchor,
  DelegationRegion,
  WorkspaceAction,
} from "@kinetiks/types";

export interface CollaborativeSynapse {
  /** Stream UI state changes (field updates, cursor moves) for the presence layer. */
  subscribeToUIState(callback: (state: UIStateChange) => void): () => void;

  /** Receive a user presence event (focus/scroll/hover/select) from the shell. */
  handleUserPresence(event: PresenceEvent): void;

  /** Annotation anchor points available for the current view. */
  getAnnotationAnchors(): AnnotationAnchor[];

  /** Pick up a drag-to-delegate region: take over exactly these fields. */
  handleDelegation(region: DelegationRegion): Promise<void>;

  /** The shared undo stack for the current collaborative session. */
  getUndoStack(): WorkspaceAction[];

  /** Apply an undo for a specific action (either participant). */
  applyUndo(actionId: string): Promise<void>;
}
