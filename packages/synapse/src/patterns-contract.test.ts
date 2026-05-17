/**
 * Contract tests for the Synapse emitPattern wire shape per addendum
 * §1.4. Mocks global fetch and asserts:
 *
 *   - The wire body matches the documented shape exactly
 *   - The returned discriminated PatternEmissionResult is unwrapped from
 *     the apiSuccess envelope
 *   - Errors surface as SynapseError with the right endpoint
 *
 * These are contract tests, not integration tests: the actual emission
 * endpoint integration runs in apps/id; here we verify the client
 * speaks the wire shape the server expects.
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
    pattern_type: "harvest.outreach_angle_performance",
    dimensions: {
      angle_kind: "curiosity_hook",
      industry: "vertical saas for legal",
      seniority: "Director",
    },
    outcome_metrics: [
      {
        metric_name: "reply_rate",
        value: 0.14,
        sample_count: 50,
        confidence: 0.6,
        unit: "ratio_0_1",
      },
    ],
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
  it("POSTs to /api/synapse/patterns with the documented body shape", async () => {
    mockOk({
      outcome: "created_emerging",
      pattern_id: "pat-1",
      status: "emerging",
      confidence_score: 0.42,
      observation_count: 2,
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
    // Wire shape per §1.4: account_id + emitting_app set by the client
    // from config; the rest from the payload.
    expect(body).toEqual({
      account_id: "account-1",
      emitting_app: "harvest",
      pattern_type: payload().pattern_type,
      dimensions: payload().dimensions,
      outcome_metrics: payload().outcome_metrics,
      applies_to_icp: payload().applies_to_icp,
      evidence_refs: payload().evidence_refs,
    });

    // The result unwraps from the apiSuccess envelope.
    expect(result.outcome).toBe("created_emerging");
    if (result.outcome === "created_emerging") {
      expect(result.pattern_id).toBe("pat-1");
      expect(result.observation_count).toBe(2);
    }
  });

  it("nulls applies_to_icp when omitted in the payload", async () => {
    mockOk({
      outcome: "created_emerging",
      pattern_id: "pat-1",
      status: "emerging",
      confidence_score: 0.4,
      observation_count: 1,
    });

    const synapse = makeSynapse();
    const { applies_to_icp: _drop, ...rest } = payload();
    void _drop;
    await synapse.emitPattern("account-1", rest as PatternEmissionPayload);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.applies_to_icp).toBeNull();
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
      outcome: "rejected_metric_unit",
      reason: "metric 'reply_rate' expects unit 'ratio_0_1', got 'count'",
      metric_name: "reply_rate",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_metric_unit");

    mockOk({
      outcome: "rejected_emitting_app",
      reason: "App 'harvest' is not in emitting_apps for dark_madder.foo",
    });
    r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("rejected_emitting_app");

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

  it("returns promoted with transitioned_from for promotion paths", async () => {
    mockOk({
      outcome: "promoted",
      pattern_id: "pat-1",
      status: "validated",
      confidence_score: 0.82,
      observation_count: 40,
      transitioned_from: "emerging",
    });
    const synapse = makeSynapse();
    const r = await synapse.emitPattern("account-1", payload());
    expect(r.outcome).toBe("promoted");
    if (r.outcome === "promoted") {
      expect(r.transitioned_from).toBe("emerging");
      expect(r.status).toBe("validated");
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

  it("uses the configured app name (not a hardcoded value)", async () => {
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
    });
    await dmSynapse.emitPattern("account-1", {
      ...payload(),
      pattern_type: "dark_madder.content_resonance",
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.emitting_app).toBe("dark_madder");
  });
});
