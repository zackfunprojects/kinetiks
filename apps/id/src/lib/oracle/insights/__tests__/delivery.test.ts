import { describe, expect, it } from "vitest";

import { extractCitedInsightIds } from "../delivery";

const a = "11111111-1111-1111-1111-111111111111";
const b = "22222222-2222-2222-2222-222222222222";
const c = "33333333-3333-3333-3333-333333333333";

describe("extractCitedInsightIds", () => {
  it("matches insight_id=UUID references in body text", () => {
    const allow = new Set([a, b]);
    const text = `Last week we noticed traffic was up [insight_id=${a}], and your bounce rate worsened on mobile [insight_id=${b}].`;
    expect(extractCitedInsightIds(text, allow).sort()).toEqual([a, b].sort());
  });

  it("ignores UUIDs not in the allowlist", () => {
    const allow = new Set([a]);
    const text = `Two findings: [insight_id=${a}], [insight_id=${c}]`;
    expect(extractCitedInsightIds(text, allow)).toEqual([a]);
  });

  it("is case-insensitive on the hex digits", () => {
    const allow = new Set([a]);
    const text = `[insight_id=${a.toUpperCase()}]`;
    expect(extractCitedInsightIds(text, allow)).toEqual([a]);
  });

  it("dedups multiple references to the same id", () => {
    const allow = new Set([a]);
    const text = `[insight_id=${a}] ... and again [insight_id=${a}]`;
    expect(extractCitedInsightIds(text, allow)).toEqual([a]);
  });

  it("returns [] when no insight_id strings appear", () => {
    const allow = new Set([a]);
    expect(extractCitedInsightIds("plain text response", allow)).toEqual([]);
  });

  it("returns [] when allowlist is empty", () => {
    const text = `[insight_id=${a}]`;
    expect(extractCitedInsightIds(text, new Set())).toEqual([]);
  });
});
