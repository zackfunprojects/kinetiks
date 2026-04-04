import { describe, it, expect } from "vitest";
import { checkEvidence } from "../validators/evidence-checker";
import type { DataAvailabilityManifest } from "../types";

const disconnectedManifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      {
        layer_name: "voice",
        confidence: 82,
        has_data: true,
        field_count: 8,
        total_fields: 12,
        last_updated: "2026-04-01",
        source: "mixed",
      },
      {
        layer_name: "competitive",
        confidence: 97,
        has_data: true,
        field_count: 11,
        total_fields: 12,
        last_updated: "2026-04-01",
        source: "mixed",
      },
    ],
  },
  connections: [
    {
      app_name: "harvest",
      connected: false,
      synapse_healthy: false,
      last_sync: null,
      capabilities_available: ["create_sequence"],
      capabilities_broken: ["create_sequence"],
    },
  ],
  available_data: [],
  known_gaps: [
    {
      category: "outbound",
      what_is_missing: "No outbound data",
      why_it_matters: "Cannot assess pipeline",
      how_to_fill: "Connect Harvest",
    },
  ],
  data_freshness: [],
};

describe("checkEvidence", () => {
  it("catches sycophancy patterns", () => {
    const response =
      "Your positioning is sharp and the market timing is right.";
    const result = checkEvidence(
      response,
      disconnectedManifest,
      "how can we start booking calls"
    );
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.type === "sycophancy")
    ).toBe(true);
  });

  it("catches false promises about disconnected apps", () => {
    const response =
      "I've queued briefs to Harvest to build the outbound sequences.";
    const result = checkEvidence(
      response,
      disconnectedManifest,
      "help me book calls"
    );
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.type === "false_promise")
    ).toBe(true);
  });

  it("passes clean evidence-grounded response", () => {
    const response =
      "Your competitive confidence is 97%, which means your differentiation is well-documented. Your voice layer is at 82%. I cannot assess outbound performance because Harvest is not connected - you will need to connect it before I can build sequences or track pipeline.";
    const result = checkEvidence(
      response,
      disconnectedManifest,
      "help me book calls"
    );
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it("catches promise to build sequence when Harvest disconnected", () => {
    const response =
      "I'll build a 3-touch sequence targeting seed founders.";
    const result = checkEvidence(
      response,
      disconnectedManifest,
      "build me a sequence"
    );
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some((v) => v.type === "false_promise")).toBe(true);
  });
});
