/**
 * Tests for the Nango webhook signature verification helpers.
 *
 * The actual route's behavior (resolving the connection, replay detection,
 * dispatching to the handler) is covered by the integration test in
 * Slice 5; here we lock down the HMAC math + payload hashing primitives.
 */

import { createHmac, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  NANGO_SIGNATURE_HEADER,
  payloadSha256,
  verifyNangoSignature,
} from "../webhook-verify";

const SECRET = "test-secret-DO-NOT-USE-IN-PROD";
const SAMPLE_BODY = JSON.stringify({
  type: "sync",
  connectionId: "conn_123",
  providerConfigKey: "google-analytics",
  syncName: "ga4-daily-metrics",
  success: true,
});

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("NANGO_SIGNATURE_HEADER", () => {
  it("is the lowercase header name Nango sends", () => {
    expect(NANGO_SIGNATURE_HEADER).toBe("x-nango-hmac-sha256");
  });
});

describe("verifyNangoSignature", () => {
  it("accepts a correct HMAC", () => {
    const sig = sign(SECRET, SAMPLE_BODY);
    const result = verifyNangoSignature(SAMPLE_BODY, sig, SECRET);
    expect(result).toEqual({ ok: true });
  });

  it("tolerates a `sha256=` prefix", () => {
    const sig = `sha256=${sign(SECRET, SAMPLE_BODY)}`;
    const result = verifyNangoSignature(SAMPLE_BODY, sig, SECRET);
    expect(result).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const sig = sign(SECRET, SAMPLE_BODY);
    const tampered = SAMPLE_BODY.replace('"success":true', '"success":false');
    const result = verifyNangoSignature(tampered, sig, SECRET);
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature signed with the wrong secret", () => {
    const sig = sign("wrong-secret", SAMPLE_BODY);
    const result = verifyNangoSignature(SAMPLE_BODY, sig, SECRET);
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects when the secret is missing on our side", () => {
    const sig = sign(SECRET, SAMPLE_BODY);
    expect(verifyNangoSignature(SAMPLE_BODY, sig, null)).toEqual({
      ok: false,
      reason: "missing_secret",
    });
    expect(verifyNangoSignature(SAMPLE_BODY, sig, "")).toEqual({
      ok: false,
      reason: "missing_secret",
    });
    expect(verifyNangoSignature(SAMPLE_BODY, sig, undefined)).toEqual({
      ok: false,
      reason: "missing_secret",
    });
  });

  it("rejects when the signature header is absent", () => {
    expect(verifyNangoSignature(SAMPLE_BODY, null, SECRET)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
    expect(verifyNangoSignature(SAMPLE_BODY, undefined, SECRET)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
    expect(verifyNangoSignature(SAMPLE_BODY, "", SECRET)).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("rejects signatures that are not 64 hex characters", () => {
    expect(verifyNangoSignature(SAMPLE_BODY, "not-hex", SECRET)).toEqual({
      ok: false,
      reason: "signature_format",
    });
    expect(verifyNangoSignature(SAMPLE_BODY, "abc123", SECRET)).toEqual({
      ok: false,
      reason: "signature_format",
    });
    expect(verifyNangoSignature(SAMPLE_BODY, "g".repeat(64), SECRET)).toEqual({
      ok: false,
      reason: "signature_format",
    });
  });

  it("is case-insensitive on the hex digest", () => {
    const sig = sign(SECRET, SAMPLE_BODY).toUpperCase();
    expect(verifyNangoSignature(SAMPLE_BODY, sig, SECRET)).toEqual({ ok: true });
  });
});

describe("payloadSha256", () => {
  it("computes the bare sha256 (NOT keyed HMAC)", () => {
    const expected = createHash("sha256").update(SAMPLE_BODY).digest("hex");
    expect(payloadSha256(SAMPLE_BODY)).toBe(expected);
  });

  it("is stable across calls with the same input", () => {
    expect(payloadSha256(SAMPLE_BODY)).toBe(payloadSha256(SAMPLE_BODY));
  });

  it("differs for tampered bodies", () => {
    const tampered = SAMPLE_BODY + " ";
    expect(payloadSha256(SAMPLE_BODY)).not.toBe(payloadSha256(tampered));
  });

  it("returns 64 hex characters", () => {
    expect(payloadSha256("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
