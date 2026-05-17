import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock every collaborator so we exercise the tool's branching logic without
// hitting Supabase, GA4, or anything else network-y.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ __admin: true })),
}));

vi.mock("@/lib/connections/manager", () => ({
  getConnectionByProvider: vi.fn(),
}));

vi.mock("@/lib/connections/metric-cache", () => ({
  cacheStatus: vi.fn(),
  getCachedMetric: vi.fn(),
  isFresh: vi.fn(),
  normalizeInput: vi.fn(() => ({ canonical: {}, hash: "test-hash" })),
  withRefreshLock: vi.fn(),
  writeCachedMetric: vi.fn(),
}));

vi.mock("@/lib/connections/refresh-token", () => ({
  withFreshToken: vi.fn(),
}));

vi.mock("@/lib/connections/extractors/ga4", () => ({
  createGa4Client: vi.fn(),
  getStaleAfterSeconds: vi.fn(() => 900),
  runGa4Query: vi.fn(),
}));

import { ga4QueryTool } from "../ga4-query";
import { getConnectionByProvider } from "@/lib/connections/manager";
import {
  getCachedMetric,
  isFresh,
  withRefreshLock,
  writeCachedMetric,
} from "@/lib/connections/metric-cache";
import { withFreshToken } from "@/lib/connections/refresh-token";
import { runGa4Query, createGa4Client } from "@/lib/connections/extractors/ga4";

const mockGetConnection = vi.mocked(getConnectionByProvider);
const mockGetCached = vi.mocked(getCachedMetric);
const mockIsFresh = vi.mocked(isFresh);
const mockWithLock = vi.mocked(withRefreshLock);
const mockWriteCached = vi.mocked(writeCachedMetric);
const mockWithFreshToken = vi.mocked(withFreshToken);
const mockRunGa4Query = vi.mocked(runGa4Query);
const mockCreateGa4Client = vi.mocked(createGa4Client);

const ctx = {
  accountId: "acc-1",
  agentRunId: "run-1",
  threadId: "thread-1",
} as Parameters<typeof ga4QueryTool.execute>[1];

const validInput = {
  metric: "ga4_sessions" as const,
  date_range: "last_7_days" as const,
};

const okGa4Response = () => ({
  rows: [{ dimensions: {} as Record<string, string>, value: 1234 }],
  metric: "ga4_sessions" as const,
  metric_unit: "count" as const,
  date_range: { start: "7daysAgo", end: "today" },
  property_id: "p-1",
});

beforeEach(() => {
  mockGetConnection.mockReset();
  mockGetCached.mockReset();
  mockIsFresh.mockReset();
  mockWithLock.mockReset();
  mockWriteCached.mockReset();
  mockWithFreshToken.mockReset();
  mockRunGa4Query.mockReset();
  mockCreateGa4Client.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ga4_query descriptor", () => {
  it("is registered as a non-consequential tool with always availability", () => {
    expect(ga4QueryTool.name).toBe("ga4_query");
    expect(ga4QueryTool.isConsequential).toBe(false);
    expect(ga4QueryTool.availability).toEqual({ kind: "always" });
    // Non-consequential tools omit actionClass (undefined) per the F1 spec.
    expect(ga4QueryTool.actionClass).toBeUndefined();
  });

  it("description is descriptive enough for an LLM tool-router (>120 chars)", () => {
    expect(ga4QueryTool.description.length).toBeGreaterThan(120);
  });
});

describe("ga4_query input schema", () => {
  it("accepts a valid sessions query", () => {
    expect(ga4QueryTool.inputSchema.parse(validInput)).toBeDefined();
  });

  it("rejects an unknown metric", () => {
    expect(() =>
      ga4QueryTool.inputSchema.parse({
        metric: "ga4_random",
        date_range: "last_7_days",
      })
    ).toThrow();
  });

  it("rejects an unknown dimension", () => {
    expect(() =>
      ga4QueryTool.inputSchema.parse({
        metric: "ga4_sessions",
        date_range: "last_7_days",
        dimensions: ["browser"],
      })
    ).toThrow();
  });

  it("requires start/end when date_range is custom", () => {
    expect(() =>
      ga4QueryTool.inputSchema.parse({
        metric: "ga4_sessions",
        date_range: "custom",
      })
    ).toThrow(/start_date and end_date/);
  });

  it("accepts up to 3 dimensions", () => {
    expect(() =>
      ga4QueryTool.inputSchema.parse({
        metric: "ga4_sessions",
        date_range: "last_7_days",
        dimensions: ["country", "device", "source"],
      })
    ).not.toThrow();
  });

  it("rejects 4+ dimensions", () => {
    expect(() =>
      ga4QueryTool.inputSchema.parse({
        metric: "ga4_sessions",
        date_range: "last_7_days",
        dimensions: ["country", "device", "source", "medium"],
      })
    ).toThrow();
  });
});

describe("ga4_query - not_connected branch", () => {
  it("returns not_connected when no GA4 connection exists", async () => {
    mockGetConnection.mockResolvedValue(null);

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("not_connected");
    if (result.status === "not_connected") {
      expect(result.connect_url).toContain("/connections");
    }
  });

  it("returns not_connected when the connection is paused", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "paused",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("not_connected");
  });
});

