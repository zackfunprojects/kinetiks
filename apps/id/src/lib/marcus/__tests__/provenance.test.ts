import { describe, expect, it } from "vitest";
import {
  buildContextUsed,
  parseContextUsed,
  provenanceChipLabel,
  stripInsightCitations,
} from "../provenance";

describe("buildContextUsed", () => {
  it("returns undefined when no tools ran", () => {
    expect(buildContextUsed([])).toBeUndefined();
  });

  it("persists names and statuses only, never tool payloads", () => {
    const built = buildContextUsed([
      {
        tool_name: "ga4_query",
        output: {
          status: "ok",
          cache_status: "fresh",
          rows: [{ email: "leak@example.com", value: 12 }],
        },
      },
      {
        tool_name: "stripe_query",
        output: { status: "error", message: "boom" },
      },
    ]);

    expect(built).toEqual({
      tools: [
        { tool_name: "ga4_query", status: "ok", cache_status: "fresh" },
        { tool_name: "stripe_query", status: "error" },
      ],
    });
    // The raw output (and any PII inside it) must not be persisted.
    expect(JSON.stringify(built)).not.toContain("leak@example.com");
    expect(JSON.stringify(built)).not.toContain("rows");
  });

  it("tolerates non-object outputs", () => {
    expect(buildContextUsed([{ tool_name: "x_query", output: "plain" }])).toEqual({
      tools: [{ tool_name: "x_query" }],
    });
  });
});

describe("parseContextUsed", () => {
  it("round-trips what buildContextUsed wrote", () => {
    const built = buildContextUsed([
      { tool_name: "ga4_query", output: { status: "ok" } },
    ]);
    expect(parseContextUsed(built)).toEqual([
      { tool_name: "ga4_query", status: "ok" },
    ]);
  });

  it("returns [] for null, malformed, or legacy shapes", () => {
    expect(parseContextUsed(null)).toEqual([]);
    expect(parseContextUsed(undefined)).toEqual([]);
    expect(parseContextUsed({})).toEqual([]);
    expect(parseContextUsed({ tools: "nope" })).toEqual([]);
    expect(parseContextUsed({ tools: [{ no_name: true }] })).toEqual([]);
  });
});

describe("provenanceChipLabel", () => {
  it("labels known sources with cache disposition", () => {
    expect(
      provenanceChipLabel({ tool_name: "ga4_query", status: "ok", cache_status: "fresh" }),
    ).toBe("GA4 · fresh");
    expect(
      provenanceChipLabel({
        tool_name: "gsc_query",
        status: "ok",
        cache_status: "stale_revalidating",
      }),
    ).toBe("Search Console · cached");
    expect(
      provenanceChipLabel({
        tool_name: "stripe_query",
        status: "ok",
        cache_status: "fresh_from_extractor",
      }),
    ).toBe("Stripe · fresh");
  });

  it("shows the bare source without cache info", () => {
    expect(provenanceChipLabel({ tool_name: "query_patterns", status: "ok" })).toBe(
      "Patterns",
    );
  });

  it("never implies a queued or denied action ran", () => {
    expect(
      provenanceChipLabel({ tool_name: "send_slack_notification", status: "queued_for_approval" }),
    ).toBe("Slack · queued");
    expect(
      provenanceChipLabel({ tool_name: "draft_email", status: "denied" }),
    ).toBe("Email draft · denied");
    expect(provenanceChipLabel({ tool_name: "ga4_query", status: "error" })).toBe(
      "GA4 · error",
    );
  });

  it("humanizes unknown tools", () => {
    expect(provenanceChipLabel({ tool_name: "shopify_query" })).toBe("shopify");
  });
});

describe("stripInsightCitations", () => {
  const uuid = "0b6f9a3e-8f1c-4f4e-9d8a-2b7c6e5d4f3a";

  it("strips bracketed citations", () => {
    expect(
      stripInsightCitations(`Traffic dropped 18% [insight_id=${uuid}] this week.`),
    ).toBe("Traffic dropped 18% this week.");
  });

  it("strips parenthesized and colon-separated citations", () => {
    expect(
      stripInsightCitations(`Revenue is pacing ahead (insight_id: ${uuid}).`),
    ).toBe("Revenue is pacing ahead.");
  });

  it("strips bare citations and multiple occurrences", () => {
    const input = `First insight_id=${uuid} and second insight_id=${uuid} done.`;
    expect(stripInsightCitations(input)).toBe("First and second done.");
  });

  it("leaves content without citations untouched", () => {
    const input = "Plain advice with numbers like 1234 and ids like abc-def.";
    expect(stripInsightCitations(input)).toBe(input);
  });

  it("does not mangle punctuation around the citation", () => {
    expect(
      stripInsightCitations(`Watch organic conversions [insight_id=${uuid}], they fell 12%.`),
    ).toBe("Watch organic conversions, they fell 12%.");
  });
});
