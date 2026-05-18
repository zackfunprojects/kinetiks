import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PatternTypeDescriptor } from "@kinetiks/types";
import {
  canonicalize,
  canonicalizeValue,
  computeFingerprint,
  FingerprintError,
} from "../fingerprint";

const descriptor = (
  over: Partial<PatternTypeDescriptor> = {},
): PatternTypeDescriptor => ({
  pattern_type: "test.signature.rate",
  source_app: "test",
  description:
    "A fixture pattern descriptor for the fingerprint unit tests; values are arbitrary.",
  read_apps: ["test"],
  customer_visible: false,
  dimensions_schema: z.object({}).passthrough(),
  fingerprint_dimensions: ["a", "b", "c"],
  outcome_metric: "rate",
  outcome_unit: "ratio_0_1",
  outcome_direction: "higher_is_better",
  decay_bounds: {
    initial_decay_days: 30,
    decay_floor_days: 14,
    decay_ceiling_days: 90,
    calibration_sample_threshold: 10,
  },
  confidence_thresholds: { validate_at: 0.7, decline_at: 0.4 },
  ...over,
});

describe("canonicalizeValue", () => {
  it("collapses undefined and null to null", () => {
    expect(canonicalizeValue(undefined, "x")).toBeNull();
    expect(canonicalizeValue(null, "x")).toBeNull();
  });

  it("preserves strings and booleans", () => {
    expect(canonicalizeValue("hello", "x")).toBe("hello");
    expect(canonicalizeValue(true, "x")).toBe(true);
    expect(canonicalizeValue(false, "x")).toBe(false);
  });

  it("rounds numbers to 4 decimal places", () => {
    expect(canonicalizeValue(0.123456, "x")).toBe(0.1235);
    expect(canonicalizeValue(0.123451, "x")).toBe(0.1235);
    expect(canonicalizeValue(0.123449, "x")).toBe(0.1234);
    expect(canonicalizeValue(1, "x")).toBe(1);
    expect(canonicalizeValue(0, "x")).toBe(0);
    expect(canonicalizeValue(-0.99999, "x")).toBe(-1.0);
  });

  it("throws on NaN or infinity", () => {
    expect(() => canonicalizeValue(NaN, "x")).toThrow(FingerprintError);
    expect(() => canonicalizeValue(Number.POSITIVE_INFINITY, "x")).toThrow(/Non-finite/);
    expect(() => canonicalizeValue(Number.NEGATIVE_INFINITY, "x")).toThrow(/Non-finite/);
  });

  it("preserves array element order (arrays are NOT sorted)", () => {
    expect(canonicalizeValue([3, 1, 2], "x")).toEqual([3, 1, 2]);
    expect(canonicalizeValue(["c", "a", "b"], "x")).toEqual(["c", "a", "b"]);
  });

  it("sorts object keys lexically", () => {
    expect(canonicalizeValue({ b: 1, a: 2, c: 3 }, "x")).toEqual({ a: 2, b: 1, c: 3 });
  });

  it("recurses into nested structures", () => {
    const v = { b: { y: 2, x: 1 }, a: [3, 1, 2] };
    expect(canonicalizeValue(v, "x")).toEqual({
      a: [3, 1, 2],
      b: { x: 1, y: 2 },
    });
  });

  it("rejects unsupported types", () => {
    expect(() => canonicalizeValue(() => "fn", "x")).toThrow(/Unsupported value type/);
    expect(() => canonicalizeValue(Symbol("s"), "x")).toThrow(/Unsupported value type/);
  });
});

describe("canonicalize", () => {
  it("extracts declared fingerprint_dimensions in declared order", () => {
    const out = canonicalize({ c: 3, a: 1, b: 2 }, ["a", "b", "c"]);
    expect(out).toBe(`{"a":1,"b":2,"c":3}`);
  });

  it("collapses missing fingerprint dimensions to null", () => {
    const out = canonicalize({ a: 1 }, ["a", "b"]);
    expect(out).toBe(`{"a":1,"b":null}`);
  });

  it("excludes non-fingerprint dimensions from the canonical string", () => {
    const out = canonicalize(
      { a: 1, b: 2, extra: "ignored", more: { ignored: true } },
      ["a", "b"],
    );
    expect(out).toBe(`{"a":1,"b":2}`);
  });

  it("rejects empty fingerprint_dimensions", () => {
    expect(() => canonicalize({}, [])).toThrow(FingerprintError);
  });

  it("is order-invariant for input dimension keys", () => {
    const a = canonicalize({ a: 1, b: 2, c: 3 }, ["a", "b", "c"]);
    const b = canonicalize({ c: 3, b: 2, a: 1 }, ["a", "b", "c"]);
    expect(a).toBe(b);
  });
});

