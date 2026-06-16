/**
 * @kinetiks/collaborative — app-agnostic React context + hooks for the
 * collaborative workspace (split-panel, presence, annotations, undo, tempo).
 *
 * Consumed by the reference collaborative surface in `apps/id` today and by
 * real suite-app `/embed` surfaces later. Knows nothing about any specific app
 * or fixtures — only the shared contract in `@kinetiks/types`.
 */

export {
  CollaborativeProvider,
  CollaborativeContext,
  type CollaborativeProviderProps,
  type CollaborativeContextValue,
} from "./provider";

export {
  useCollaborative,
  useIsCollaborative,
  useAgentPresence,
  useFieldAnnotations,
  useIsAgentFocused,
  useDelegateRegion,
  useUndoStack,
  useTempoMode,
} from "./hooks";

export type { CollaborativeTransport } from "./transport";
