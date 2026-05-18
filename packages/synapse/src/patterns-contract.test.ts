/**
 * Contract tests for the Synapse emitPattern wire shape per the
 * Kinetiks Contract Addendum §1.4. Mocks global fetch and asserts:
 *
 *   - The wire body matches the canonical single-primary outcome shape
 *   - The returned discriminated PatternEmissionResult is unwrapped
 *     from the apiSuccess envelope
 *   - Errors surface as SynapseError with the right endpoint
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PatternEmissionPayload,
  PatternEmissionResult,
} from "@kinetiks/types";
import { createSynapse, SynapseError } from "./create-synapse";

let fetchMock: ReturnType<typeof vi.fn>;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function makeSynapse() {
  return createSynapse({
    appName: "harvest",
    baseUrl: "https://id.kinetiks.test",
    readLayers: ["org"],
    writeLayers: ["voice"],
    auth: { serviceSecret: "test-secret" },
    filterProposal: () => ({ shouldPropose: false }),
    handleRoutingEvent: async () => {},
  });
}

function payload(): PatternEmissionPayload {
  return {
    pattern_type: "harvest.outreach_angle_performance.reply_rate",
    dimensions: {
      angle_kind: "curiosity_hook",
      industry: "vertical saas for legal",
      seniority: "Director",
    },
    outcome_metric: "reply_rate",
    outcome_value: 0.14,
    outcome_direction: "higher_is_better",
    baseline_value: 0.1,
    sample_size: 50,
    variance: 0.001,
    applies_to_icp: "head_of_marketing_smb_saas",
    evidence_refs: ["ledger-a", "ledger-b"],
  };
}

function mockOk(result: PatternEmissionResult) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true, data: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockError(status: number, message: string) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("synapse.emitPattern wire contract", () => {
  it("POSTs to /api/synapse/patterns with the canonical body shape", async () => {
    mockOk({
      outcome: "created_emerging",
      pattern_id: "pat-1",
      status: "emerging",
      confidence_score: 0.42,
      observation_count: 2,
      sample_size: 50,
      lift_ratio: 1.4,
    });

    const synapse = makeSynapse();
    const result = await synapse.emitPattern("account-1", payload());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://id.kinetiks.test/api/synapse/patterns");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-secret",
    });

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      account_id: "account-1",
      source_app: "harvest",
      pattern_type: payload().pattern_type,
      dimensions: payload().dimensions,
      outcome_metric: "reply_rate",
      outcome_value: 0.14,
      outcome_direction: "higher_is_better",
      baseline_value: 0.1,
      sample_size: 50,
      variance: 0.001,
      source_workflow_id: null,
      applies_to_icp: "head_of_marketing_smb_saas",
      evidence_refs: ["ledger-a", "ledger-b"],
    });

    expect(result.outcome).toBe("created_emerging");
    if (result.outcome === "created_emerging") {
      expect(result.pattern_id).toBe("pat-1");
      expect(result.sample_size).toBe(50);
      expect(result.lift_ratio).toBe(1.4);
    }
  });

  it("nulls applies_to_icp + baseline_value + variance + source_workflow_id when omitted", async () => {
    mockOk({
      outcome: "created_emerging",
      pattern_id: "pat-1",
      status: "emerging",
      confidence_score: 0.4,
      observation_count: 1,
      sample_size: 10,
      lift_ratio: null,
    });

    const synapse = makeSynapse();
    const minimalPayload: PatternEmissionPayload = {
      pattern_type: "harvest.outreach_angle_performance.reply_rate",
      dimensions: { a: 1 },
      outcome_metric: "reply_rate",
      outcome_value: 0.1,
      outcome_direction: "higher_is_better",
      sample_size: 10,
      evidence_refs: ["ledger-x"],
    };
    await synapse.emitPattern("account-1", minimalPayload);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.applies_to_icp).toBeNull();
    expect(body.baseline_value).toBeNull();
    expect(body.variance).toBeNull();
    expect(body.source_workflow_id).toBeNull();
  });

  it("returns the discriminated result for each rejection outcome", async () => {
    const synapse = makeSynapse();

    mockOk({
      outcome: "rejected_unregistered_type",
      reason: "Pattern type 'foo.bar' is not registered",
    });
    let r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_unregistered_type");

    mockOk({
      outcome: "rejected_schema",
      reason: "dimensions failed schema validation",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_schema");

    mockOk({
      outcome: "rejected_outcome_mismatch",
      reason: "outcome_metric 'reply_rate' does not match descriptor's 'meeting_book_rate'",
      expected_metric: "meeting_book_rate",
      received_metric: "reply_rate",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_outcome_mismatch");

    mockOk({
      outcome: "rejected_source_app",
      reason: "App 'harvest' is not the source_app for dark_madder.foo.bar",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_source_app");

    mockOk({
      outcome: "rejected_inactive_synapse",
      reason: "Synapse for 'harvest' is not active",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_inactive_synapse");

    mockOk({
      outcome: "duplicate_ignored",
      pattern_id: "pat-1",
      reason: "evidence_refs_covered",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("duplicate_ignored");
  });

  it("returns promoted with transitioned_from + sample_size + lift_ratio for promotion paths", async () => {
    mockOk({
      outcome: "promoted",
      pattern_id: "pat-1",
      status: "validated",
      confidence_score: 0.82,
      observation_count: 40,
      sample_size: 1500,
      lift_ratio: 1.8,
      transitioned_from: "emerging",
    });
    const synapse = makeSynapse();
    const r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("promoted");
    if (r.outcome === "promoted") {
      expect(r.transitioned_from).toBe("emerging");
      expect(r.status).toBe("validated");
      expect(r.sample_size).toBe(1500);
      expect(r.lift_ratio).toBe(1.8);
    }
  });

  it("throws SynapseError on non-200 HTTP", async () => {
    mockError(500, "server exploded");
    const synapse = makeSynapse();
    try {
      await synapse.emitPattern("account-1", payload());
      throw new Error("expected SynapseError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SynapseError);
      const s = err as SynapseError;
      expect(s.statusCode).toBe(500);
      expect(s.endpoint).toBe("https://id.kinetiks.test/api/synapse/patterns");
      expect(s.message).toContain("server exploded");
    }
  });

  it("uses the configured app name as source_app (not hardcoded)", async () => {
    const dmSynapse = createSynapse({
      appName: "dark_madder",
      baseUrl: "https://id.kinetiks.test",
      readLayers: ["org"],
      writeLayers: ["voice"],
      auth: { serviceSecret: "dm-secret" },
      filterProposal: () => ({ shouldPropose: false }),
      handleRoutingEvent: async () => {},
    });
    mockOk({
      outcome: "created_emerging",
      pattern_id: "pat-x",
      status: "emerging",
      confidence_score: 0.3,
      observation_count: 1,
      sample_size: 5,
      lift_ratio: null,
    });
    await dmSynapse.emitPattern("account-1", {
      ...payload(),
      pattern_type: "dark_madder.content_resonance.engagement_rate",
      outcome_metric: "engagement_rate",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.source_app).toBe("dark_madder");
  });
});
