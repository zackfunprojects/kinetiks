import { describe, it, expect } from "vitest";
import {
  DEFAULT_FRAME_CAPACITY,
  createFrameCache,
  frameKey,
  touchFrame,
  touchFrames,
  type FrameDescriptor,
} from "./frame-cache";

/**
 * Performance budget: ≤3 cached webviews (spec §14.3). The desktop memory
 * ceiling is enforced by the LRU, not by hope — these are continuous-invariant
 * property checks (the budget holds after *every* operation, not just at the
 * end), so a regression that lets the cache grow is caught.
 *
 * The live "observe ≤3 webviews evicted in a running desktop app" memory check
 * is runtime-deferred (no display/GPU here); this proves the eviction logic the
 * desktop relies on.
 */

const d = (n: number): FrameDescriptor => ({ key: frameKey(`app${n}`), app: `app${n}` });

describe("§14.3 frame-cache memory budget", () => {
  it("pins the spec's ≤3 ceiling as the default (guard against silent bumps)", () => {
    expect(DEFAULT_FRAME_CAPACITY).toBe(3);
  });

  it("never exceeds capacity under churn of many distinct frames", () => {
    let state = createFrameCache();
    for (let n = 0; n < 50; n++) {
      const result = touchFrame(state, d(n));
      state = result.state;
      // The budget holds continuously — after every single mount.
      expect(state.order.length).toBeLessThanOrEqual(DEFAULT_FRAME_CAPACITY);
    }
  });

  it("keeps the just-mounted (active) frame resident through churn", () => {
    let state = createFrameCache();
    for (let n = 0; n < 20; n++) {
      state = touchFrame(state, d(n)).state;
      expect(state.order[0].key).toBe(frameKey(`app${n}`));
    }
  });

  it("holds the budget while two side-by-side frames stay pinned", () => {
    let state = createFrameCache();
    for (let n = 0; n < 20; n += 2) {
      const pair = [d(n), d(n + 1)];
      const result = touchFrames(state, pair);
      state = result.state;
      expect(state.order.length).toBeLessThanOrEqual(DEFAULT_FRAME_CAPACITY);
      // Both partners are resident after the swap (warm side-by-side).
      for (const p of pair) {
        expect(state.order.some((f) => f.key === p.key)).toBe(true);
      }
    }
  });

  it("only ever exceeds the ceiling in the documented all-pinned case", () => {
    // Three pinned frames + a fourth pinned mount: the cache may briefly hold 4
    // rather than drop a frame that must render. This is the SOLE exception, and
    // it is bounded to the over-pin count.
    let state = createFrameCache();
    const all = [d(1), d(2), d(3), d(4)];
    const pinned = new Set(all.map((f) => f.key));
    for (const f of all) {
      state = touchFrame(state, f, pinned).state;
    }
    expect(state.order.length).toBe(4); // 4 pinned, nothing evictable
    // As pins relax, eviction resumes: with one frame now unpinned, mounting a
    // new active frame evicts it instead of growing further (over-pin is bounded
    // to the number of pinned frames, never unbounded growth).
    const relaxed = new Set([all[0].key, all[1].key, all[2].key]);
    const { evicted } = touchFrame(state, d(5), relaxed);
    expect(evicted?.key).toBe(all[3].key); // the one unpinned frame is dropped
  });
});
