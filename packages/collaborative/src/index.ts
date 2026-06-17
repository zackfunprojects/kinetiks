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

export {
  createRealtimePresenceTransport,
  type RealtimePresenceTransport,
} from "./realtime-transport";
export { useRealtimePresenceTransport } from "./use-realtime-transport";

// Shell ↔ embed coordination bridge (spec §4.4, §10.4) — postMessage (web)
// and webview IPC (desktop) adapters over one PanelMessage contract.
export {
  PANEL_IPC_CHANNEL,
  isPanelMessage,
  createPostMessageBridge,
  createWebviewHostBridge,
  createWebviewGuestBridge,
  type PanelBridge,
  type PostMessageBridgeOptions,
  type WebviewHostElement,
  type WebviewGuestApi,
} from "./panel-bridge";
