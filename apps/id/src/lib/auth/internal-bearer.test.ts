import { describe, expect, it } from "vitest";
import { isValidInternalBearer } from "./internal-bearer";

describe("isValidInternalBearer", () => {
  const secret = "s3cr3t-internal-value-0123456789";

  it("accepts the exact `Bearer <secret>` header", () => {
    expect(isValidInternalBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a null header", () => {
    expect(isValidInternalBearer(null, secret)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(isValidInternalBearer("", secret)).toBe(false);
  });

  it("rejects a header missing the `Bearer ` prefix", () => {
    expect(isValidInternalBearer(secret, secret)).toBe(false);
  });

  it("rejects a wrong secret of the SAME length (exercises the constant-time path)", () => {
    const wrong = "x".repeat(secret.length);
    expect(wrong.length).toBe(secret.length);
    expect(isValidInternalBearer(`Bearer ${wrong}`, secret)).toBe(false);
  });

  it("rejects wrong-length headers without throwing (length guard before timingSafeEqual)", () => {
    expect(isValidInternalBearer(`Bearer ${secret}extra`, secret)).toBe(false);
    expect(isValidInternalBearer("Bearer short", secret)).toBe(false);
  });

  it("rejects a header that differs only in the prefix casing", () => {
    // Same byte length, differs in the leading 'B'/'b'.
    expect(isValidInternalBearer(`bearer ${secret}`, secret)).toBe(false);
  });
});
