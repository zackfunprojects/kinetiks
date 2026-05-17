import { describe, expect, it } from "vitest";

import {
  buildOraclePolishPrompt,
  parseOraclePolishResponse,
} from "../prompts/oracle-polish";
import type { OracleSignal } from "../insights/types";

const signal: OracleSignal = {
  type: "risk",
  severity: "urgent",
  source_app: "cross",
  source_operator: "oracle.analyzer.roas-channel",
  summary: "meta channel ROAS is 0.60x",
  evidence: { channel: "meta", spend_28d: 5000, revenue_28d: 3000, roas: 0.6 },
  suggested_action: { kind: "open_thread", label: "Pause meta spend" },
  dedup_key: "roas-channel:meta:2026-W20",
};

describe("buildOraclePolishPrompt", () => {
  it("includes the brand voice when provided", () => {
    const p = buildOraclePolishPrompt({
      signals: [signal],
      brand_voice: "Direct and data-driven. No em-dashes.",
    });
    expect(p).toContain("Direct and data-driven");
    expect(p).toContain("BRAND VOICE");
  });

  it("omits the brand voice block when not provided", () => {
    const p = buildOraclePolishPrompt({ signals: [signal] });
    expect(p).not.toContain("BRAND VOICE");
  });

  it("renders each signal with its raw_summary and evidence", () => {
    const p = buildOraclePolishPrompt({ signals: [signal] });
    expect(p).toContain("meta channel ROAS is 0.60x");
    expect(p).toContain('"channel":"meta"');
  });

  it("enforces the 140-char + no-em-dash rules in-prompt", () => {
    const p = buildOraclePolishPrompt({ signals: [signal] });
    expect(p).toContain("140 characters");
    expect(p).toContain("No em-dashes");
  });
});

describe("parseOraclePolishResponse", () => {
  it("parses a well-formed JSON array of the expected count", () => {
    const raw = JSON.stringify([
      { summary: "polished 1", suggested_action_label: "act 1" },
      { summary: "polished 2", suggested_action_label: "act 2" },
    ]);
    const out = parseOraclePolishResponse(raw, 2);
    expect(out).toHaveLength(2);
    expect(out![0]!.summary).toBe("polished 1");
  });

  it("tolerates a ```json code fence", () => {
    const raw = "```json\n" + JSON.stringify([{ summary: "x", suggested_action_label: "y" }]) + "\n```";
    expect(parseOraclePolishResponse(raw, 1)).not.toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseOraclePolishResponse("not json", 1)).toBeNull();
  });

  it("returns null on wrong array length", () => {
    const raw = JSON.stringify([{ summary: "a", suggested_action_label: "b" }]);
    expect(parseOraclePolishResponse(raw, 2)).toBeNull();
  });

  it("returns null when an item is missing required fields", () => {
    const raw = JSON.stringify([{ summary: "a" }]);
    expect(parseOraclePolishResponse(raw, 1)).toBeNull();
  });
});
