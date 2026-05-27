import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CloseResult,
  DeferredObservationInput,
  CloseDeferredArgs,
} from "../deferred-emit";

// Mock env so resolvePatternsUrl + resolveInternalSecret return real values.
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://test.kinetiks.ai",
    INTERNAL_SERVICE_SECRET: "test-secret",
  }),
}));

// Mock deferred-emit so we can assert what the wrappers pass through
// without exercising the synapse fetch. vi.hoisted() ensures the mock
// functions are defined before vi.mock's factory runs (which is hoisted
// to the top of the file). Explicit return types avoid TypeScript
// over-narrowing the inferred shape from the default factory return.
const { recordDeferredObservation, closeDeferredObservation } = vi.hoisted(
  () => ({
    recordDeferredObservation: vi.fn<
      (input: DeferredObservationInput) => Promise<{ id: string }>
    >(async () => ({ id: "obs-id" })),
    closeDeferredObservation: vi.fn<
      (args: CloseDeferredArgs) => Promise<CloseResult>
    >(async () => ({
      closed: true,
      pattern_id: "pat-id",
      outcome: "evidence_added",
      reason: null,
    })),
  }),
);

vi.mock("../deferred-emit", () => ({
  recordDeferredObservation,
  closeDeferredObservation,
}));

import {
  closeConnectionEvidenceObservation,
  closeMostRecentConnectionEvidenceForProvider,
  recordConnectionEvidenceObservation,
} from "../emit-internal";

/**
 * Build a Supabase admin client stub for the fuzzy-match close path.
 * The helper does:
 *   admin.from(TABLE).select(...).eq().eq().eq().filter().order().limit().maybeSingle()
 * Every chain method returns the same proxy until maybeSingle resolves.
 *
 * Pass the response maybeSingle should resolve to.
 */
function buildSupabaseAdminStub(
  maybeSingleResponse:
    | { data: { observation_key: string; dimensions: Record<string, unknown> } | null; error: null }
    | { data: null; error: { message: string } },
) {
  const eqCalls: Array<[string, unknown]> = [];
  const filterCalls: Array<[string, string, unknown]> = [];
  const maybeSingle = vi.fn(async () => maybeSingleResponse);
  const chain = {
    select: vi.fn(function (this: unknown) { return chain; }),
    eq: vi.fn(function (this: unknown, col: string, val: unknown) {
      eqCalls.push([col, val]);
      return chain;
    }),
    filter: vi.fn(function (this: unknown, col: string, op: string, val: unknown) {
      filterCalls.push([col, op, val]);
      return chain;
    }),
    order: vi.fn(function (this: unknown) { return chain; }),
    limit: vi.fn(function (this: unknown) { return chain; }),
    maybeSingle,
  };
  const from = vi.fn(() => chain);
  const adminStub = { from } as unknown as SupabaseClient;
  return { adminStub, from, chain, eqCalls, filterCalls, maybeSingle };
}

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

// A bare-bones SupabaseClient stand-in. Neither the record nor the
// exact-match close paths inspect this object directly; the deferred-emit
// mocks intercept before any DB call.
const admin = {} as unknown as SupabaseClient;

