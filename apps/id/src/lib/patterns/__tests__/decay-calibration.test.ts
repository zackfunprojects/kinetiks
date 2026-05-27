import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Pattern, PatternTypeDescriptor } from "@kinetiks/types";
import {
  calibratePattern,
  CALIBRATION_WINDOW_DAYS,
  DEAD_BAND_RATIO,
  EXTEND_MULTIPLIER,
  SHORTEN_MULTIPLIER,
  STALE_THRESHOLD_DAYS,
} from "../decay-calibration";

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-05-27T02:00:00Z");

function descriptor(
  over: Partial<PatternTypeDescriptor> = {},
): PatternTypeDescriptor {
  return {
    pattern_type: "harvest.outreach_angle_performance.reply_rate",
    source_app: "harvest",
    description:
      "Outreach angle x industry x seniority signature mapped to reply rate (test).",
    read_apps: ["marcus", "harvest"],
    customer_visible: true,
    dimensions_schema: z
      .object({
        angle_kind: z.string(),
        industry_bucket: z.string(),
        seniority_tier: z.string(),
      })
      .passthrough(),
    fingerprint_dimensions: ["angle_kind", "industry_bucket", "seniority_tier"],
    outcome_metric: "reply_rate",
    outcome_unit: "ratio_0_1",
    outcome_direction: "higher_is_better",
    decay_bounds: {
      initial_decay_days: 60,
      decay_floor_days: 30,
      decay_ceiling_days: 180,
      calibration_sample_threshold: 20,
    },
    confidence_thresholds: { validate_at: 0.7, decline_at: 0.3 },
    ...over,
  };
}

function basePattern(over: Partial<Pattern> = {}): Pattern {
  // last_observed_at = 5 days before NOW (well inside the calibration window)
  const lastObserved = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
  return {
    id: "pat-1",
    account_id: ACCOUNT_ID,
    team_scope_id: null,
    source_app: "harvest",
    source_workflow_id: null,
    pattern_type: "harvest.outreach_angle_performance.reply_rate",
    applies_to_icp: "head_of_marketing_smb_saas",
    fingerprint: "fp-1",
    outcome_metric: "reply_rate",
    outcome_value: 0.12,
    outcome_direction: "higher_is_better",
    baseline_value: 0.1,
    lift_ratio: 1.2,
    sample_size: 200,
    observation_count: 40,
    confidence_score: 0.75,
    variance: 0.0005, // tight variance → stable
    status: "validated",
    first_observed_at: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    last_observed_at: lastObserved,
    effective_decay_days: 60,
    decay_at: new Date(NOW.getTime() + 55 * 86_400_000).toISOString(),
    validated_at: new Date(NOW.getTime() - 20 * 86_400_000).toISOString(),
    declining_at: null,
    archived_at: null,
    imported: false,
    imported_from: null,
    user_starred: false,
    user_suppressed: false,
    user_annotation: null,
    dimensions: {
      angle_kind: "curiosity_hook",
      industry_bucket: "b2b_saas",
      seniority_tier: "director",
    },
    evidence_summary: {
      last_n_ledger_ids: ["ledger-1", "ledger-2"],
      summary: { total_evidence_count: 40, period_days: 30 },
    },
    created_at: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    updated_at: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(),
    ...over,
  };
}

// ────────────────────────────────────────────────
// Eligibility / skip cases
// ────────────────────────────────────────────────