describe("computeFingerprint", () => {
  it("produces stable 32-char hex digest", () => {
    const { fingerprint } = computeFingerprint(descriptor(), { a: 1, b: 2, c: 3 });
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic across runs", () => {
    const fp1 = computeFingerprint(descriptor(), { a: "x", b: "y", c: "z" }).fingerprint;
    const fp2 = computeFingerprint(descriptor(), { a: "x", b: "y", c: "z" }).fingerprint;
    expect(fp1).toBe(fp2);
  });

  it("differs when identity dimensions differ", () => {
    const fp1 = computeFingerprint(descriptor(), { a: 1, b: 2, c: 3 }).fingerprint;
    const fp2 = computeFingerprint(descriptor(), { a: 1, b: 2, c: 4 }).fingerprint;
    expect(fp1).not.toBe(fp2);
  });

  it("matches when non-identity dimensions differ but identity matches", () => {
    const fp1 = computeFingerprint(descriptor(), { a: 1, b: 2, c: 3, extra: "alpha" }).fingerprint;
    const fp2 = computeFingerprint(descriptor(), { a: 1, b: 2, c: 3, extra: "beta" }).fingerprint;
    expect(fp1).toBe(fp2);
  });

  it("collides on numbers within rounding precision", () => {
    const fp1 = computeFingerprint(descriptor(), { a: 0.123456, b: 2, c: 3 }).fingerprint;
    const fp2 = computeFingerprint(descriptor(), { a: 0.123459, b: 2, c: 3 }).fingerprint;
    expect(fp1).toBe(fp2);
  });

  it("differs on numbers across the rounding boundary", () => {
    const fp1 = computeFingerprint(descriptor(), { a: 0.12344, b: 2, c: 3 }).fingerprint;
    const fp2 = computeFingerprint(descriptor(), { a: 0.12350, b: 2, c: 3 }).fingerprint;
    expect(fp1).not.toBe(fp2);
  });

  it("preserves array element order in fingerprint", () => {
    const fp1 = computeFingerprint(
      descriptor({ fingerprint_dimensions: ["a"] as const }),
      { a: [3, 1, 2] },
    ).fingerprint;
    const fp2 = computeFingerprint(
      descriptor({ fingerprint_dimensions: ["a"] as const }),
      { a: [1, 2, 3] },
    ).fingerprint;
    expect(fp1).not.toBe(fp2);
  });

  it("normalizes nested object key order", () => {
    const fp1 = computeFingerprint(
      descriptor({ fingerprint_dimensions: ["a"] as const }),
      { a: { y: 1, x: 2 } },
    ).fingerprint;
    const fp2 = computeFingerprint(
      descriptor({ fingerprint_dimensions: ["a"] as const }),
      { a: { x: 2, y: 1 } },
    ).fingerprint;
    expect(fp1).toBe(fp2);
  });

  it("applies descriptor.bucketize before fingerprinting", () => {
    const bucketed = descriptor({
      fingerprint_dimensions: ["industry_bucket"] as const,
      bucketize: (raw) => ({
        industry_bucket:
          typeof raw.industry === "string" && raw.industry.includes("saas")
            ? "b2b_saas"
            : "other",
      }),
    });
    const fp1 = computeFingerprint(bucketed, { industry: "b2b sales engagement saas" }).fingerprint;
    const fp2 = computeFingerprint(bucketed, { industry: "vertical saas for legal" }).fingerprint;
    expect(fp1).toBe(fp2);
  });

  it("returns the bucketized dimensions alongside the fingerprint", () => {
    const desc = descriptor({
      fingerprint_dimensions: ["industry_bucket"] as const,
      bucketize: (raw) => ({ industry_bucket: String(raw.industry).toUpperCase() }),
    });
    const { bucketized } = computeFingerprint(desc, { industry: "saas" });
    expect(bucketized).toEqual({ industry_bucket: "SAAS" });
  });

  it("collapses undefined identity dimensions to null deterministically", () => {
    const desc = descriptor({ fingerprint_dimensions: ["a", "b"] as const });
    const fp1 = computeFingerprint(desc, { a: 1, b: undefined }).fingerprint;
    const fp2 = computeFingerprint(desc, { a: 1 }).fingerprint;
    const fp3 = computeFingerprint(desc, { a: 1, b: null }).fingerprint;
    expect(fp1).toBe(fp2);
    expect(fp1).toBe(fp3);
  });
});
