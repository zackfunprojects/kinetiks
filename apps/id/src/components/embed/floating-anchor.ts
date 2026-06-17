import type { CSSProperties } from "react";

/**
 * Shared anchor for the bottom-center floating bars on the embed reference
 * surface — the task drawer (§8) and the approval overlay (§9.1) occupy the
 * same anchor (they are mutually exclusive phases).
 *
 * `zIndex` and the panel max-width are layout constants shared across the embed
 * surfaces (UndoStackPanel, TaskDrawerSurface, ApprovalSurface). The design
 * token system defines no z-index or arbitrary-width tokens, so these match the
 * sibling surfaces by value; spacing still uses --kt-* tokens.
 */
export const bottomCenterAnchor: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "var(--kt-s-4)",
  transform: "translateX(-50%)",
  zIndex: 22,
  width: "min(560px, calc(100% - var(--kt-s-6)))",
};