describe("ga4_query - no_property branch", () => {
  it("returns no_property when GA4 is connected but property_id is missing", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    } as never);

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("no_property");
    if (result.status === "no_property") {
      expect(result.property_picker_url).toContain("ga4_pick=1");
    }
  });
});

describe("ga4_query - fresh cache hit", () => {
  it("returns the cached response with cache_status='fresh'", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);

    mockGetCached.mockResolvedValue({
      id: "row-1",
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "test-hash",
      input: {},
      response: okGa4Response() as unknown as Record<string, unknown>,
      refreshed_at: "2026-05-17T01:00:00Z",
      stale_after_seconds: 900,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      provider_etag: null,
      error_state: null,
      created_at: "2026-05-17T01:00:00Z",
      updated_at: "2026-05-17T01:00:00Z",
    });
    mockIsFresh.mockReturnValue(true);

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.cache_status).toBe("fresh");
      expect(result.rows[0].value).toBe(1234);
    }

    // No refresh path on a fresh hit
    expect(mockWithLock).not.toHaveBeenCalled();
    expect(mockWriteCached).not.toHaveBeenCalled();
  });
});

describe("ga4_query - cache miss triggers fresh fetch", () => {
  it("locks, fetches via withFreshToken+runGa4Query, writes cache, returns fresh", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);
    mockGetCached.mockResolvedValue(null);
    mockIsFresh.mockReturnValue(false);

    // withRefreshLock(admin, key, fn) calls fn() and wraps in { acquired: true, result: T }
    // The fn passed in calls withFreshToken which we mock to invoke its inner with a fake cred
    mockWithLock.mockImplementation(async (_admin, _key, fn) => {
      const result = (await fn()) as ReturnType<typeof okGa4Response>;
      return { acquired: true, result };
    });
    mockWithFreshToken.mockImplementation(async (_admin, _conn, fn) =>
      fn({
        type: "oauth",
        access_token: "tok",
        refresh_token: "ref",
        expires_at: 999_999_999_999,
        token_type: "Bearer",
        scope: null,
      })
    );
    mockCreateGa4Client.mockResolvedValue({ runReport: vi.fn() });
    mockRunGa4Query.mockResolvedValue(okGa4Response());
    mockWriteCached.mockResolvedValue({} as never);

    const result = await ga4QueryTool.execute(validInput, ctx);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.cache_status).toBe("fresh_from_extractor");
      expect(result.rows[0].value).toBe(1234);
      expect(result.property_id).toBe("p-1");
    }

    expect(mockRunGa4Query).toHaveBeenCalledTimes(1);
    expect(mockWriteCached).toHaveBeenCalledTimes(1);
  });
});

describe("ga4_query - stale + lock contention serves stale", () => {
  it("serves stale data with cache_status='stale_revalidating' when another worker has the lock", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);

    mockGetCached.mockResolvedValue({
      id: "row-1",
      account_id: "acc-1",
      source: "ga4",
      normalized_input_hash: "test-hash",
      input: {},
      response: okGa4Response() as unknown as Record<string, unknown>,
      refreshed_at: "2026-05-17T00:00:00Z",
      stale_after_seconds: 900,
      expires_at: "2026-05-17T00:15:00Z",
      provider_etag: null,
      error_state: null,
      created_at: "2026-05-17T00:00:00Z",
      updated_at: "2026-05-17T00:00:00Z",
    });
    mockIsFresh.mockReturnValue(false);
    mockWithLock.mockResolvedValue({ acquired: false } as never);

    const result = await ga4QueryTool.execute(validInput, ctx);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.cache_status).toBe("stale_revalidating");
      expect(result.rows[0].value).toBe(1234);
    }
    expect(mockRunGa4Query).not.toHaveBeenCalled();
  });

  it("returns transient_provider_error when lock fails and no cached row exists", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);
    mockGetCached.mockResolvedValue(null);
    mockWithLock.mockResolvedValue({ acquired: false } as never);

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error_class).toBe("transient_provider_error");
    }
  });
});

describe("ga4_query - error classification", () => {
  it("maps TokenRejectedError -> reauthorize_required", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);
    mockGetCached.mockResolvedValue(null);
    mockWithLock.mockImplementation(async () => {
      throw new Error("TokenRejected by ga4");
    });

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error_class).toBe("reauthorize_required");
    }
  });

  it("maps PERMISSION_DENIED -> permission_denied", async () => {
    mockGetConnection.mockResolvedValue({
      id: "c1",
      account_id: "acc-1",
      provider: "ga4",
      status: "active",
      credentials: {},
      last_sync_at: null,
      metadata: { property_id: "p-1" },
      created_at: "2026-01-01T00:00:00Z",
    } as never);
    mockGetCached.mockResolvedValue(null);
    mockWithLock.mockImplementation(async () => {
      throw new Error("PERMISSION_DENIED for property p-1");
    });

    const result = await ga4QueryTool.execute(validInput, ctx);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error_class).toBe("permission_denied");
    }
  });
});
