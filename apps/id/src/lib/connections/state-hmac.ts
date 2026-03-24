/**
 * HMAC-SHA256 signing and verification for OAuth state blobs.
 *
 * Prevents tampering with the state parameter (e.g., swapping account_id)
 * during the OAuth redirect flow. Uses KINETIKS_ENCRYPTION_KEY as the
 * HMAC secret.
 */

import { createHmac, timingSafeEqual } from "crypto";

function getHmacKey(): string {
  const key = process.env.KINETIKS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "KINETIKS_ENCRYPTION_KEY is not set. Cannot sign OAuth state."
    );
  }
  return key;
}

/**
 * Compute an HMAC-SHA256 over the given data string, returned as base64url.
 */
export function signState(data: string): string {
  const hmac = createHmac("sha256", getHmacKey());
  hmac.update(data);
  return hmac.digest("base64url");
}

/**
 * Verify an HMAC-SHA256 signature using constant-time comparison.
 * Returns true if the signature is valid.
 */
export function verifyStateSignature(
  data: string,
  signature: string
): boolean {
  const expected = signState(data);

  // Constant-time compare to prevent timing attacks
  const sigBuf = Buffer.from(signature, "base64url");
  const expectedBuf = Buffer.from(expected, "base64url");

  if (sigBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expectedBuf);
}
