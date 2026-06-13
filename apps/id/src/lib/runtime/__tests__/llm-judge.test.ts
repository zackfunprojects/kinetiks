import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { routeAskClaudeMock, captureExceptionMock } = vi.hoisted(() => ({
  routeAskClaudeMock: vi.fn(),
  captureExceptionMock: vi.fn(async () => undefined),
}));
vi.mock("@kinetiks/ai", () => ({
  routeAskClaude: routeAskClaudeMock,
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: captureExceptionMock,
}));

import {
  _resetActionClassRegistryForTests,
  registerActionClass,
} from "@kinetiks/tools";

import {
  buildJudgeUserPrompt,
  parseJudgeConfidence,
  realLLMJudge,
  summarizeActionInputForJudge,
} from "../llm-judge";

beforeEach(() => {
  vi.clearAllMocks();
  _resetActionClassRegistryForTests();
  registerActionClass({
    action_class: "kinetiks_id.send_slack_notification",
    source_app: "kinetiks_id",
    description: "Send a Slack notification on the customer's behalf.",
    constraint_schema: z.object({}),
    rate_limit_default: { count: 20, window: "day" },
    customer_template: "Send Slack notifications on your behalf.",
    available_in_default_standing_grants: true,
    always_requires_budget_attachment: false,
  });
});

describe("summarizeActionInputForJudge", () => {
  it("passes numbers/booleans, scrubs PII out of strings, and truncates", () => {
    const out = summarizeActionInputForJudge({
      count: 3,
      urgent: true,
      message: "Reach me at owner@acme.test or +1 (415) 555-0100 about the launch",
      long: "steady launch cadence ".repeat(25),
      channels: ["general", "alerts"],
      nested: { a: 1, b: 2 },
      skipped: null,
    });
    expect(out.count).toBe(3);
    expect(out.urgent).toBe(true);
    expect(String(out.message)).not.toContain("owner@acme.test");
    expect(String(out.message)).not.toContain("555-0100");
    expect(String(out.long)).toContain("(550 chars)");
    expect(out.channels_count).toBe(2);
    expect(out.channels_sample).toEqual(["general", "alerts"]);
    expect(out.nested_keys).toBe(2);
    expect(out).not.toHaveProperty("skipped");
  });
});

describe("parseJudgeConfidence", () => {
  it("parses a clean JSON object and clamps to [0,1]", () => {
    expect(parseJudgeConfidence('{"confidence": 0.73}')).toBe(0.73);
    expect(parseJudgeConfidence('{"confidence": 4}')).toBe(1);
    expect(parseJudgeConfidence('{"confidence": -1}')).toBe(0);
  });

  it("tolerates accidental code fences", () => {
    expect(parseJudgeConfidence('```json\n{"confidence": 0.5}\n```')).toBe(0.5);
  });

  it("rejects garbage, missing field, and non-numeric confidence", () => {
    expect(parseJudgeConfidence("not json")).toBeNull();
    expect(parseJudgeConfidence('{"verdict": "fine"}')).toBeNull();
    expect(parseJudgeConfidence('{"confidence": "high"}')).toBeNull();
  });
});

describe("realLLMJudge", () => {
  it("routes through the per-class judgment task and returns the parsed confidence", async () => {
    routeAskClaudeMock.mockResolvedValue('{"confidence": 0.82}');
    const result = await realLLMJudge.judge({
      account_id: "acc_1",
      action_class: "kinetiks_id.send_slack_notification",
      prompt_task: "judge.send_slack",
      action_input: { channels: ["general"], message: "hi team" },
    });
    expect(result).toEqual({ confidence: 0.82 });
    const [task, user] = routeAskClaudeMock.mock.calls[0];
    expect(task).toBe("authority.llm_judged.kinetiks_id.send_slack_notification");
    expect(user).toContain("judge.send_slack");
    expect(user).toContain("channels_count");
  });

  it("fails CLOSED (confidence 0) on unparseable output and reports to Sentry", async () => {
    routeAskClaudeMock.mockResolvedValue("I think this is fine!");
    const result = await realLLMJudge.judge({
      account_id: "acc_1",
      action_class: "kinetiks_id.send_slack_notification",
      prompt_task: "judge.send_slack",
      action_input: {},
    });
    expect(result).toEqual({ confidence: 0 });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ stage: "parse" }),
      }),
    );
  });

  it("never leaks raw recipient emails into the prompt", async () => {
    routeAskClaudeMock.mockResolvedValue('{"confidence": 0.9}');
    await realLLMJudge.judge({
      account_id: "acc_1",
      action_class: "kinetiks_id.send_slack_notification",
      prompt_task: "judge.send_slack",
      action_input: { to: "prospect@external.test", body: "hello prospect@external.test" },
    });
    const [, user, system] = routeAskClaudeMock.mock.calls[0];
    expect(String(user)).not.toContain("prospect@external.test");
    expect(String(system)).toContain('{"confidence"');
  });
});

describe("buildJudgeUserPrompt", () => {
  it("renders all four sections", () => {
    const prompt = buildJudgeUserPrompt({
      action_class: "kinetiks_id.send_slack_notification",
      class_description: "Send a Slack notification.",
      prompt_task: "judge.send_slack",
      constraints: { rate_limit_default: { count: 20, window: "day" } },
      redacted_input: { channels_count: 1 },
    });
    expect(prompt).toContain("# Action class");
    expect(prompt).toContain("# Evaluation focus");
    expect(prompt).toContain("# Permission constraints");
    expect(prompt).toContain("# Action input (redacted structural summary)");
  });
});
