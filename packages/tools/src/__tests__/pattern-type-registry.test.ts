import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PatternTypeDescriptor } from "@kinetiks/types";
import {
  _resetPatternTypeRegistryForTests,
  assertPatternType,
  definePatternType,
  getPatternType,
  listCustomerVisiblePatternTypes,
  listPatternTypes,
  listPatternTypesForEmittingApp,
  listPatternTypesForReadingApp,
  registerPatternType,
} from "../index";

afterEach(() => {
  _resetPatternTypeRegistryForTests();
  vi.restoreAllMocks();
});

const validDescriptor = (): PatternTypeDescriptor => ({
  pattern_type: "harvest.outreach_angle_performance.reply_rate",
  source_app: "harvest",
  description:
    "Outreach angle x industry-bucket x seniority-tier signature mapped to reply rate.",
  read_apps: ["marcus", "oracle", "harvest"],
  customer_visible: true,
  dimensions_schema: z.object({
    angle_kind: z.string(),
    industry_bucket: z.string(),
    seniority_tier: z.string(),
  }),
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
  confidence_thresholds: { validate_at: 0.7, decline_at: 0.4 },
  expected_max_fingerprints_per_account: 200,
});

describe("definePatternType helper", () => {
  it("returns the descriptor untouched (sugar for inference)", () => {
    const d = definePatternType(validDescriptor());
    expect(d.pattern_type).toBe("harvest.outreach_angle_performance.reply_rate");
  });
});

