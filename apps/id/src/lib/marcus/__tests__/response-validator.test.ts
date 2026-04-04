import { describe, it, expect } from "vitest";
import { validateResponse } from "../validators/response-validator";
import type { DataAvailabilityManifest } from "../types";

const manifest: DataAvailabilityManifest = {
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
    ],
  },
  connections: [
    {
      app_name: "harvest",
      connected: false,
      synapse_healthy: false,
      last_sync: null,
      capabilities_available: [],
      capabilities_broken: [],
    },
  ],
  available_data: [],
  known_gaps: [],
  data_freshness: [],
};

describe("validateResponse", () => {
  it("passes a clean, concise, evidence-grounded response", () => {
    const response =
      "Cortex is at 67% confidence. Voice layer is strong at 82%. Harvest is not connected so I cannot build sequences or track pipeline yet. Connect Harvest and I can help with outbound.";
    const result = validateResponse(
      response,
      manifest,
      "tactical",
      "what can you do for me"
    );
    expect(result.passed).toBe(true);
    expect(result.needs_rewrite).toBe(false);
  });

  it("flags sycophantic verbose response for rewrite", () => {
    const sentences = [
      "Your positioning is sharp and the market timing is right.",
      "Startups are moving away from agencies.",
      "Your biggest advantage is scarcity.",
      "Two April spots creates natural urgency.",
      "Lead with that in every touchpoint.",
      "The market wants what you are selling.",
      "Your close rate assumption is conservative.",
      "Most qualified calls should convert.",
      "I am queuing harvest to build the sequences.",
      "Start prospecting while we build the automation.",
      "Your confidence scores show strong positioning.",
      "The delivery focus should help both areas significantly.",
    ];
    const response = sentences.join(" ");
    const result = validateResponse(
      response,
      manifest,
      "strategic",
      "how do I book calls"
    );
    expect(result.passed).toBe(false);
    expect(result.needs_rewrite).toBe(true);
    expect(result.rewrite_instructions).toBeTruthy();
    expect(result.evidence.violations.length).toBeGreaterThan(0);
  });
});
