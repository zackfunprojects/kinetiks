import { beforeEach, describe, expect, it, vi } from "vitest";

const { askClaudeMock } = vi.hoisted(() => ({ askClaudeMock: vi.fn() }));
vi.mock("@kinetiks/ai", () => ({ askClaude: askClaudeMock }));

import { extractInboundEmailIntelligence } from "../inbound-intelligence";

beforeEach(() => {
  vi.clearAllMocks();
  askClaudeMock.mockResolvedValue(
    JSON.stringify({
      relevant: true,
      category: "competitive_intel",
      summary: "Rival shipped usage-based pricing.",
      action_items: ["Review our pricing page"],
      entities: ["Rival"],
    }),
  );
});

describe("extractInboundEmailIntelligence", () => {
  it("redacts contact PII before the prompt reaches the model", async () => {
    await extractInboundEmailIntelligence({
      senderName: "Jane Doe",
      subject: "Re: pricing — call me at 555-867-5309",
      body: "Reach me at jane.doe@rival.test or +1 (555) 867-5309. They launched usage pricing.",
    });

    const prompt = String(askClaudeMock.mock.calls[0]![0]);
    expect(prompt).not.toContain("jane.doe@rival.test");
    expect(prompt).not.toContain("867-5309");
    expect(prompt).toContain("usage pricing");
  });

  it("parses the model's JSON and clamps the shape", async () => {
    const result = await extractInboundEmailIntelligence({
      senderName: "Jane",
      subject: "s",
      body: "b",
    });
    expect(result).toEqual({
      relevant: true,
      category: "competitive_intel",
      summary: "Rival shipped usage-based pricing.",
      action_items: ["Review our pricing page"],
      entities: ["Rival"],
    });
  });

  it("tolerates prose around the JSON and unknown categories", async () => {
    askClaudeMock.mockResolvedValueOnce(
      `Here is the analysis:\n{"relevant": true, "category": "made_up", "summary": "x", "action_items": [], "entities": []}\nDone.`,
    );
    const result = await extractInboundEmailIntelligence({
      senderName: "J",
      subject: "s",
      body: "b",
    });
    expect(result?.category).toBe("other");
  });

  it("returns null on unparseable output instead of throwing", async () => {
    askClaudeMock.mockResolvedValueOnce("I cannot analyze this email.");
    await expect(
      extractInboundEmailIntelligence({ senderName: "J", subject: "s", body: "b" }),
    ).resolves.toBeNull();
  });
});
