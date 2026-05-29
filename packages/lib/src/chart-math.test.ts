import { describe, it, expect } from "vitest";
import {
  scaleY,
  scaleX,
  toPoints,
  sparklinePoints,
  trendPaths,
  barRects,
  fractionToPercent,
} from "./chart-math";

describe("scaleY", () => {
  it("inverts so the max value sits at the top (smallest y)", () => {
    expect(scaleY(10, 0, 10, 100)).toBe(0);
    expect(scaleY(0, 0, 10, 100)).toBe(100);
    expect(scaleY(5, 0, 10, 100)).toBe(50);
  });

  it("centers a flat series (min === max)", () => {
    expect(scaleY(7, 7, 7, 100)).toBe(50);
  });

  it("respects vertical padding", () => {
    // usable height = 100 - 2*10 = 80; max -> top pad
    expect(scaleY(10, 0, 10, 100, 10)).toBe(10);
    expect(scaleY(0, 0, 10, 100, 10)).toBe(90);
  });
});

describe("scaleX", () => {
  it("spreads points from left to right edge", () => {
    expect(scaleX(0, 4, 90)).toBe(0);
    expect(scaleX(3, 4, 90)).toBe(90);
    expect(scaleX(1, 3, 100)).toBe(50);
  });

  it("pins a single point to the left pad", () => {
    expect(scaleX(0, 1, 100, 4)).toBe(4);
  });
});

describe("toPoints", () => {
  it("returns empty for no values", () => {
    expect(toPoints([], 100, 40)).toEqual([]);
  });

  it("maps a two-point ascending series across the box", () => {
    const pts = toPoints([0, 10], 100, 100);
    expect(pts[0]).toEqual({ x: 0, y: 100 });
    expect(pts[1]).toEqual({ x: 100, y: 0 });
  });
});

describe("sparklinePoints", () => {
  it("produces an SVG points string", () => {
    expect(sparklinePoints([1, 2, 3], 100, 100, 0)).toBe("0,100 50,50 100,0");
  });

  it("is empty for no data", () => {
    expect(sparklinePoints([], 100, 40)).toBe("");
  });
});

describe("trendPaths", () => {
  it("returns empty strings for no data", () => {
    expect(trendPaths([], 100, 40)).toEqual({ line: "", area: "" });
  });

  it("draws a flat full-width line for a single value", () => {
    const { line, area } = trendPaths([5], 100, 40, 2);
    expect(line).toBe("M 2 20 L 98 20");
    expect(area).toContain("Z");
  });

  it("draws a multi-point line and a closed area", () => {
    const { line, area } = trendPaths([0, 10], 100, 100, 0);
    expect(line).toBe("M 0 100 L 100 0");
    expect(area).toBe("M 0 100 L 100 0 L 100 100 L 0 100 Z");
  });
});

describe("barRects", () => {
  it("returns empty for no values", () => {
    expect(barRects([], 100, 40)).toEqual([]);
  });

  it("scales the tallest bar to the usable height and floors zero", () => {
    const rects = barRects([0, 10], 100, 100, 0, 0);
    expect(rects[0].height).toBe(0);
    expect(rects[1].height).toBe(100);
    // two bars, no gap/pad -> each 50 wide
    expect(rects[0].width).toBe(50);
    expect(rects[1].x).toBe(50);
  });

  it("treats an all-zero series as flat (no NaN)", () => {
    const rects = barRects([0, 0], 100, 40);
    expect(rects.every((r) => r.height === 0)).toBe(true);
  });
});

describe("fractionToPercent", () => {
  it("clamps to [0,100]", () => {
    expect(fractionToPercent(0.5)).toBe(50);
    expect(fractionToPercent(-1)).toBe(0);
    expect(fractionToPercent(2)).toBe(100);
  });

  it("returns 0 for NaN (never produces width:'NaN%')", () => {
    expect(fractionToPercent(NaN)).toBe(0);
    expect(fractionToPercent(0 / 0)).toBe(0);
  });
});
