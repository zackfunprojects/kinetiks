/**
 * The ≤3 LRU frame cache for the app panel (spec §14.3; Phase 8.7 D3).
 *
 * Pure, renderer-agnostic state. The panel keeps every cached frame mounted
 * (the active one visible, the others hidden = warm), so switching apps is
 * instant; a fourth mount evicts the least-recently-used NON-pinned frame
 * (active + side-by-side partner are pinned). Unit-tested without a DOM.
 */

export interface FrameDescriptor {
  /** Stable identity: `${app}::${entity ?? ""}`. */
  key: string;
  app: string;
  entity?: string;
}

export interface FrameCacheState {
  /** Most-recently-used first. */
  order: readonly FrameDescriptor[];
  capacity: number;
}

export const DEFAULT_FRAME_CAPACITY = 3;

export function createFrameCache(capacity: number = DEFAULT_FRAME_CAPACITY): FrameCacheState {
  return { order: [], capacity: Math.max(1, capacity) };
}

export function frameKey(app: string, entity?: string): string {
  return `${app}::${entity ?? ""}`;
}

/**
 * Promote (or mount) a descriptor to most-recently-used. If that pushes the
 * cache over capacity, evict the least-recently-used frame that is NOT pinned.
 * If every over-capacity frame is pinned, no eviction happens (the cache may
 * briefly exceed capacity rather than drop a frame that must render).
 */
export function touchFrame(
  state: FrameCacheState,
  descriptor: FrameDescriptor,
  pinned: ReadonlySet<string> = new Set(),
): { state: FrameCacheState; evicted: FrameDescriptor | null } {
  const without = state.order.filter((d) => d.key !== descriptor.key);
  let order: FrameDescriptor[] = [descriptor, ...without];
  let evicted: FrameDescriptor | null = null;

  if (order.length > state.capacity) {
    // Walk from the back (LRU) for the first evictable frame. The just-touched
    // frame (front) is never evicted — you touched it to keep/render it; if
    // every other frame is pinned, the cache briefly exceeds capacity instead.
    for (let i = order.length - 1; i >= 1; i--) {
      if (!pinned.has(order[i].key)) {
        evicted = order[i];
        order = [...order.slice(0, i), ...order.slice(i + 1)];
        break;
      }
    }
  }

  return { state: { order, capacity: state.capacity }, evicted };
}

/**
 * Touch several descriptors in order (the last ends most-recently-used) with
 * all of them pinned for the duration — used to keep the active frame and a
 * side-by-side partner both resident.
 */
export function touchFrames(
  state: FrameCacheState,
  descriptors: readonly FrameDescriptor[],
): { state: FrameCacheState; evicted: FrameDescriptor[] } {
  const pinned = new Set(descriptors.map((d) => d.key));
  let current = state;
  const evicted: FrameDescriptor[] = [];
  for (const d of descriptors) {
    const result = touchFrame(current, d, pinned);
    current = result.state;
    if (result.evicted) evicted.push(result.evicted);
  }
  return { state: current, evicted };
}
