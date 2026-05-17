import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { hashEmail, hashPhone, pickSafeAddress, urlDomain } from "../pii";

describe("hashEmail", () => {
  it("normalizes case and trims before hashing", () => {
    const expected = createHash("sha256").update("user@example.com").digest("hex");
    expect(hashEmail("USER@example.com")).toBe(expected);
    expect(hashEmail("  user@example.com  ")).toBe(expected);
    expect(hashEmail("User@Example.COM")).toBe(expected);
  });

  it("returns null on empty / nullish input", () => {
    expect(hashEmail(null)).toBeNull();
    expect(hashEmail(undefined)).toBeNull();
    expect(hashEmail("")).toBeNull();
    expect(hashEmail("   ")).toBeNull();
  });

  it("returns a 64-char hex string", () => {
    expect(hashEmail("a@b.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashPhone", () => {
  it("digits-only normalization collapses formatting", () => {
    const expected = createHash("sha256").update("14155551212").digest("hex");
    expect(hashPhone("+1 (415) 555-1212")).toBe(expected);
    expect(hashPhone("1.415.555.1212")).toBe(expected);
    expect(hashPhone("+14155551212")).toBe(expected);
  });

  it("returns null when no digits remain", () => {
    expect(hashPhone(null)).toBeNull();
    expect(hashPhone("")).toBeNull();
    expect(hashPhone("---")).toBeNull();
  });
});

describe("urlDomain", () => {
  it("returns the host for a full URL", () => {
    expect(urlDomain("https://example.com/about?utm=x")).toBe("example.com");
    expect(urlDomain("HTTP://EXAMPLE.COM")).toBe("example.com");
  });

  it("prepends https:// when the input lacks a protocol", () => {
    expect(urlDomain("example.com/path")).toBe("example.com");
    expect(urlDomain("sub.example.com")).toBe("sub.example.com");
  });

  it("returns null on parse failure", () => {
    expect(urlDomain(null)).toBeNull();
    expect(urlDomain("")).toBeNull();
    // Pure garbage like "http://" alone fails URL parsing
    expect(urlDomain("http://")).toBeNull();
  });
});

describe("pickSafeAddress", () => {
  it("keeps only city / state / country", () => {
    expect(
      pickSafeAddress({
        city: "Brooklyn",
        state: "NY",
        country: "US",
        street: "123 Main",
        postal_code: "11201",
      })
    ).toEqual({ city: "Brooklyn", state: "NY", country: "US" });
  });

  it("returns an empty object for missing input", () => {
    expect(pickSafeAddress(null)).toEqual({});
    expect(pickSafeAddress(undefined)).toEqual({});
    expect(pickSafeAddress({})).toEqual({});
  });

  it("ignores non-string field values", () => {
    expect(
      pickSafeAddress({
        city: 12345,
        state: null,
        country: { iso: "US" } as unknown as string,
      } as unknown as Record<string, unknown>)
    ).toEqual({});
  });
});
