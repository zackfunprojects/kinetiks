import { describe, expect, it } from "vitest";
import {
  computeConfidenceScore,
  observationTerm,
  projectConfidenceForRead,
  recencyTerm,
  stabilityTerm,
  CONFIDENCE_CONSTANTS,
  CONFIDENCE_WEIGHTS,
} from "../confidence";

describe("CONFIDENCE_WEIGHTS invariant", () => {
  it("weights sum to 1.0 (Phase 1 spec)", () => {
    const sum =
      CONFIDENCE_WEIGHTS.w_obs +
      CONFIDENCE_WEIGHTS.w_recency +
      CONFIDENCE_WEIGHTS.w_stability;
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("weights match the spec values (0.5, 0.2, 0.3)", () => {
    expect(CONFIDENCE_WEIGHTS.w_obs).toBe(0.5);
    expect(CONFIDENCE_WEIGHTS.w_recency).toBe(0.2);
    expect(CONFIDENCE_WEIGHTS.w_stability).toBe(0.3);
  });

  it("k_obs and epsilon match the spec values", () => {
    expect(CONFIDENCE_CONSTANTS.k_obs).toBe(8);
    expect(CONFIDENCE_CONSTANTS.epsilon).toBe(1e-6);
  });
});

describe("observationTerm", () => {
  it("is 0 at zero observations", () => {
    expect(observationTerm(0)).toBe(0);
    expect(observationTerm(-1)).toBe(0);
  });

  it("approaches 1 as observations grow", () => {
    expect(observationTerm(8)).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(observationTerm(80)).toBeGreaterThan(0.99);
    expect(observationTerm(1000)).toBeGreaterThan(0.999);
  });

  it("is monotonically increasing", () => {
    const xs = [1, 2, 4, 8, 16, 32, 64];
    let prev = 0;
    for (const x of xs) {
      const v = observationTerm(x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe("recencyTerm", () => {
  it("returns 1.0 when zero days have passed", () => {
    expect(recencyTerm(0, 30)).toBe(1);
  });

  it("decays toward 0 as days grow", () => {
    expect(recencyTerm(15, 30)).toBeCloseTo(Math.exp(-1), 6); // half life is decay/2 → 15 days at decay 30
    expect(recencyTerm(60, 30)).toBeLessThan(0.02);
  });

  it("clamps negative days to zero (defensive)", () => {
    expect(recencyTerm(-5, 30)).toBe(1);
  });

  it("returns 0 for non-positive effective_decay_days (defensive)", () => {
    expect(recencyTerm(5, 0)).toBe(0);
    expect(recencyTerm(5, -1)).toBe(0);
  });

  it("is monotonically decreasing in days", () => {
    let prev = recencyTerm(0, 30);
    for (let d = 5; d <= 60; d += 5) {
      const cur = recencyTerm(d, 30);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("stabilityTerm", () => {
  it("returns 0 with fewer than 2 samples", () => {
    expect(stabilityTerm([])).toBe(0);
    expect(stabilityTerm([0.5])).toBe(0);
  });

  it("returns 1 when all values are equal", () => {
    expect(stabilityTerm([0.5, 0.5, 0.5])).toBeCloseTo(1, 9);
    expect(stabilityTerm([1, 1, 1, 1])).toBeCloseTo(1, 9);
  });

  it("returns close to 1 for low-variance series", () => {
    const v = stabilityTerm([0.50, 0.51, 0.49, 0.50, 0.51]);
    expect(v).toBeGreaterThan(0.99);
  });

  it("returns close to 0 for high-variance (variance >> mean^2) series", () => {
    const v = stabilityTerm([0.01, 1.0, 0.01, 1.0]);
    expect(v).toBeLessThan(0.5);
  });

  it("clamps to [0, 1]", () => {
    // Construct a series where normalized_variance > 1 (e.g., mean tiny)
    const v = stabilityTerm([0.001, 0.5, 0.001, 0.5]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("handles all-zero series via the epsilon guard", () => {
    const v = stabilityTerm([0, 0, 0]);
    expect(v).toBeCloseTo(1, 6); // zero variance → 1
  });
});

describe("computeConfidenceScore", () => {
  // Degenerate path: observation_count = 0 is never produced by the
  // pattern write path in production (a pattern row exists only after
  // at least one observation). The function nevertheless returns the
  // formula's literal value rather than short-circuiting to 0; the test
  // pins the actual behavior so future weight tuning is intentional.
  it("yields the literal formula value at zero observations and zero days", () => {
    const v = computeConfidenceScore({
      observation_count: 0,
      days_since_last_observation: 0,
      effective_decay_days: 30,
      primary_metric_values: [],
    });
    // 0.5*0 (obs) + 0.2*exp(0) (recency=1) + 0.3*0 (stability) = 0.2
    expect(v).toBeCloseTo(0.2, 6);
  });

  it("returns a value in [0, 1]", () => {
    const v = computeConfidenceScore({
      observation_count: 20,
      days_since_last_observation: 5,
      effective_decay_days: 30,
      primary_metric_values: [0.5, 0.5, 0.5, 0.5, 0.5],
    });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("increases with more observations (ceteris paribus)", () => {
    const base = {
      days_since_last_observation: 0,
      effective_decay_days: 30,
      primary_metric_values: [0.5, 0.5, 0.5],
    };
    const a = computeConfidenceScore({ ...base, observation_count: 5 });
    const b = computeConfidenceScore({ ...base, observation_count: 50 });
    expect(b).toBeGreaterThan(a);
  });

  it("decreases as recency degrades (ceteris paribus)", () => {
    const base = {
      observation_count: 20,
      effective_decay_days: 30,
      primary_metric_values: [0.5, 0.5, 0.5],
    };
    const a = computeConfidenceScore({ ...base, days_since_last_observation: 0 });
    const b = computeConfidenceScore({ ...base, days_since_last_observation: 60 });
    expect(b).toBeLessThan(a);
  });

  it("decreases as stability degrades (ceteris paribus)", () => {
    const base = {
      observation_count: 20,
      days_since_last_observation: 0,
      effective_decay_days: 30,
    };
    const stable = computeConfidenceScore({
      ...base,
      primary_metric_values: [0.5, 0.5, 0.5, 0.5, 0.5],
    });
    const volatile = computeConfidenceScore({
      ...base,
      primary_metric_values: [0.01, 1.0, 0.01, 1.0, 0.01],
    });
    expect(volatile).toBeLessThan(stable);
  });

  it("approaches the weighted sum upper bound for ideal inputs", () => {
    // Many observations (obs_term ~ 1), zero days (recency ~ 1), stable
    // primary metric (stability ~ 1) → score ~ 1.0
    const v = computeConfidenceScore({
      observation_count: 200,
      days_since_last_observation: 0,
      effective_decay_days: 30,
      primary_metric_values: Array(50).fill(0.42),
    });
    expect(v).toBeGreaterThan(0.99);
  });

  it("is fully reproducible from the same inputs", () => {
    const input = {
      observation_count: 17,
      days_since_last_observation: 3,
      effective_decay_days: 45,
      primary_metric_values: [0.21, 0.23, 0.19, 0.25, 0.22],
    };
    expect(computeConfidenceScore(input)).toBe(computeConfidenceScore(input));
  });
});

describe("projectConfidenceForRead", () => {
  it("returns the stored score for unsuppressed", () => {
    expect(projectConfidenceForRead({ stored_score: 0.73, user_suppressed: false })).toBe(0.73);
  });

  it("returns 0 for suppressed (storage unchanged)", () => {
    expect(projectConfidenceForRead({ stored_score: 0.73, user_suppressed: true })).toBe(0);
  });
});
