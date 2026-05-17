/**
 * Deterministic fingerprint of a pattern's identity-relevant
 * dimensions, per the 2027 addendum §1.4.
 *
 * Identity = SHA-256(canonical_json(extract(bucketized_dimensions,
 * descriptor.fingerprint_dimensions))). First 32 hex characters of the
 * digest are the fingerprint string stored on the row.
 *
 * The hash is server-computed only. Clients pass raw dimensions; the
 * server applies bucketize (when declared), validates against the
 * descriptor's Zod schema, then fingerprints. Two implementations
 * across client and server would drift; one implementation is the only
 * safe posture.
 *
 * Canonicalization rules (applied recursively):
 *   - undefined and null collapse to null
 *   - numbers round to 4 decimal places (so 0.123456 and 0.123459 collide)
 *   - NaN and infinities throw; the caller has a non-finite metric/dimension
 *   - strings as-is
 *   - booleans as-is
 *   - arrays canonicalize element-wise (NO sort; array order is part of identity)
 *   - objects sort keys lexically; values recurse
 *
 * Serialization: standard JSON.stringify on the canonical value. The
 * key-sorted object shape and the value normalization above make the
 * stringify output stable across input orderings.
 */

import { createHash } from "node:crypto";
import type { PatternTypeDescriptor } from "@kinetiks/types";

/** Number of hex characters of the SHA-256 digest used as the fingerprint. */
const FINGERPRINT_HEX_LENGTH = 32;

/** Decimal precision applied to numeric dimensions. 4 = 0.0001 granularity. */
const NUMBER_PRECISION_DECIMALS = 4;

export class FingerprintError extends Error {
  readonly code: "non_finite_number" | "unsupported_value" | "missing_field";
  readonly context: Record<string, string | number>;

  constructor(
    code: FingerprintError["code"],
    message: string,
    context: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = "FingerprintError";
    this.code = code;
    this.context = context;
  }
}

/**
 * Canonicalize a single value per the rules in the file header.
 * Throws FingerprintError on non-finite numbers or unsupported types.
 */
export function canonicalizeValue(
  value: unknown,
  path: string,
): unknown {
  if (value === undefined || value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number": {
      if (!Number.isFinite(value)) {
        throw new FingerprintError(
          "non_finite_number",
          `Non-finite number at "${path}": ${String(value)}`,
          { path, value: String(value) },
        );
      }
      // Round to fixed precision. Use Math.round to a scaled integer to
      // avoid floating-point representation drift across emissions.
      const scale = Math.pow(10, NUMBER_PRECISION_DECIMALS);
      return Math.round(value * scale) / scale;
    }
    case "object": {
      if (Array.isArray(value)) {
        return value.map((v, i) => canonicalizeValue(v, `${path}[${i}]`));
      }
      const obj = value as Record<string, unknown>;
      const sortedKeys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        out[k] = canonicalizeValue(obj[k], `${path}.${k}`);
      }
      return out;
    }
    default:
      throw new FingerprintError(
        "unsupported_value",
        `Unsupported value type at "${path}": ${typeof value}`,
        { path, type: typeof value },
      );
  }
}

/**
 * Extract the descriptor's `fingerprint_dimensions` from the bucketized
 * dimensions, in declared order, canonicalize, and serialize. A field
 * declared in `fingerprint_dimensions` that is absent (undefined) in
 * the dimensions object collapses to null - keeping the fingerprint
 * defined even for optional identity dimensions.
 *
 * Fields NOT in `fingerprint_dimensions` are excluded from identity
 * entirely. They ride along in `dimensions` for the customer's record
 * but do not affect the fingerprint.
 */
export function canonicalize(
  dimensions: Record<string, unknown>,
  fingerprintDimensions: ReadonlyArray<string>,
): string {
  if (fingerprintDimensions.length === 0) {
    throw new FingerprintError(
      "missing_field",
      "fingerprint_dimensions must not be empty (descriptor invariant)",
    );
  }
  // Preserve declared order. Identity is the tuple in declared order.
  const canonical: Record<string, unknown> = {};
  for (const key of fingerprintDimensions) {
    canonical[key] = canonicalizeValue(dimensions[key], key);
  }
  // JSON.stringify on a literal map preserves insertion order, but we
  // explicitly write the keys in declared order (the loop above) so the
  // output is stable regardless of dimensions' input key order.
  return stableStringify(canonical, fingerprintDimensions);
}

/**
 * Stringify in declared-order: the top-level keys come out in
 * `fingerprintDimensions` order. Nested values are already
 * canonicalized with sorted keys (see canonicalizeValue).
 */
function stableStringify(
  canonical: Record<string, unknown>,
  declaredOrder: ReadonlyArray<string>,
): string {
  const parts: string[] = [];
  for (const key of declaredOrder) {
    parts.push(`${JSON.stringify(key)}:${JSON.stringify(canonical[key])}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * Compute the fingerprint for an emission.
 *
 *   1. Apply `descriptor.bucketize` to the raw dimensions (no-op if
 *      not declared).
 *   2. Canonicalize the bucketized dimensions through the declared
 *      `fingerprint_dimensions`.
 *   3. SHA-256, take the first 32 hex characters.
 *
 * Callers should have already validated the bucketized dimensions
 * against `descriptor.dimensions_schema` before invoking this. The
 * fingerprint function does not re-validate.
 */
export function computeFingerprint(
  descriptor: PatternTypeDescriptor,
  rawDimensions: Record<string, unknown>,
): { fingerprint: string; bucketized: Record<string, unknown> } {
  const bucketized = descriptor.bucketize
    ? descriptor.bucketize(rawDimensions as never)
    : rawDimensions;
  const canonicalString = canonicalize(
    bucketized,
    descriptor.fingerprint_dimensions.map(String),
  );
  const fingerprint = createHash("sha256")
    .update(canonicalString)
    .digest("hex")
    .slice(0, FINGERPRINT_HEX_LENGTH);
  return { fingerprint, bucketized };
}
