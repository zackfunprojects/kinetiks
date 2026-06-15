import { describe, it, expect, vi } from "vitest";
import { buildPreAnalysisBrief, formatBriefForSonnet } from "../pre-analysis";
import { buildPreAnalysisPrompt } from "../prompts/marcus-brief";
import type {
  DataAvailabilityManifest,
  PreAnalysisBrief,
  ThreadMemory,
} from "../types";

// CLAUDE.md (Marcus Engine Patterns): "snapshot tests for the evidence brief
// shape, and behavioral tests for the sparse-data conversational mode." This
// suite covers both. The AI dependency is the injected `claudeHaiku` callback;
// the renderer (formatBriefForSonnet) and prompt builder (buildPreAnalysisPrompt)
// are pure and need no mock.

const richManifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      { layer_name: "voice", confidence: 69, has_data: true, field_count: 7, total_fields: 12, last_updated: "2026-04-01", source: "mixed" },
      { layer_name: "competitive", confidence: 97, has_data: true, field_count: 11, total_fields: 12, last_updated: "2026-04-01", source: "mixed" },
    ],
  },
  connections: [
    { app_name: "harvest", connected: false, synapse_healthy: false, last_sync: null, capabilities_available: ["create_sequence"], capabilities_broken: ["create_sequence"] },
  ],
  available_data: [],
  known_gaps: [
    { category: "outbound", what_is_missing: "No outbound data (Harvest not connected)", why_it_matters: "Cannot assess pipeline", how_to_fill: "Connect Harvest" },
  ],
  data_freshness: [],
};

// Sparse: overall_confidence < 30 — the dial that drives conversational mode.
const sparseManifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 12,
    layers: [
      { layer_name: "voice", confidence: 10, has_data: false, field_count: 0, total_fields: 12, last_updated: null, source: "empty" },
      { layer_name: "competitive", confidence: 15, has_data: false, field_count: 1, total_fields: 12, last_updated: null, source: "empty" },
    ],
  },
  connections: [],
  available_data: [],
  known_gaps: [],
  data_freshness: [],
};

const memories: ThreadMemory[] = [
  { id: "1", thread_id: "t", memory_type: "correction", content: "User targets seed stage, NOT Series A/B", source_message_index: 4, confidence: 0.9, active: true, created_at: "" },
];

describe("evidence brief — shape snapshot", () => {
  // A fixed, hand-built brief — no AI. Snapshots the rendered prompt block
  // that gets injected adjacent to the user's question. If the brief→prompt
  // contract changes, this snapshot makes it a deliberate review decision.
  const fixedBrief: PreAnalysisBrief = {
    available_evidence: [
      { label: "competitive", value: "97%", citation: "Competitive layer at 97% confidence" },
    ],
    not_available: ["Pipeline data", "Close rate history"],
    memory_facts: ["User targets seed stage, NOT Series A/B"],
    response_shape: {
      max_sentences: 6,
      lead_with: "Outbound strategy for seed-stage companies",
      must_flag: ["No pipeline data"],
      must_not: ["Promise Harvest actions"],
    },
    action_availability: [{ app_name: "harvest", available: false, reason: "Not connected" }],
  };

  it("renders a stable evidence-brief block for Sonnet", () => {
    expect(formatBriefForSonnet(fixedBrief)).toMatchSnapshot();
  });

  it("parses a Haiku response into the canonical brief shape", async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: JSON.stringify(fixedBrief) }],
    });
    const { brief } = await buildPreAnalysisBrief(
      "how should I grow this business",
      richManifest,
      memories,
      "strategic",
      "",
      mockHaiku
    );
    // Snapshot the parsed/validated brief structure (post-defaults).
    expect(brief).toMatchSnapshot();
  });
});

describe("sparse-data conversational mode — behavioral", () => {
  it("a sparse manifest produces the CONVERSATIONAL brief prompt, never a refusal", () => {
    const prompt = buildPreAnalysisPrompt("how do I grow?", sparseManifest, "", "strategic", "");
    expect(prompt).toContain("DATA DENSITY: SPARSE");
    expect(prompt).toContain("CONVERSATIONAL ENGAGEMENT");
    // The sparse branch must instruct against refusal/data-dump behavior.
    expect(prompt).toContain("Refuse to help until data is filled");
    expect(prompt).toContain("Tell user to complete their profile");
  });

  it("a sufficient manifest produces the evidence-cited prompt, not the refusal block", () => {
    const prompt = buildPreAnalysisPrompt("how do I grow?", richManifest, "", "strategic", "");
    expect(prompt).toContain("DATA DENSITY: SUFFICIENT");
    expect(prompt).not.toContain("DATA DENSITY: SPARSE");
    expect(prompt).not.toContain("Refuse to help until data is filled");
  });

  it("the Haiku-failure fallback still yields a usable brief (no hard refusal)", async () => {
    const mockHaiku = vi.fn().mockRejectedValue(new Error("API timeout"));
    const { brief, formatted } = await buildPreAnalysisBrief(
      "how do I grow?",
      sparseManifest,
      memories,
      "strategic",
      "",
      mockHaiku
    );
    // Fallback must produce a structurally complete brief, not throw or refuse.
    expect(brief.response_shape).toBeTruthy();
    expect(Array.isArray(brief.not_available)).toBe(true);
    expect(brief.memory_facts).toContain("User targets seed stage, NOT Series A/B");
    expect(formatted).toContain("EVIDENCE BRIEF");
  });
});
