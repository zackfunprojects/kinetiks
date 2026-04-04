import { describe, it, expect } from "vitest";
import { isManifestComplete, type DataAvailabilityManifest } from "../types";

describe("DataAvailabilityManifest", () => {
  it("validates a complete manifest", () => {
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
            last_updated: "2026-04-01T10:00:00Z",
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
          capabilities_available: ["create_sequence", "query_pipeline"],
          capabilities_broken: ["create_sequence", "query_pipeline"],
        },
      ],
      available_data: [],
      known_gaps: [
        {
          category: "outbound_metrics",
          what_is_missing: "No outbound performance data available",
          why_it_matters:
            "Cannot make data-grounded outreach recommendations",
          how_to_fill:
            "Connect Harvest to enable pipeline visibility",
        },
      ],
      data_freshness: [],
    };

    expect(isManifestComplete(manifest)).toBe(true);
  });

  it("rejects manifest with no cortex layers", () => {
    const manifest: DataAvailabilityManifest = {
      cortex_coverage: { overall_confidence: 0, layers: [] },
      connections: [],
      available_data: [],
      known_gaps: [],
      data_freshness: [],
    };

    expect(isManifestComplete(manifest)).toBe(false);
  });
});
