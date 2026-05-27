import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dispatchSlackMessageMock } = vi.hoisted(() => ({
  dispatchSlackMessageMock: vi.fn(),
}));

vi.mock("@/lib/slack/dispatch", () => ({
  dispatchSlackMessage: dispatchSlackMessageMock,
}));

import { ToolError } from "@kinetiks/tools";

import { sendSlackNotificationTool } from "../send-slack-notification";

beforeEach(() => {
  dispatchSlackMessageMock.mockReset();
});

afterEach(() => {
  dispatchSlackMessageMock.mockReset();
});

const ctx = {
  accountId: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  teamScopeId: null,
  invokedByAgent: "marcus",
  correlationId: null,
  threadId: null,
  agentRunId: "run_test",
  parentAiCallId: null,
  proposalId: null,
  approvalId: null,
  grantId: null,
  patternId: null,
  metadata: {},
  signal: undefined,
};

describe("send_slack_notification tool", () => {
  it("declares the action class and is consequential", () => {
    expect(sendSlackNotificationTool.actionClass).toBe(
      "kinetiks_id.send_slack_notification",
    );
    expect(sendSlackNotificationTool.isConsequential).toBe(true);
    // Always-queue (the resolver / approval pipeline decides whether
    // to auto-approve via a grant or per-tool flow).
    expect(sendSlackNotificationTool.autoApproveThreshold).toBeNull();
  });

  it("derives an idempotency key from the channels + length + body prefix", () => {
    const key = sendSlackNotificationTool.idempotencyKeyFrom?.({
      channels: ["C3", "C1", "C2"],
      message_length: 100,
      body: "hello world this is the start of the message body that is long",
    });
    // Channels sorted, length, first 32 chars of body.
    expect(key).toBe(
      "C1,C2,C3:100:hello world this is the start of",
    );
  });

  it("posts once per channel and returns the aggregated results", async () => {
    dispatchSlackMessageMock
      .mockResolvedValueOnce({ channel: "C-acme", ts: "1700000000.000100" })
      .mockResolvedValueOnce({ channel: "C-leads", ts: "1700000000.000200" });

    const result = await sendSlackNotificationTool.execute(
      {
        channels: ["C-acme", "C-leads"],
        message_length: 42,
        body: "Dashboard updated.",
      },
      ctx,
    );

    expect(result).toEqual({
      posts: [
        { channel: "C-acme", ts: "1700000000.000100" },
        { channel: "C-leads", ts: "1700000000.000200" },
      ],
      count: 2,
    });
    expect(dispatchSlackMessageMock).toHaveBeenCalledTimes(2);
    expect(dispatchSlackMessageMock).toHaveBeenNthCalledWith(1, {
      channel: "C-acme",
      body: "Dashboard updated.",
      thread_ts: undefined,
    });
  });

  it("propagates a dispatcher ToolError unchanged", async () => {
    dispatchSlackMessageMock.mockRejectedValueOnce(
      new ToolError("permanent", "channel_not_found", {
        context: { tool: "send_slack_notification", channel: "C-bogus" },
      }),
    );
    await expect(
      sendSlackNotificationTool.execute(
        { channels: ["C-bogus"], message_length: 10, body: "ping" },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
