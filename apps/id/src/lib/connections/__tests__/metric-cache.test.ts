import { describe, expect, it } from "vitest";
import {
  cacheStatus,
  computeLockKey,
  isFresh,
  normalizeInput,
  type MetricCacheRow,
} from "../metric-cache";

describe("normalizeInput", () => {
  it("produces a deterministic hash regardless of key order", () => {
    const a = normalizeInput({
      metric: "ga4_sessions",
      date_range: "last_7_days",
      dimensions: ["country", "device"],
    });
    const b = normalizeInput({
      dimensions: ["country", "device"],
      date_range: "last_7_days",
      metric: "ga4_sessions",
    });

    expect(a.hash).toBe(b.hash);
    expect(a.canonical).toEqual(b.canonical);
  });

  it("preserves array order (semantically significant)", () => {
    const a = normalizeInput({ dimensions: ["country", "device"] });
    const b = normalizeInput({ dimensions: ["device", "country"] });
    expect(a.hash).not.toBe(b.hash);
  });

  it("strips undefined fields", () => {
    const a = normalizeInput({
      metric: "ga4_sessions",
      compare_to: undefined,
    });
    const b = normalizeInput({ metric: "ga4_sessions" });
    expect(a.hash).toBe(b.hash);
  });

  it("preserves null fields (distinct from undefined)", () => {
    const a = normalizeInput({
      metric: "ga4_sessions",
      compare_to: null,
    });
    const b = normalizeInput({ metric: "ga4_sessions" });
    expect(a.hash).not.toBe(b.hash);
  });

  it("recursively canonicalizes nested objects", () => {
    const a = normalizeInput({
      filters: { source: "google", medium: "organic" },
    });
    const b = normalizeInput({
      filters: { medium: "organic", source: "google" },
    });
    expect(a.hash).toBe(b.hash);
  });

  it("produces a 64-char hex sha256 digest", () => {
    const { hash } = normalizeInput({ metric: "ga4_sessions" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different metric values", () => {
    const a = normalizeInput({ metric: "ga4_sessions" });
    const b = normalizeInput({ metric: "ga4_users" });
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("cacheStatus / isFresh", () => {
  function row(overrides: Partial<MetricCacheRow> = {}): MetricCacheRow {
    const base: MetricCacheRow = {
      id: "row-1",
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "h",
      input: {},
      response: {},
      refreshed_at: new Date().toISOString(),
      stale_after_seconds: 900,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      provider_etag: null,
      error_state: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { ...base, ...overrides };
  }

  it("returns null for null row (miss)", () => {
    expect(cacheStatus(null)).toBeNull();
  });

  it("returns 'fresh' when expires_at is in the future", () => {
    expect(
      cacheStatus(
        row({ expires_at: new Date(Date.now() + 60_000).toISOString() })
      )
    ).toBe("fresh");
  });

  it("returns 'stale_revalidating' when expires_at has passed", () => {
    expect(
      cacheStatus(
        row({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      )
    ).toBe("stale_revalidating");
  });

  it("isFresh agrees with cacheStatus", () => {
    const fresh = row({ expires_at: new Date(Date.now() + 1_000).toISOString() });
    const stale = row({ expires_at: new Date(Date.now() - 1_000).toISOString() });
    expect(isFresh(fresh)).toBe(true);
    expect(isFresh(stale)).toBe(false);
  });
});

describe("computeLockKey", () => {
  it("is deterministic for the same key", () => {
    const key = {
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "abc123",
    };
    expect(computeLockKey(key)).toBe(computeLockKey(key));
  });

  it("differs by source", () => {
    const k1 = computeLockKey({
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "abc123",
    });
    const k2 = computeLockKey({
      account_id: "acc-1",
      source: "stripe",
      normalized_input_hash: "abc123",
    });
    expect(k1).not.toBe(k2);
  });

  it("differs by normalized_input_hash", () => {
    const k1 = computeLockKey({
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "abc123",
    });
    const k2 = computeLockKey({
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "def456",
    });
    expect(k1).not.toBe(k2);
  });

  it("returns a parseable bigint string", () => {
    const k = computeLockKey({
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "abc",
    });
    expect(() => BigInt(k)).not.toThrow();
  });
});
