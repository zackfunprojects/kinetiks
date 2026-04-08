import { describe, it, expect } from "vitest";
import {
  computeMatchScore,
  buildBreakdown,
  DEFAULT_WEIGHTS,
} from "./composite";

describe("@kinetiks/deskof/scoring/composite", () => {
  it("returns 0 for an empty input", () => {
    const score = computeMatchScore({
      expertise_fit: 0,
      timing_score: 0,
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: 4,
    });
    // anti_signal_score = max(0, 1 - 4*0.25) = 0 → entire composite is 0
    expect(score).toBe(0);
  });

  it("returns 100 for a perfect input with no anti-signals", () => {
    const score = computeMatchScore({
      expertise_fit: 1,
      timing_score: 1,
      citation_probability: 1,
      answer_gap_score: 1,
      anti_signal_count: 0,
    });
    expect(score).toBe(100);
  });

  it("clamps inputs into [0,1]", () => {
    const score = computeMatchScore({
      expertise_fit: 5, // clamped
      timing_score: -0.5, // clamped
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: 0,
    });
    // Only expertise_fit (1.0 * 0.30) + anti_signal (1.0 * 0.05)
    expect(score).toBe(35);
  });

  it("matches the spec weights for the dimensions Phase 2 fills", () => {
    // Phase 2 Scout v1 only populates expertise_fit + timing_score
    const score = computeMatchScore({
      expertise_fit: 1,
      timing_score: 1,
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: 0,
    });
    // 0.30 + 0.20 + 0 + 0 + 0.05 = 0.55 → 55
    expect(score).toBe(55);
  });

  it("applies the anti_signal penalty correctly", () => {
    const score = computeMatchScore({
      expertise_fit: 1,
      timing_score: 1,
      citation_probability: 1,
      answer_gap_score: 1,
      anti_signal_count: 2, // anti_signal_score = max(0, 1 - 0.5) = 0.5
    });
    // Without flags: 100. With 2 flags the anti-signal contribution
    // shrinks from 0.05*1 = 0.05 to 0.05*0.5 = 0.025 → composite 97.5 → 98
    expect(score).toBe(98);
  });

  it("rejects weights that don't sum to 1", () => {
    expect(() =>
      computeMatchScore(
        {
          expertise_fit: 1,
          timing_score: 1,
          citation_probability: 1,
          answer_gap_score: 1,
          anti_signal_count: 0,
        },
        {
          expertise_fit: 0.5,
          timing_score: 0.5,
          citation_probability: 0.5,
          answer_gap_score: 0.5,
          anti_signal_penalty: 0.5,
        }
      )
    ).toThrow(/sum to 1/);
  });

  it("default weights sum to exactly 1.0", () => {
    const sum =
      DEFAULT_WEIGHTS.expertise_fit +
      DEFAULT_WEIGHTS.timing_score +
      DEFAULT_WEIGHTS.citation_probability +
      DEFAULT_WEIGHTS.answer_gap_score +
      DEFAULT_WEIGHTS.anti_signal_penalty;
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("buildBreakdown clamps inputs and exposes the anti-signal flag list", () => {
    const breakdown = buildBreakdown(
      {
        expertise_fit: 1.5,
        timing_score: -1,
        citation_probability: 0.5,
        answer_gap_score: 0.25,
        anti_signal_count: 3,
      },
      ["astroturf", "no_history"]
    );
    expect(breakdown.expertise_fit).toBe(1);
    expect(breakdown.timing_score).toBe(0);
    expect(breakdown.citation_probability).toBe(0.5);
    expect(breakdown.answer_gap_score).toBe(0.25);
    expect(breakdown.anti_signal_flags).toEqual(["astroturf", "no_history"]);
  });
});