beforeEach(() => {
  recordDeferredObservation.mockClear();
  closeDeferredObservation.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordConnectionEvidenceObservation", () => {
  it("forwards a kinetiks_id.connection_value_per_source observation with provider/layer_touched/query_class dimensions", async () => {
    await recordConnectionEvidenceObservation(
      {
        account_id: ACCOUNT_ID,
        provider: "ga4",
        layer: "market",
        query_class_hint: "ga4_query",
        request_id: "req-123",
      },
      admin,
    );

    expect(recordDeferredObservation).toHaveBeenCalledTimes(1);
    const call = recordDeferredObservation.mock.calls[0]?.[0];
    if (!call) throw new Error("expected recordDeferredObservation to have been called");
    expect(call.pattern_type).toBe("kinetiks_id.connection_value_per_source");
    expect(call.observation_key).toBe("req-123");
    // The dimension key MUST be layer_touched (not layer) — the pattern
    // type's dimensions_schema requires that field. A naming drift would
    // silently coerce to layer_touched: "none" via bucketize and lose
    // signal.
    expect(call.dimensions).toMatchObject({
      provider: "ga4",
      layer_touched: "market",
      query_class: "ga4_query",
    });
    expect(call.outcome_window_seconds).toBeGreaterThan(0);
  });

  it("does not throw when the underlying recorder rejects", async () => {
    recordDeferredObservation.mockRejectedValueOnce(new Error("db unreachable"));
    await expect(
      recordConnectionEvidenceObservation(
        {
          account_id: ACCOUNT_ID,
          provider: "ga4",
          layer: "market",
          query_class_hint: "ga4_query",
          request_id: "req-err",
        },
        admin,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("closeConnectionEvidenceObservation", () => {
  it("closes by exact request_id with outcome=1 and the canonical pattern_type", async () => {
    await closeConnectionEvidenceObservation(
      {
        account_id: ACCOUNT_ID,
        request_id: "req-123",
        outcome_recorded_via: "marcus_brief_inclusion",
      },
      admin,
    );

    expect(closeDeferredObservation).toHaveBeenCalledTimes(1);
    const call = closeDeferredObservation.mock.calls[0]?.[0];
    if (!call) throw new Error("expected closeDeferredObservation to have been called");
    expect(call.account_id).toBe(ACCOUNT_ID);
    expect(call.pattern_type).toBe("kinetiks_id.connection_value_per_source");
    expect(call.observation_key).toBe("req-123");
    expect(call.outcome_value).toBe(1);
    expect(call.outcome_direction).toBe("higher_is_better");
    expect(call.patternsUrl).toBe(
      "https://test.kinetiks.ai/api/synapse/patterns",
    );
    expect(call.internalSecret).toBe("test-secret");
  });

  it("is idempotent: a no_pending_observation result returns silently without throwing", async () => {
    closeDeferredObservation.mockResolvedValueOnce({
      closed: false,
      pattern_id: null,
      outcome: null,
      reason: "no_pending_observation",
    });

    await expect(
      closeConnectionEvidenceObservation(
        {
          account_id: ACCOUNT_ID,
          request_id: "req-missing",
          outcome_recorded_via: "marcus_brief_inclusion",
        },
        admin,
      ),
    ).resolves.toBeUndefined();
    expect(closeDeferredObservation).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the underlying close rejects", async () => {
    closeDeferredObservation.mockRejectedValueOnce(new Error("synapse 500"));
    await expect(
      closeConnectionEvidenceObservation(
        {
          account_id: ACCOUNT_ID,
          request_id: "req-thrown",
          outcome_recorded_via: "oracle_insight_citation",
        },
        admin,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("closeMostRecentConnectionEvidenceForProvider", () => {
  it("filters by dimensions->>provider and closes the matching pending row with outcome=1", async () => {
    const { adminStub, from, eqCalls, filterCalls } = buildSupabaseAdminStub({
      data: {
        observation_key: "req-alice-ga4",
        dimensions: {
          provider: "ga4",
          layer_touched: "market",
          query_class: "ga4_query",
        },
      },
      error: null,
    });

    await closeMostRecentConnectionEvidenceForProvider(
      {
        account_id: ACCOUNT_ID,
        provider: "ga4",
        outcome_recorded_via: "oracle_insight_citation",
      },
      adminStub,
    );

    // Verify the helper queried the pending-observations table with the
    // right eq() guards (account, pattern_type, status) and that the
    // jsonb provider filter was passed correctly. These together are
    // the bug shape that would silently no-op if the syntax drifts.
    expect(from).toHaveBeenCalledWith("kinetiks_pattern_pending_observations");
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["account_id", ACCOUNT_ID],
        ["pattern_type", "kinetiks_id.connection_value_per_source"],
        ["status", "pending"],
      ]),
    );
    expect(filterCalls).toEqual([["dimensions->>provider", "eq", "ga4"]]);

    // And the resolved pending row was closed via the deferred-emit
    // helper with outcome=1 and the canonical pattern_type.
    expect(closeDeferredObservation).toHaveBeenCalledTimes(1);
    const call = closeDeferredObservation.mock.calls[0]?.[0];
    if (!call) throw new Error("expected closeDeferredObservation to have been called");
    expect(call.pattern_type).toBe("kinetiks_id.connection_value_per_source");
    expect(call.observation_key).toBe("req-alice-ga4");
    expect(call.outcome_value).toBe(1);
  });

  it("is a no-op when no pending observation matches the provider", async () => {
    const { adminStub } = buildSupabaseAdminStub({ data: null, error: null });

    await closeMostRecentConnectionEvidenceForProvider(
      {
        account_id: ACCOUNT_ID,
        provider: "stripe", // provider with nothing pending
        outcome_recorded_via: "oracle_insight_citation",
      },
      adminStub,
    );

    // No pending row → no underlying close call. Critical: an
    // overzealous close on the no-match branch would close someone
    // else's observation by accident.
    expect(closeDeferredObservation).not.toHaveBeenCalled();
  });

  it("does not throw when the lookup query returns an error", async () => {
    const { adminStub } = buildSupabaseAdminStub({
      data: null,
      error: { message: "rls denied" },
    });

    await expect(
      closeMostRecentConnectionEvidenceForProvider(
        {
          account_id: ACCOUNT_ID,
          provider: "ga4",
          outcome_recorded_via: "oracle_insight_citation",
        },
        adminStub,
      ),
    ).resolves.toBeUndefined();
    expect(closeDeferredObservation).not.toHaveBeenCalled();
  });
});

describe("closeConnectionEvidenceObservation when env is missing", () => {
  // resolvePatternsUrl returns null when NEXT_PUBLIC_APP_URL is absent.
  // The helper must short-circuit without invoking the underlying close.
  it("short-circuits when NEXT_PUBLIC_APP_URL is missing", async () => {
    vi.resetModules();
    vi.doMock("@kinetiks/lib/env", () => ({
      serverEnv: () => ({
        NEXT_PUBLIC_APP_URL: undefined,
        INTERNAL_SERVICE_SECRET: "test-secret",
      }),
    }));
    const stubRecord = vi.fn();
    const stubClose = vi.fn();
    vi.doMock("../deferred-emit", () => ({
      recordDeferredObservation: stubRecord,
      closeDeferredObservation: stubClose,
    }));

    const mod = await import("../emit-internal");
    await mod.closeConnectionEvidenceObservation(
      {
        account_id: ACCOUNT_ID,
        request_id: "req-noenv",
        outcome_recorded_via: "marcus_brief_inclusion",
      },
      admin,
    );

    expect(stubClose).not.toHaveBeenCalled();

    vi.resetModules();
    vi.doUnmock("@kinetiks/lib/env");
    vi.doUnmock("../deferred-emit");
  });
});
