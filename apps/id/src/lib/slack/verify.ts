/**
 * Slack request signature verification — Phase D3.
 *
 * Implements Slack's signing-secret scheme exactly
 * (https://api.slack.com/authentication/verifying-requests-from-slack):
 *
 *   base   = "v0:" + timestamp + ":" + rawBody
 *   sig    = "v0=" + hex(HMAC_SHA256(signingSecret, base))
 *
 * plus the 5-minute replay window CLAUDE.md mandates: requests whose
 * `x-slack-request-timestamp` is more than 300 seconds from now — in
 * EITHER direction (replayed old requests and forged future ones) —
 * are rejected before any HMAC work.
 *
 * The comparison is constant-time (timingSafeEqual on equal-length
 * buffers). Verification runs on the RAW request body bytes; parsing
 * happens only after the signature holds.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const SLACK_REPLAY_WINDOW_SECONDS = 300;

export type SlackVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_headers" | "stale_timestamp" | "signature_mismatch";
    };

export function verifySlackSignature(args: {
  signingSecret: string;
  /** Value of `x-slack-request-timestamp` (unix seconds, as string). */
  timestampHeader: string | null;
  /** Value of `x-slack-signature` ("v0=..."). */
  signatureHeader: string | null;
  /** The raw request body, exactly as received. */
  rawBody: string;
  /** Injection point for tests; defaults to Date.now(). */
  nowMs?: number;
}): SlackVerifyResult {
  const { timestampHeader, signatureHeader } = args;
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const nowSeconds = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > SLACK_REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = `v0=${createHmac("sha256", args.signingSecret)
    .update(`v0:${timestampHeader}:${args.rawBody}`)
    .digest("hex")}`;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}
