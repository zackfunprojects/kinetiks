import { describe, expect, it } from "vitest";
import { tempoForConfidence } from "../confidence-tempo";

describe("tempoForConfidence (trust through tempo, §9.2)", () => {
  it("low confidence: slow, every decision annotated", () => {
    const t = tempoForConfidence(20);
    expect(t.band).toBe("low");
    expect(t.speedMultiplier).toBeLessThan(1);
    expect(t.annotationDensity).toBe(1);
    expect(t.autoApprove).toBe(false);
  });

  it("medium confidence: moderate pace, key decisions annotated", () => {
    const t = tempoForConfidence(62);
    expect(t.band).toBe("medium");
    expect(t.speedMultiplier).toBe(1);
    expect(t.annotationDensity).toBe(0.5);
  });

  it("high confidence: fast, minimal annotations", () => {
    const t = tempoForConfidence(85);
    expect(t.band).toBe("high");
    expect(t.speedMultiplier).toBeGreaterThan(1);
    expect(t.annotationDensity).toBeLessThan(0.5);
    expect(t.autoApprove).toBe(false);
  });

  it("at/above the auto-approve threshold: background, no annotations", () => {
    const t = tempoForConfidence(96, 95);
    expect(t.band).toBe("auto");
    expect(t.autoApprove).toBe(true);
    expect(t.annotationDensity).toBe(0);
  });

  it("density falls monotonically as confidence rises", () => {
    const densities = [10, 62, 85].map((c) => tempoForConfidence(c).annotationDensity);
    expect(densities[0]).toBeGreaterThan(densities[1]);
    expect(densities[1]).toBeGreaterThan(densities[2]);
  });

  it("speed rises monotonically as confidence rises", () => {
    const speeds = [10, 62, 85].map((c) => tempoForConfidence(c).speedMultiplier);
    expect(speeds[0]).toBeLessThan(speeds[1]);
    expect(speeds[1]).toBeLessThan(speeds[2]);
  });

  it("default threshold of 100 keeps day-one work out of the auto band", () => {
    expect(tempoForConfidence(99).band).toBe("high");
    expect(tempoForConfidence(100).band).toBe("auto");
  });

  it("clamps out-of-range confidence", () => {
    expect(tempoForConfidence(-10).band).toBe("low");
    expect(tempoForConfidence(150, 100).band).toBe("auto");
  });

  it("classifies the exact band boundaries (off-by-one guard)", () => {
    expect(tempoForConfidence(50).band).toBe("medium");
    expect(tempoForConfidence(49).band).toBe("low");
    expect(tempoForConfidence(80).band).toBe("high");
    expect(tempoForConfidence(79).band).toBe("medium");
  });

  it("respects the passed threshold for the high-vs-auto cutoff (not a hardcoded 80)", () => {
    // Above 80 but below a sub-100 threshold stays 'high', not 'auto'.
    expect(tempoForConfidence(90, 95).band).toBe("high");
    expect(tempoForConfidence(95, 95).band).toBe("auto");
  });
});
