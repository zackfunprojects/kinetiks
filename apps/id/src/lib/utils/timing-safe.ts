import { timingSafeEqual } from "crypto";

/**
 * Timing-safe string comparison to prevent timing attacks on secret values.
 * Returns false if lengths differ (without leaking which chars matched).
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return timingSafeEqual(bufA, bufB);
}
