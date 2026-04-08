/**
 * Webhook signature verification for inbound webhooks from apps/id.
 *
 * Mirrors apps/id/src/lib/webhooks/sign.ts. Both sides use HMAC-SHA256
 * over `{timestamp}.{body}` and exchange the result as `sha256={hex}`.
 *
 * The shared secret is read from KINETIKS_WEBHOOK_SECRET. If the env
 * var is not set, verification FAILS CLOSED — every inbound webhook
 * is rejected, defending against the case where the secret is
 * accidentally unset in production.
 *
 * Verification must run BEFORE the request body is parsed as JSON,
 * because JSON.parse can canonicalize whitespace and break the HMAC.
 * Always verify against the raw body string.
 */
import { createHmac, timingSafeEqual } from "crypto";

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/** Reject any payload whose timestamp is older than this. */
const MAX_AGE_MS = 5 * 60 * 1000;

/** Constant-time signature comparison. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function computeSignature(
  secret: string,
  timestamp: string,
  body: string
): string {
  const signingString = `${timestamp}.${body}`;
  const hmac = createHmac("sha256", secret).update(signingString).digest("hex");
  return `sha256=${hmac}`;
}

/**
 * Verify a webhook request. Returns { ok: true } on success, or
 * { ok: false, error, status } on any failure.
 *
 * The caller must:
 *   1. Call this with the RAW body string (not parsed JSON)
 *   2. Reject the request if !ok
 *   3. Only then parse the body as JSON
 */
export function verifyWebhook(opts: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  secret: string | undefined;
  now?: number;
}): VerifyResult {
  const { rawBody, signatureHeader, timestampHeader, secret } = opts;
  const now = opts.now ?? Date.now();

  if (!secret) {
    // Fail closed. Better to break webhooks than to silently accept
    // unverified requests.
    return {
      ok: false,
      error: "Webhook secret is not configured",
      status: 503,
    };
  }

  if (!signatureHeader || !timestampHeader) {
    return {
      ok: false,
      error: "Missing signature or timestamp header",
      status: 401,
    };
  }

  // Reject obviously stale or future-dated payloads (replay defense).
  const ts = Date.parse(timestampHeader);
  if (Number.isNaN(ts)) {
    return { ok: false, error: "Invalid timestamp header", status: 401 };
  }
  if (Math.abs(now - ts) > MAX_AGE_MS) {
    return { ok: false, error: "Timestamp out of allowed window", status: 401 };
  }

  const expected = computeSignature(secret, timestampHeader, rawBody);
  if (!safeEqual(signatureHeader, expected)) {
    return { ok: false, error: "Invalid signature", status: 401 };
  }

  return { ok: true };
}
