/**
 * Nango webhook signature verification.
 *
 * Nango signs every webhook with HMAC-SHA256 using the secret configured
 * in the Nango dashboard. The signature lands in the
 * `X-Nango-Hmac-Sha256` header; the signing input is the raw request body.
 *
 * Reference: https://docs.nango.dev/implementation-guides/platform/webhooks-from-nango#verify-webhook-signatures
 *
 * Use `crypto.timingSafeEqual` to avoid leaking timing information about
 * mismatched signatures. Reject requests where the secret is unset
 * server-side (boot misconfig) or the header is absent.
 */

import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const NANGO_SIGNATURE_HEADER = "x-nango-hmac-sha256";

/** Signature verification result. Use `ok` for branching, `reason` for logs. */
export interface VerifyNangoSignatureResult {
  ok: boolean;
  reason?:
    | "missing_secret"
    | "missing_signature"
    | "signature_mismatch"
    | "signature_format";
}

/**
 * Verify the HMAC-SHA256 signature on a Nango webhook.
 *
 * @param rawBody The raw HTTP request body as a string (NOT the parsed
 *                JSON). Nango's signing input is byte-exact.
 * @param signatureHeader Value of the `X-Nango-Hmac-Sha256` header.
 *                        Lowercased before lookup is the caller's job;
 *                        Next.js headers are case-insensitive.
 * @param secret The shared NANGO_WEBHOOK_SECRET from the env.
 */
export function verifyNangoSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined
): VerifyNangoSignatureResult {
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }
  if (!signatureHeader) {
    return { ok: false, reason: "missing_signature" };
  }

  // Nango sends the signature as the raw hex digest (no "sha256=" prefix).
  // Accept the bare-hex form but tolerate the "sha256=" prefix in case
  // they ever harmonize with the GitHub-style format.
  const normalized = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  // 64 hex chars = 32 bytes = SHA-256 output. Anything else is a
  // formatting bug and we should reject explicitly.
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return { ok: false, reason: "signature_format" };
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  // Constant-time comparison. timingSafeEqual requires equal-length buffers.
  const a = Buffer.from(normalized.toLowerCase(), "hex");
  const b = Buffer.from(expected.toLowerCase(), "hex");
  if (a.length !== b.length) {
    return { ok: false, reason: "signature_mismatch" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

/**
 * Compute sha256(rawBody) hex. Used by the route to populate
 * `kinetiks_sync_logs.payload_sha256` for replay detection.
 *
 * NOTE: this is NOT the signature. The HMAC depends on the shared
 * secret; this is a content hash with no key. We store it so a Nango
 * retry delivering the same body produces the same hash and we can
 * detect it.
 */
export function payloadSha256(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
