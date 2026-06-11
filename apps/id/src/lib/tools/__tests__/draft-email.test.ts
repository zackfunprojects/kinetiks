import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { draftEmailViaGoogleMock } = vi.hoisted(() => ({
  draftEmailViaGoogleMock: vi.fn(),
}));

vi.mock("@/lib/email/draft-via-google", () => ({
  draftEmailViaGoogle: draftEmailViaGoogleMock,
}));

import { ToolError } from "@kinetiks/tools";

import { draftEmailTool } from "../draft-email";

beforeEach(() => {
  draftEmailViaGoogleMock.mockReset();
});

afterEach(() => {
  draftEmailViaGoogleMock.mockReset();
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

describe("draft_email tool", () => {
  it("declares the action class and is consequential", () => {
    expect(draftEmailTool.actionClass).toBe("kinetiks_id.draft_email");
    expect(draftEmailTool.isConsequential).toBe(true);
    expect(draftEmailTool.autoApproveThreshold).toBeNull();
  });

  it("requires the google_workspace system connection (D1)", () => {
    expect(draftEmailTool.availability).toEqual({
      kind: "connection_required",
      provider: "google_workspace",
    });
  });

  it("derives an idempotency key from sorted recipients + subject prefix + body length", () => {
    const key = draftEmailTool.idempotencyKeyFrom?.({
      to: ["zoe@acme.com", "ann@acme.com"],
      max_recipients: 5,
      subject: "Q1 launch heads-up — Acme",
      body: "x".repeat(150),
      max_body_chars: 1000,
    });
    expect(key).toBe("ann@acme.com,zoe@acme.com:Q1 launch heads-up — Acme:150");
  });

  it("calls the dispatcher with normalized arguments and returns its result", async () => {
    draftEmailViaGoogleMock.mockResolvedValueOnce({
      draft_id: "draft_abc",
      message_id: "msg_xyz",
      provider: "google",
      from_email: "founder@acme.com",
    });

    const result = await draftEmailTool.execute(
      {
        to: ["ceo@example.com"],
        max_recipients: 5,
        subject: "Q1 launch update",
        body: "Here's the update on the Q1 launch.",
        max_body_chars: 1000,
      },
      ctx,
    );

    expect(result).toEqual({
      draft_id: "draft_abc",
      message_id: "msg_xyz",
      provider: "google",
      from_email: "founder@acme.com",
    });
    expect(draftEmailViaGoogleMock).toHaveBeenCalledWith({
      account_id: ctx.accountId,
      to: ["ceo@example.com"],
      cc: undefined,
      subject: "Q1 launch update",
      body: "Here's the update on the Q1 launch.",
      reply_to_thread_id: undefined,
    });
  });

  it("throws when accountId is missing on the execution context", async () => {
    await expect(
      draftEmailTool.execute(
        {
          to: ["ceo@example.com"],
          max_recipients: 5,
          subject: "x",
          body: "y",
          max_body_chars: 100,
        },
        { ...ctx, accountId: null as unknown as string },
      ),
    ).rejects.toThrow(/accountId missing/);
  });

  it("propagates a dispatcher ToolError unchanged", async () => {
    draftEmailViaGoogleMock.mockRejectedValueOnce(
      new ToolError("unavailable", "Google Workspace is not connected", {
        context: { tool: "draft_email", account_id: ctx.accountId },
      }),
    );
    await expect(
      draftEmailTool.execute(
        {
          to: ["a@b.com"],
          max_recipients: 1,
          subject: "x",
          body: "y",
          max_body_chars: 100,
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