describe("calibratePattern — eligibility gates", () => {
  it("skips when status is archived", () => {
    const result = calibratePattern({
      pattern: basePattern({ status: "archived" }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("skip");
    expect(result.next_effective_decay_days).toBe(60);
    expect(result.rationale).toMatch(/archived/i);
  });

  it("skips when observation_count is below calibration_sample_threshold", () => {
    const result = calibratePattern({
      pattern: basePattern({ observation_count: 5 }),
      descriptor: descriptor(), // threshold=20
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("skip");
    expect(result.rationale).toMatch(/below threshold/i);
    expect(result.rationale).toContain("5");
    expect(result.rationale).toContain("20");
  });

  it("skips when variance is null", () => {
    const result = calibratePattern({
      pattern: basePattern({ variance: null }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("skip");
    expect(result.rationale).toMatch(/variance/i);
  });

  it("skips when observation_count is below 2 (variance not meaningful)", () => {
    const result = calibratePattern({
      pattern: basePattern({ observation_count: 1, variance: 0 }),
      descriptor: descriptor({
        decay_bounds: {
          initial_decay_days: 60,
          decay_floor_days: 30,
          decay_ceiling_days: 180,
          calibration_sample_threshold: 1, // pass that gate so we hit the variance one
        },
      }),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("skip");
    expect(result.rationale).toMatch(/observation_count/i);
  });

  it("skips when last_observed_at is older than the stale threshold", () => {
    const stale = new Date(
      NOW.getTime() - (STALE_THRESHOLD_DAYS + 1) * 86_400_000,
    ).toISOString();
    const result = calibratePattern({
      pattern: basePattern({ last_observed_at: stale }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("skip");
    expect(result.rationale).toMatch(/stale/i);
  });

  it("does NOT skip user_starred or user_suppressed patterns (calibration is structural)", () => {
    const result = calibratePattern({
      pattern: basePattern({
        user_starred: true,
        user_suppressed: true,
        variance: 0.0005, // stable
      }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(["extend", "no_move", "shorten"]).toContain(result.decision);
    expect(result.decision).not.toBe("skip");
  });
});

// ────────────────────────────────────────────────
// Direction: extend (stable signals)
// ────────────────────────────────────────────────

describe("calibratePattern — extend (stable signals)", () => {
  it("extends when variance is low AND zero declining transitions in window", () => {
    // normalized_variance = 0.0005 / (0.12² + ε) ≈ 0.0347
    // stability_term = 1 - 0.0347 ≈ 0.965 → >= validate_at (0.7) → stable
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.0005, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("extend");
    expect(result.next_effective_decay_days).toBeGreaterThan(60);
    expect(result.next_effective_decay_days).toBeLessThanOrEqual(180);
    expect(result.next_effective_decay_days).toBeCloseTo(
      60 * EXTEND_MULTIPLIER,
      6,
    );
    expect(result.prior_effective_decay_days).toBe(60);
    expect(result.rationale).toMatch(/stable|extend/i);
  });

  it("extends when one signal is stable and the other neutral", () => {
    // Stable variance + 1 declining transition (neutral) → extend
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.0005, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 1,
      now: NOW,
    });
    expect(result.decision).toBe("extend");
  });

  it("recomputes decay_at from last_observed_at + next_effective_decay_days", () => {
    const lastObservedMs = new Date(
      NOW.getTime() - 5 * 86_400_000,
    ).getTime();
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.0005, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("extend");
    const expected = new Date(
      lastObservedMs + result.next_effective_decay_days * 86_400_000,
    ).toISOString();
    expect(result.next_decay_at).toBe(expected);
  });
});

// ────────────────────────────────────────────────
// Direction: shorten (unstable signals)
// ────────────────────────────────────────────────

describe("calibratePattern — shorten (unstable signals)", () => {
  it("shortens when variance is high AND >= 2 declining transitions in window", () => {
    // normalized_variance = 0.05 / (0.12² + ε) ≈ 3.47 → clamped to 1.0
    // stability_term = 0 → <= decline_at (0.3) → unstable
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.05, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 2,
      now: NOW,
    });
    expect(result.decision).toBe("shorten");
    expect(result.next_effective_decay_days).toBeLessThan(60);
    expect(result.next_effective_decay_days).toBeGreaterThanOrEqual(30);
    expect(result.next_effective_decay_days).toBeCloseTo(
      60 * SHORTEN_MULTIPLIER,
      6,
    );
    expect(result.rationale).toMatch(/unstable|shorten|declining/i);
  });

  it("shortens when one signal is unstable and the other neutral", () => {
    // High variance + 1 declining transition (neutral) → shorten
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.05, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 1,
      now: NOW,
    });
    expect(result.decision).toBe("shorten");
  });
});

// ────────────────────────────────────────────────
// Direction: no_move (mixed / neutral)
// ────────────────────────────────────────────────

describe("calibratePattern — no_move (mixed or neutral signals)", () => {
  it("no_move when both signals are neutral (mid-band variance + 1 declining)", () => {
    // We need stability_term ~ 0.5 (between decline_at=0.3 and validate_at=0.7).
    // normalized_variance ~ 0.5 → variance / (mean² + ε) = 0.5
    // variance = 0.5 * 0.12² ≈ 0.0072.
    // recent_declining_count=1 is the neutral lifecycle band.
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.0072, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 1,
      now: NOW,
    });
    expect(result.decision).toBe("no_move");
    expect(result.next_effective_decay_days).toBe(60);
    expect(result.rationale).toMatch(/neutral/i);
  });

  it("extends when stability is neutral but lifecycle is stable (one stable + neutral)", () => {
    // Stability neutral (mid-band) + 0 declining (stable contributor) → extend
    // per the "one stable + the other neutral → extend" rule.
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.0072, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("extend");
  });

  it("no_move when signals are mixed (stable variance + 2 declining)", () => {
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.0005, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 2, // unstable signal
      now: NOW,
    });
    expect(result.decision).toBe("no_move");
    expect(result.rationale).toMatch(/mixed/i);
  });

  it("no_move when signals are mixed (high variance + 0 declining)", () => {
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.05, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 0, // stable signal
      now: NOW,
    });
    expect(result.decision).toBe("no_move");
    expect(result.rationale).toMatch(/mixed/i);
  });
});

// ────────────────────────────────────────────────
// Clamping (floor / ceiling)
// ────────────────────────────────────────────────

describe("calibratePattern — clamping", () => {
  it("does not exceed decay_ceiling_days when extending from below ceiling", () => {
    // Pattern at 170, ceiling 180. 170 * 1.1 = 187 → clamp to 180.
    const result = calibratePattern({
      pattern: basePattern({
        variance: 0.0005,
        outcome_value: 0.12,
        effective_decay_days: 170,
      }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.next_effective_decay_days).toBeLessThanOrEqual(180);
    // 170 -> 187 clamped to 180. 180/170 = 1.0588 → above DEAD_BAND_RATIO (0.05) → extend
    expect(result.decision).toBe("extend");
    expect(result.next_effective_decay_days).toBe(180);
  });

  it("does not fall below decay_floor_days when shortening from above floor", () => {
    // Pattern at 32, floor 30. 32 * 0.9 = 28.8 → clamp to 30.
    const result = calibratePattern({
      pattern: basePattern({
        variance: 0.05,
        outcome_value: 0.12,
        effective_decay_days: 32,
      }),
      descriptor: descriptor(),
      recent_declining_count: 2,
      now: NOW,
    });
    expect(result.next_effective_decay_days).toBeGreaterThanOrEqual(30);
    // 32 -> 28.8 clamped to 30. (32-30)/32 = 0.0625 → above DEAD_BAND_RATIO → shorten
    expect(result.decision).toBe("shorten");
    expect(result.next_effective_decay_days).toBe(30);
  });

  it("dead-band overrides to no_move when move ratio is below DEAD_BAND_RATIO (already at ceiling)", () => {
    // Pattern already at ceiling 180; 180 * 1.1 = 198 → clamped back to 180.
    // Move ratio = 0 → dead band → no_move.
    const result = calibratePattern({
      pattern: basePattern({
        variance: 0.0005,
        outcome_value: 0.12,
        effective_decay_days: 180,
      }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.decision).toBe("no_move");
    expect(result.next_effective_decay_days).toBe(180);
    expect(result.rationale).toMatch(/ceiling/i);
    // Rationale must not claim a move happened; the attempted direction
    // is surfaced as "Attempted extend suppressed." but the leading
    // narrative is "No move".
    expect(result.rationale).toMatch(/^No move/);
    expect(result.rationale).not.toMatch(/→ extend/);
    expect(result.rationale).not.toMatch(/→ shorten/);
    expect(result.rationale).toMatch(/Attempted extend suppressed/);
  });

  it("dead-band overrides to no_move at the floor when shortening", () => {
    const result = calibratePattern({
      pattern: basePattern({
        variance: 0.05,
        outcome_value: 0.12,
        effective_decay_days: 30,
      }),
      descriptor: descriptor(),
      recent_declining_count: 2,
      now: NOW,
    });
    expect(result.decision).toBe("no_move");
    expect(result.next_effective_decay_days).toBe(30);
    expect(result.rationale).toMatch(/floor/i);
    expect(result.rationale).toMatch(/^No move/);
    expect(result.rationale).not.toMatch(/→ extend/);
    expect(result.rationale).not.toMatch(/→ shorten/);
    expect(result.rationale).toMatch(/Attempted shorten suppressed/);
  });

  it("dead-band overrides to no_move when natural move (no clamp) is below ratio", () => {
    // Effectively impossible with EXTEND_MULTIPLIER=1.1 unless DEAD_BAND_RATIO
    // is raised above (1.1 - 1) = 0.1. With 0.05 the natural move always
    // crosses the band, so this case only fires near clamps. Verify the
    // multiplier and dead band remain consistent by sanity-checking the
    // pinned values themselves.
    expect(Math.abs(EXTEND_MULTIPLIER - 1)).toBeGreaterThan(DEAD_BAND_RATIO);
    expect(Math.abs(1 - SHORTEN_MULTIPLIER)).toBeGreaterThan(DEAD_BAND_RATIO);
  });
});

// ────────────────────────────────────────────────
// Calibration window (declining count)
// ────────────────────────────────────────────────

describe("calibratePattern — window", () => {
  it("exports CALIBRATION_WINDOW_DAYS = 30", () => {
    expect(CALIBRATION_WINDOW_DAYS).toBe(30);
  });

  it("rationale includes the declining count for audit", () => {
    const result = calibratePattern({
      pattern: basePattern({ variance: 0.05, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 3,
      now: NOW,
    });
    expect(result.rationale).toContain("3");
  });
});

// ────────────────────────────────────────────────
// Identity (prior values preserved)
// ────────────────────────────────────────────────

describe("calibratePattern — identity fields", () => {
  it("preserves prior_effective_decay_days and prior_decay_at in the result", () => {
    const priorDecayAt = new Date(
      NOW.getTime() + 100 * 86_400_000,
    ).toISOString();
    const result = calibratePattern({
      pattern: basePattern({
        variance: 0.0005,
        outcome_value: 0.12,
        effective_decay_days: 60,
        decay_at: priorDecayAt,
      }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(result.prior_effective_decay_days).toBe(60);
    expect(result.prior_decay_at).toBe(priorDecayAt);
  });

  it("on no_move and skip, next values equal prior values", () => {
    const skip = calibratePattern({
      pattern: basePattern({ status: "archived" }),
      descriptor: descriptor(),
      recent_declining_count: 0,
      now: NOW,
    });
    expect(skip.next_effective_decay_days).toBe(skip.prior_effective_decay_days);
    expect(skip.next_decay_at).toBe(skip.prior_decay_at);

    const noMove = calibratePattern({
      pattern: basePattern({ variance: 0.0072, outcome_value: 0.12 }),
      descriptor: descriptor(),
      recent_declining_count: 1, // neutral lifecycle so both signals are neutral
      now: NOW,
    });
    expect(noMove.decision).toBe("no_move");
    expect(noMove.next_effective_decay_days).toBe(
      noMove.prior_effective_decay_days,
    );
    expect(noMove.next_decay_at).toBe(noMove.prior_decay_at);
  });
});
