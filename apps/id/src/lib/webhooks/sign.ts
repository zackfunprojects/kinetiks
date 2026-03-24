import { createHmac } from "crypto";

/**
 * Sign a webhook payload with HMAC-SHA256.
 * Signature format: sha256={hex_digest}
 * Signing string: {timestamp}.{body}
 */
export function signPayload(
  secret: string,
  timestamp: string,
  body: string
): string {
  const signingString = `${timestamp}.${body}`;
  const hmac = createHmac("sha256", secret).update(signingString).digest("hex");
  return `sha256=${hmac}`;
}
