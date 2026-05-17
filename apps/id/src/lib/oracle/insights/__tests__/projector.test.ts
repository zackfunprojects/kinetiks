import { describe, expect, it } from "vitest";

import { projectInsight } from "../projector";

const baseRow = {
  id: "ins-1",
  type: "anomaly",
  severity: "notable",
  source_app: "ga4",
  summary: "ga4_sessions spike",
  created_at: "2026-05-17T00:00:00Z",
  evidence: { metric_key: "ga4_sessions", z_score: 3.2 },
  suggested_action: { kind: "open_thread", label: "Investigate" },
};

describe("projectInsight", () => {
  it("returns the InsightProjection shape", () => {
    const p = projectInsight(baseRow);
    expect(p).toMatchObject({
      insight_id: "ins-1",
      type: "anomaly",
      severity: "notable",
      source_app: "ga4",
      summary: "ga4_sessions spike",
    });
  });

  it("strips PII-shaped keys defensively", () => {
    const p = projectInsight({
      ...baseRow,
      evidence: {
        metric_key: "x",
        contact_email: "leak@example.com",
        token_id: "abc",
      },
    });
    expect(p.evidence_highlights.map((h) => h.label)).toEqual(["metric_key"]);
  });

  it("caps highlights at 4", () => {
    const p = projectInsight({
      ...baseRow,
      evidence: {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 5,
      },
    });
    expect(p.evidence_highlights).toHaveLength(4);
  });

  it("rounds floats and stringifies booleans", () => {
    const p = projectInsight({
      ...baseRow,
      evidence: {
        ratio: 0.123456,
        flag: true,
        count: 42,
      },
    });
    expect(p.evidence_highlights.find((h) => h.label === "ratio")!.value).toBe("0.12");
    expect(p.evidence_highlights.find((h) => h.label === "flag")!.value).toBe("true");
    expect(p.evidence_highlights.find((h) => h.label === "count")!.value).toBe("42");
  });

  it("handles null evidence + suggested_action gracefully", () => {
    const p = projectInsight({
      ...baseRow,
      evidence: null,
      suggested_action: null,
    });
    expect(p.evidence_highlights).toEqual([]);
    expect(p.suggested_action).toBeNull();
  });
});
