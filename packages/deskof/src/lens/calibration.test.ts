import { describe, expect, it } from "vitest";
import { computeLensConfig } from "./calibration";
import type { LensOperatorView } from "./types";

const operator: LensOperatorView = {
  created_at: "2026-01-01T00:00:00Z",
  per_check_sensitivity: {},
  product_names: [],
};

function configAtDay(day: number, tier: "free" | "standard" | "hero" = "standard") {
  const profileCreatedAt = "2026-01-01T00:00:00Z";
  const start = new Date(profileCreatedAt).getTime();
  return computeLensConfig({
    operator,
    profileCreatedAt,
    tier,
    now: () => new Date(start + day * 24 * 60 * 60 * 1000),
  });
}

describe("@kinetiks/deskof/lens/calibration", () => {
  it("days 1-29: advisory_only=true and nothing blocking", () => {
    for (const day of [0, 5, 15, 29]) {
      const c = configAtDay(day);
      expect(c.advisory_only).toBe(true);
      expect(c.blocking_enabled.size).toBe(0);
    }
  });

  it("day 30: advisory_only flips off; self_promo enters blocking set", () => {
    const c = configAtDay(30);
    expect(c.advisory_only).toBe(false);
    expect(Array.from(c.blocking_enabled)).toEqual(["self_promo_ratio"]);
  });

  it("days 31-59: only self_promo_ratio is blocking-eligible", () => {
    for (const day of [31, 45, 59]) {
      const c = configAtDay(day);
      expect(c.advisory_only).toBe(false);
      expect(Array.from(c.blocking_enabled)).toEqual(["self_promo_ratio"]);
    }
  });

  it("day 60: cppi joins the blocking set", () => {
    const c = configAtDay(60);
    expect(c.blocking_enabled.has("self_promo_ratio")).toBe(true);
    expect(c.blocking_enabled.has("cppi")).toBe(true);
  });

  it("day 75: at least 4 checks enabled", () => {
    const c = configAtDay(75);
    expect(c.blocking_enabled.size).toBeGreaterThanOrEqual(4);
  });

  it("day 91: all 6 blocking-eligible checks enabled (topic_spacing is soft-only)", () => {
    const c = configAtDay(91);
    expect(c.blocking_enabled.size).toBe(6);
    expect(c.blocking_enabled.has("topic_spacing")).toBe(false);
  });

  it("free tier disables all LLM-backed checks", () => {
    const c = configAtDay(91, "free");
    expect(c.llm_checks_enabled.size).toBe(0);
  });

  it("standard tier enables all 3 LLM checks", () => {
    const c = configAtDay(91, "standard");
    expect(c.llm_checks_enabled.has("tone_mismatch")).toBe(true);
    expect(c.llm_checks_enabled.has("redundancy")).toBe(true);
    expect(c.llm_checks_enabled.has("question_responsiveness")).toBe(true);
  });

  it("per-community thresholds layer in over defaults", () => {
    const c = computeLensConfig({
      operator,
      profileCreatedAt: "2026-01-01T00:00:00Z",
      tier: "standard",
      communityConfig: {
        platform: "reddit",
        community: "test",
        thresholds: {
          self_promo_ratio: { advisory: 0.2, blocking: 0.4 },
        },
        removal_rate: 0.1,
        sample_size: 50,
      },
      now: () => new Date("2026-04-15T00:00:00Z"),
    });
    expect(c.thresholds.self_promo_ratio).toEqual({
      advisory: 0.2,
      blocking: 0.4,
    });
  });

  it("operator per-check sensitivity is propagated", () => {
    const c = computeLensConfig({
      operator: {
        ...operator,
        per_check_sensitivity: { self_promo_ratio: 1.5, cppi: 0.8 },
      },
      profileCreatedAt: "2026-01-01T00:00:00Z",
      tier: "standard",
      now: () => new Date("2026-04-15T00:00:00Z"),
    });
    expect(c.sensitivity.self_promo_ratio).toBe(1.5);
    expect(c.sensitivity.cppi).toBe(0.8);
  });
});
