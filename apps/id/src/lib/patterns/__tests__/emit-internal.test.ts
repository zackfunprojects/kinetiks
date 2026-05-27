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
  recordConnectionEvidenceObservation,
} from "../emit-internal";

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
