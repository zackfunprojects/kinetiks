import { describe, it, expect } from "vitest";
import { computeCppiScore, classifyCppi } from "./cppi";

describe("@kinetiks/deskof/types/cppi", () => {
  it("classifies the spec thresholds exactly", () => {
    expect(classifyCppi(0)).toBe("low");
    expect(classifyCppi(0.39)).toBe("low");
    expect(classifyCppi(0.4)).toBe("moderate");
    expect(classifyCppi(0.59)).toBe("moderate");
    expect(classifyCppi(0.6)).toBe("high");
    expect(classifyCppi(0.79)).toBe("high");
    expect(classifyCppi(0.8)).toBe("critical");
    expect(classifyCppi(1)).toBe("critical");
  });

  it("returns 0 for an empty profile", () => {
    const result = computeCppiScore(0, 0, 0);
    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
  });

  it("computes the spec composite formula", () => {
    // CPPI = volume*0.4 + concentration*0.35 + clustering*0.25
    const result = computeCppiScore(1, 1, 1);
    expect(result.score).toBeCloseTo(1.0, 9);
    expect(result.level).toBe("critical");
  });

  it("clamps each dimension to [0,1]", () => {
    const result = computeCppiScore(2, -1, 0.5);
    expect(result.volume).toBe(1);
    expect(result.concentration).toBe(0);
    expect(result.clustering).toBe(0.5);
    // 1*0.4 + 0*0.35 + 0.5*0.25 = 0.525
    expect(result.score).toBeCloseTo(0.525, 9);
    expect(result.level).toBe("moderate");
  });

  it("treats NaN as zero", () => {
    const result = computeCppiScore(NaN, NaN, NaN);
    expect(result.score).toBe(0);
  });
});
