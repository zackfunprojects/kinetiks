import { describe, it, expect } from "vitest";
import {
  createFrameCache,
  frameKey,
  touchFrame,
  touchFrames,
  type FrameDescriptor,
} from "./frame-cache";

const d = (app: string, entity?: string): FrameDescriptor => ({ key: frameKey(app, entity), app, entity });

describe("frameKey", () => {
  it("is stable per (app, entity)", () => {
    expect(frameKey("hv", "seq_1")).toBe("hv::seq_1");
    expect(frameKey("hv")).toBe("hv::");
    expect(frameKey("hv", "seq_1")).toBe(frameKey("hv", "seq_1"));
  });
});

describe("touchFrame", () => {
  it("promotes to most-recently-used without duplicating", () => {
    let s = createFrameCache(3);
    s = touchFrame(s, d("a")).state;
    s = touchFrame(s, d("b")).state;
    s = touchFrame(s, d("a")).state; // re-touch a
    expect(s.order.map((x) => x.app)).toEqual(["a", "b"]);
  });

  it("evicts the least-recently-used non-pinned frame past capacity", () => {
    let s = createFrameCache(3);
    s = touchFrame(s, d("a")).state;
    s = touchFrame(s, d("b")).state;
    s = touchFrame(s, d("c")).state; // [c, b, a]
    const r = touchFrame(s, d("d")); // [d, c, b, a] -> evict a
    expect(r.evicted?.app).toBe("a");
    expect(r.state.order.map((x) => x.app)).toEqual(["d", "c", "b"]);
  });

  it("never evicts a pinned frame; evicts the next LRU instead", () => {
    let s = createFrameCache(3);
    s = touchFrame(s, d("a")).state;
    s = touchFrame(s, d("b")).state;
    s = touchFrame(s, d("c")).state; // [c, b, a]
    // Render d while a is pinned (active) -> evict b (next LRU), keep a.
    const r = touchFrame(s, d("d"), new Set([frameKey("a")]));
    expect(r.evicted?.app).toBe("b");
    expect(r.state.order.map((x) => x.app)).toEqual(["d", "c", "a"]);
  });

  it("keeps all frames (over capacity) when every eviction candidate is pinned", () => {
    let s = createFrameCache(2);
    s = touchFrame(s, d("a")).state;
    s = touchFrame(s, d("b")).state; // [b, a]
    const pinned = new Set([frameKey("a"), frameKey("b")]);
    const r = touchFrame(s, d("c"), pinned); // can't evict a or b
    expect(r.evicted).toBeNull();
    expect(r.state.order).toHaveLength(3);
  });
});

describe("touchFrames (active + partner pinned)", () => {
  it("keeps both side-by-side frames resident and the last touched is MRU", () => {
    let s = createFrameCache(3);
    s = touchFrame(s, d("a")).state;
    s = touchFrame(s, d("b")).state;
    s = touchFrame(s, d("c")).state; // [c, b, a]
    // Show both d and a side-by-side: neither may be evicted.
    const r = touchFrames(s, [d("d"), d("a")]);
    const apps = r.state.order.map((x) => x.app);
    expect(apps).toContain("d");
    expect(apps).toContain("a");
    expect(apps[0]).toBe("a"); // last touched is MRU
    expect(r.state.order).toHaveLength(3);
  });
});
