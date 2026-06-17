"use client";

import { useEffect, useRef, useState } from "react";
import {
  createFrameCache,
  touchFrames,
  DEFAULT_FRAME_CAPACITY,
  type FrameDescriptor,
} from "@kinetiks/collaborative";

/**
 * The app panel's ≤3 LRU frame cache (spec §14.3). Returns the descriptors to
 * keep mounted, most-recently-used first; the currently-visible ones (active +
 * side-by-side partner) are touched and pinned so a breadcrumb switch is warm.
 * Resets when the orchestration (`targetId`) changes — the panel is
 * thread/target-scoped (§17.1).
 */
export function usePanelFrameCache(
  targetId: string,
  visible: readonly FrameDescriptor[],
): FrameDescriptor[] {
  // Seed with the initially-visible frames so the first paint shows the active
  // surface (no empty flash before the effect runs).
  const [order, setOrder] = useState<FrameDescriptor[]>(() => visible.slice());
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const targetRef = useRef<string | null>(null);

  const visibleKey = visible.map((d) => d.key).join("|");

  useEffect(() => {
    const reset = targetRef.current !== targetId;
    targetRef.current = targetId;
    setOrder((prev) => {
      const base = reset
        ? createFrameCache()
        : { order: prev, capacity: DEFAULT_FRAME_CAPACITY };
      return touchFrames(base, visibleRef.current).state.order as FrameDescriptor[];
    });
    // visibleKey captures the visible-set identity without a new-array dep.
  }, [targetId, visibleKey]);

  return order;
}
