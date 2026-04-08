import { describe, expect, it } from "vitest";
import { computeTimingScore, freshnessComponent } from "./timing";

const NOW = Date.parse("2026-04-08T00:00:00Z");
const isoHoursAgo = (h: number) =>
  new Date(NOW - h * 60 * 60 * 1000).toISOString();

describe("@kinetiks/deskof/scout/timing", () => {
  describe("freshness", () => {
    it("brand-new threads cap at 0.95", () => {
      expect(freshnessComponent(isoHoursAgo(0), NOW)).toBeCloseTo(0.95, 2);
    });
    it("decays at 36h half-life", () => {
      // At 36 hours, raw decay = 0.5, which is below the 0.95 ceiling
      // and above the 0.05 floor, so the bound is irrelevant.
      expect(freshnessComponent(isoHoursAgo(36), NOW)).toBeCloseTo(0.5, 2);
    });
    it("ancient threads floor at 0.05", () => {
      expect(freshnessComponent(isoHoursAgo(720), NOW)).toBeCloseTo(0.05, 4);
    });
    it("invalid timestamps fall back to 0.3", () => {
      expect(freshnessComponent("not-a-date", NOW)).toBe(0.3);
    });
  });

  describe("velocity blend", () => {
    it("no velocity data → freshness alone", () => {
      const f = freshnessComponent(isoHoursAgo(12), NOW);
      const t = computeTimingScore({ created_at: isoHoursAgo(12) }, NOW);
      expect(t).toBeCloseTo(f, 6);
    });
    it("hot velocity bumps the score", () => {
      const baseline = computeTimingScore({ created_at: isoHoursAgo(12) }, NOW);
      const hot = computeTimingScore(
        {
          created_at: isoHoursAgo(12),
          upvotes_per_hour: 60,
          comments_per_hour: 12,
        },
        NOW
      );
      expect(hot).toBeGreaterThan(baseline);
    });
    it("velocity is bounded — extreme values do not exceed 1", () => {
      const t = computeTimingScore(
        {
          created_at: isoHoursAgo(0),
          upvotes_per_hour: 100000,
          comments_per_hour: 100000,
        },
        NOW
      );
      expect(t).toBeLessThanOrEqual(1);
    });
    it("zero velocity stays close to freshness", () => {
      const f = freshnessComponent(isoHoursAgo(6), NOW);
      const t = computeTimingScore(
        {
          created_at: isoHoursAgo(6),
          upvotes_per_hour: 0,
          comments_per_hour: 0,
        },
        NOW
      );
      // 0.7 * f + 0.3 * 0
      expect(t).toBeCloseTo(0.7 * f, 6);
    });
  });
});