describe("pattern type registry", () => {
  it("registers and looks up a pattern type", () => {
    registerPatternType(validDescriptor());
    const got = getPatternType("harvest.outreach_angle_performance.reply_rate");
    expect(got).toBeDefined();
    expect(got?.customer_visible).toBe(true);
  });

  it("assertPatternType throws missing_pattern_type on unknown", () => {
    expect(() => assertPatternType("harvest.does_not_exist")).toThrow(
      /Unknown pattern type/,
    );
  });

  it("is idempotent on identical re-registration", () => {
    registerPatternType(validDescriptor());
    registerPatternType(validDescriptor());
    expect(listPatternTypes()).toHaveLength(1);
  });

  it("throws on conflicting re-registration", () => {
    registerPatternType(validDescriptor());
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        description:
          "A completely different description for the same key to force a conflict.",
      }),
    ).toThrow(/conflicting/);
  });

  it("rejects pattern_type without app.snake_case shape", () => {
    expect(() =>
      registerPatternType({ ...validDescriptor(), pattern_type: "BadShape" }),
    ).toThrow(/<app>\.<snake_case_segment>/);
  });

  it("rejects pattern_type whose prefix does not match source_app", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        pattern_type: "dark_madder.content_resonance.engagement",
        source_app: "harvest",
        dimensions_schema: z.object({ a: z.string() }),
        fingerprint_dimensions: ["a"],
      }),
    ).toThrow(/prefix "dark_madder" must equal source_app "harvest"/);
  });

  it("rejects empty read_apps", () => {
    expect(() =>
      registerPatternType({ ...validDescriptor(), read_apps: [] }),
    ).toThrow(/at least one read_app/);
  });

  it("rejects missing customer_visible boolean", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        customer_visible: undefined as unknown as boolean,
      }),
    ).toThrow(/customer_visible as boolean/);
  });

  it("rejects empty fingerprint_dimensions", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        fingerprint_dimensions: [],
      }),
    ).toThrow(/at least one fingerprint_dimensions field/);
  });

  it("rejects duplicate fingerprint_dimensions", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        fingerprint_dimensions: ["angle_kind", "angle_kind"] as unknown as Array<
          keyof { angle_kind: string }
        >,
      }),
    ).toThrow(/fingerprint_dimensions must be unique/);
  });

  it("rejects bucketize that is not a function", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        bucketize: "not_a_function" as unknown as undefined,
      }),
    ).toThrow(/bucketize must be a function/);
  });

  it("rejects empty outcome_metric", () => {
    expect(() =>
      registerPatternType({ ...validDescriptor(), outcome_metric: "" }),
    ).toThrow(/non-empty outcome_metric/);
  });

  it("rejects empty outcome_unit", () => {
    expect(() =>
      registerPatternType({ ...validDescriptor(), outcome_unit: "" }),
    ).toThrow(/non-empty outcome_unit/);
  });

  it("rejects outcome_direction outside the closed enum", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        outcome_direction: "sideways" as unknown as "higher_is_better",
      }),
    ).toThrow(/outcome_direction must be 'higher_is_better' or 'lower_is_better'/);
  });

  it("rejects decay_bounds where floor > initial", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        decay_bounds: {
          initial_decay_days: 30,
          decay_floor_days: 60,
          decay_ceiling_days: 180,
          calibration_sample_threshold: 10,
        },
      }),
    ).toThrow(/floor <= initial <= ceiling/);
  });

  it("rejects decay_bounds where initial > ceiling", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        decay_bounds: {
          initial_decay_days: 200,
          decay_floor_days: 30,
          decay_ceiling_days: 180,
          calibration_sample_threshold: 10,
        },
      }),
    ).toThrow(/floor <= initial <= ceiling/);
  });

  it("rejects decay_bounds with zero/negative day counts", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        decay_bounds: {
          initial_decay_days: 0,
          decay_floor_days: 0,
          decay_ceiling_days: 0,
          calibration_sample_threshold: 0,
        },
      }),
    ).toThrow(/positive day counts/);
  });

  it("rejects validate_at <= decline_at", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        confidence_thresholds: { validate_at: 0.5, decline_at: 0.5 },
      }),
    ).toThrow(/validate_at must be strictly greater than decline_at/);
  });

  it("rejects confidence_thresholds outside [0,1]", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        confidence_thresholds: { validate_at: 1.1, decline_at: 0.4 },
      }),
    ).toThrow(/confidence_thresholds must be numbers in \[0,1\]/);
  });

  it("rejects expected_max_fingerprints_per_account above hard ceiling", () => {
    expect(() =>
      registerPatternType({
        ...validDescriptor(),
        expected_max_fingerprints_per_account: 200_000,
      }),
    ).toThrow(/exceeds the hard ceiling/);
  });

  it("warns when expected_max_fingerprints_per_account is absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d: PatternTypeDescriptor = {
      ...validDescriptor(),
      expected_max_fingerprints_per_account: undefined,
    };
    registerPatternType(d);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("did not declare expected_max_fingerprints_per_account"),
    );
  });

  it("warns when expected_max_fingerprints_per_account is above soft ceiling", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerPatternType({
      ...validDescriptor(),
      expected_max_fingerprints_per_account: 5_000,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("above the soft ceiling"));
  });

  it("filters by source app", () => {
    registerPatternType(validDescriptor());
    registerPatternType({
      ...validDescriptor(),
      pattern_type: "harvest.sequence_step_conversion.open_rate",
      dimensions_schema: z.object({ step: z.number() }),
      fingerprint_dimensions: ["step"],
    });
    expect(listPatternTypesForEmittingApp("harvest")).toHaveLength(2);
    expect(listPatternTypesForEmittingApp("dark_madder")).toHaveLength(0);
  });

  it("filters by reading app", () => {
    registerPatternType(validDescriptor());
    registerPatternType({
      ...validDescriptor(),
      pattern_type: "harvest.sequence_step_conversion.open_rate",
      dimensions_schema: z.object({ step: z.number() }),
      fingerprint_dimensions: ["step"],
      read_apps: ["marcus"],
    });
    expect(listPatternTypesForReadingApp("marcus")).toHaveLength(2);
    expect(listPatternTypesForReadingApp("oracle")).toHaveLength(1);
    expect(listPatternTypesForReadingApp("harvest")).toHaveLength(1);
  });

  it("filters customer-visible types", () => {
    registerPatternType(validDescriptor());
    registerPatternType({
      ...validDescriptor(),
      pattern_type: "harvest.sequence_step_conversion.open_rate",
      dimensions_schema: z.object({ step: z.number() }),
      fingerprint_dimensions: ["step"],
      customer_visible: false,
    });
    const visible = listCustomerVisiblePatternTypes();
    expect(visible).toHaveLength(1);
    expect(visible[0]?.pattern_type).toBe("harvest.outreach_angle_performance.reply_rate");
  });
});
