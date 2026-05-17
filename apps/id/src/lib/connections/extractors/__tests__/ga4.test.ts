import { describe, expect, it, vi } from "vitest";
import {
  getStaleAfterSeconds,
  resolveDateRange,
  runGa4Query,
  type Ga4Client,
  type Ga4Query,
  type Ga4RunReportArgs,
  type Ga4RunReportResponse,
} from "../ga4";

function makeMockClient(
  response: Ga4RunReportResponse
): Ga4Client & { calls: Ga4RunReportArgs[] } {
  const calls: Ga4RunReportArgs[] = [];
  return {
    calls,
    async runReport(args) {
      calls.push(args);
      return response;
    },
  };
}

describe("resolveDateRange", () => {
  it("maps last_7_days to 7daysAgo / today", () => {
    expect(resolveDateRange({ metric: "ga4_sessions", date_range: "last_7_days" })).toEqual({
      start: "7daysAgo",
      end: "today",
    });
  });

  it("maps last_28_days to 28daysAgo / today", () => {
    expect(resolveDateRange({ metric: "ga4_sessions", date_range: "last_28_days" })).toEqual({
      start: "28daysAgo",
      end: "today",
    });
  });

  it("maps last_90_days to 90daysAgo / today", () => {
    expect(resolveDateRange({ metric: "ga4_users", date_range: "last_90_days" })).toEqual({
      start: "90daysAgo",
      end: "today",
    });
  });

  it("honors custom start/end", () => {
    expect(
      resolveDateRange({
        metric: "ga4_sessions",
        date_range: "custom",
        start_date: "2026-04-01",
        end_date: "2026-04-15",
      })
    ).toEqual({ start: "2026-04-01", end: "2026-04-15" });
  });

  it("throws on custom range without start/end", () => {
    expect(() =>
      resolveDateRange({ metric: "ga4_sessions", date_range: "custom" })
    ).toThrow(/start_date and end_date/);
  });
});

describe("getStaleAfterSeconds", () => {
  it("returns 900 (15 min) for sessions on a 7-day window", () => {
    expect(
      getStaleAfterSeconds({ metric: "ga4_sessions", date_range: "last_7_days" })
    ).toBe(900);
  });

  it("returns 900 (15 min) for users on a 28-day window", () => {
    expect(
      getStaleAfterSeconds({ metric: "ga4_users", date_range: "last_28_days" })
    ).toBe(900);
  });

  it("returns 3600 (1 hr) for bounce_rate", () => {
    expect(
      getStaleAfterSeconds({
        metric: "ga4_bounce_rate",
        date_range: "last_28_days",
      })
    ).toBe(3600);
  });

  it("returns 86400 (24h) for any 90-day window — historical", () => {
    expect(
      getStaleAfterSeconds({ metric: "ga4_sessions", date_range: "last_90_days" })
    ).toBe(86_400);
    expect(
      getStaleAfterSeconds({ metric: "ga4_bounce_rate", date_range: "last_90_days" })
    ).toBe(86_400);
  });
});

describe("runGa4Query - happy path", () => {
  it("returns rows for a simple sessions query", async () => {
    const client = makeMockClient({
      rows: [
        { dimensionValues: [], metricValues: [{ value: "1200" }] },
      ],
    });

    const query: Ga4Query = {
      metric: "ga4_sessions",
      date_range: "last_7_days",
    };
    const result = await runGa4Query(client, "12345", query);

    expect(result.metric).toBe("ga4_sessions");
    expect(result.metric_unit).toBe("count");
    expect(result.property_id).toBe("12345");
    expect(result.rows).toEqual([{ dimensions: {}, value: 1200 }]);
    expect(client.calls[0]).toEqual({
      property: "properties/12345",
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }],
      dimensions: [],
    });
  });

  it("translates dimension keys to GA4-native names", async () => {
    const client = makeMockClient({
      rows: [
        {
          dimensionValues: [{ value: "United States" }, { value: "desktop" }],
          metricValues: [{ value: "450" }],
        },
        {
          dimensionValues: [{ value: "Germany" }, { value: "mobile" }],
          metricValues: [{ value: "120" }],
        },
      ],
    });

    const result = await runGa4Query(client, "p1", {
      metric: "ga4_sessions",
      date_range: "last_7_days",
      dimensions: ["country", "device"],
    });

    expect(client.calls[0].dimensions).toEqual([
      { name: "country" },
      { name: "deviceCategory" },
    ]);
    expect(result.rows).toEqual([
      { dimensions: { country: "United States", device: "desktop" }, value: 450 },
      { dimensions: { country: "Germany", device: "mobile" }, value: 120 },
    ]);
  });

  it("scales bounce_rate from 0..1 to 0..100 (percentage)", async () => {
    const client = makeMockClient({
      rows: [{ dimensionValues: [], metricValues: [{ value: "0.42" }] }],
    });

    const result = await runGa4Query(client, "p1", {
      metric: "ga4_bounce_rate",
      date_range: "last_28_days",
    });

    expect(result.metric_unit).toBe("percentage");
    expect(result.rows[0].value).toBeCloseTo(42, 5);
  });

  it("handles missing rows / empty response cleanly", async () => {
    const client = makeMockClient({ rows: [] });
    const result = await runGa4Query(client, "p1", {
      metric: "ga4_sessions",
      date_range: "last_7_days",
    });
    expect(result.rows).toEqual([]);
  });

  it("honors custom date ranges in the request", async () => {
    const client = makeMockClient({ rows: [] });
    await runGa4Query(client, "p1", {
      metric: "ga4_users",
      date_range: "custom",
      start_date: "2026-04-01",
      end_date: "2026-04-15",
    });
    expect(client.calls[0].dateRanges).toEqual([
      { startDate: "2026-04-01", endDate: "2026-04-15" },
    ]);
  });
});

describe("runGa4Query - error cases", () => {
  it("throws when property_id is missing", async () => {
    const client = makeMockClient({ rows: [] });
    await expect(
      runGa4Query(client, "", {
        metric: "ga4_sessions",
        date_range: "last_7_days",
      })
    ).rejects.toThrow(/property_id/);
  });

  it("throws when client.runReport throws", async () => {
    const client: Ga4Client = {
      runReport: vi.fn().mockRejectedValue(new Error("upstream 500")),
    };
    await expect(
      runGa4Query(client, "p1", {
        metric: "ga4_sessions",
        date_range: "last_7_days",
      })
    ).rejects.toThrow("upstream 500");
  });
});

describe("registerExtractor side effect", () => {
  it("registers a ga4 extractor at module load", async () => {
    // Importing the module here forces the side-effect registration.
    // We then call the registry indirectly via runExtraction's lookup
    // path; the public surface for "is this provider registered" is the
    // registerExtractor map, which is intentionally module-internal. The
    // most observable proof is that ga4Extractor itself is exported and
    // returns [] (D1's no-proposal contract).
    const mod = await import("../ga4");
    expect(typeof mod.ga4Extractor).toBe("function");
    const result = await mod.ga4Extractor({
      connectionId: "c1",
      accountId: "a1",
      provider: "ga4",
      credentials: {
        type: "oauth",
        access_token: "x",
        refresh_token: "y",
        expires_at: null,
        token_type: "Bearer",
        scope: null,
      },
      metadata: { property_id: "12345" },
    });
    expect(result).toEqual([]);
  });
});
