import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { SLACK_REPLAY_WINDOW_SECONDS, verifySlackSignature } from "../verify";

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const NOW_MS = 1_781_300_000_000;

function sign(rawBody: string, timestamp: number): string {
  return `v0=${createHmac("sha256", SECRET)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
}

describe("verifySlackSignature", () => {
  const body = JSON.stringify({ type: "event_callback", event: {} });
  const freshTs = Math.floor(NOW_MS / 1000) - 5;

  it("accepts a valid, fresh signature", () => {
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(freshTs),
        signatureHeader: sign(body, freshTs),
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects missing headers", () => {
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: null,
        signatureHeader: sign(body, freshTs),
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "missing_headers" });
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(freshTs),
        signatureHeader: null,
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects replays older than the 5-minute window", () => {
    const staleTs = Math.floor(NOW_MS / 1000) - SLACK_REPLAY_WINDOW_SECONDS - 1;
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(staleTs),
        signatureHeader: sign(body, staleTs),
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects future-skewed timestamps (forged clock)", () => {
    const futureTs = Math.floor(NOW_MS / 1000) + SLACK_REPLAY_WINDOW_SECONDS + 10;
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(futureTs),
        signatureHeader: sign(body, futureTs),
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects non-numeric timestamps", () => {
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: "not-a-number",
        signatureHeader: sign(body, freshTs),
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("rejects a signature over different bytes", () => {
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(freshTs),
        signatureHeader: sign(`${body} `, freshTs),
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature minted with the wrong secret", () => {
    const wrong = `v0=${createHmac("sha256", "other-secret")
      .update(`v0:${freshTs}:${body}`)
      .digest("hex")}`;
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(freshTs),
        signatureHeader: wrong,
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects length-mismatched signature strings without throwing", () => {
    expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestampHeader: String(freshTs),
        signatureHeader: "v0=tooshort",
        rawBody: body,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: "signature_mismatch" });
  });
});
