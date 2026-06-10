import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an Authorization header against `Bearer <secret>`.
 *
 * Length-guarded (timingSafeEqual throws on unequal-length buffers), so a
 * missing or wrong-length header returns false without leaking timing. Use on
 * internal-service routes guarded by INTERNAL_SERVICE_SECRET, matching the
 * timing-safe posture of resolveAuth's internal-secret branch. A plain
 * `header !== \`Bearer ${secret}\`` comparison short-circuits on the first
 * differing byte and is a timing side-channel on a shared secret.
 */
export function isValidInternalBearer(
  authHeader: string | null,
  secret: string,
): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
