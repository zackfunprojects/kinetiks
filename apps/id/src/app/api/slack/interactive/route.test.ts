import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: vi.fn(() => ({ SLACK_SIGNING_SECRET: "test-signing-secret" })),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
}));

const {
  approveMock,
  openModalMock,
  rejectSubmitMock,
  runAfterResponseMock,
} = vi.hoisted(() => ({
  approveMock: vi.fn(async () => "approved" as const),
  openModalMock: vi.fn(async () => "reject_modal_opened" as const),
  rejectSubmitMock: vi.fn(async () => "rejected" as const),
  runAfterResponseMock: vi.fn((work: Promise<unknown>) => {
    void work.catch(() => undefined);
  }),
}));
vi.mock("@/lib/slack/interactive", () => ({
  processApprovalApprove: approveMock,
  openRejectReasonModal: openModalMock,
  processRejectSubmission: rejectSubmitMock,
}));
vi.mock("@/lib/utils/wait-until", () => ({
  runAfterResponse: runAfterResponseMock,
}));

import { POST } from "./route";

const SECRET = "test-signing-secret";

function signedFormRequest(payload: unknown): Request {
  const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `v0=${createHmac("sha256", SECRET)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
  return new Request("https://id.kinetiks.test/api/slack/interactive", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": signature,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/slack/interactive", () => {
  it("rejects unsigned payloads", async () => {
    const body = new URLSearchParams({ payload: "{}" }).toString();
    const res = await POST(
      new Request("https://id.kinetiks.test/api/slack/interactive", {
        method: "POST",
        body,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("routes the Approve button through the shared decision path after the ack", async () => {
    const res = await POST(
      signedFormRequest({
        type: "block_actions",
        team: { id: "T0TEAM" },
        response_url: "https://hooks.slack.test/resp/123",
        actions: [{ action_id: "approval_approve", value: "appr-1" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(runAfterResponseMock).toHaveBeenCalledTimes(1);
    expect(approveMock).toHaveBeenCalledWith({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/123",
    });
  });

  it("opens the reject modal inside the request (trigger_id expires in 3s)", async () => {
    const res = await POST(
      signedFormRequest({
        type: "block_actions",
        team: { id: "T0TEAM" },
        trigger_id: "trig-1",
        response_url: "https://hooks.slack.test/resp/123",
        actions: [{ action_id: "approval_reject", value: "appr-1" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(openModalMock).toHaveBeenCalledWith({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      triggerId: "trig-1",
      responseUrl: "https://hooks.slack.test/resp/123",
    });
    // Synchronous: not deferred behind the ack.
    expect(runAfterResponseMock).not.toHaveBeenCalled();
  });

  it("processes the reject-reason submission and closes the modal", async () => {
    const res = await POST(
      signedFormRequest({
        type: "view_submission",
        team: { id: "T0TEAM" },
        view: {
          callback_id: "approval_reject_reason",
          private_metadata: JSON.stringify({
            approval_id: "appr-1",
            response_url: "https://hooks.slack.test/resp/123",
          }),
          state: {
            values: {
              reason_block: { reason: { value: "Wrong audience for this message." } },
            },
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(rejectSubmitMock).toHaveBeenCalledWith({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/123",
      reason: "Wrong audience for this message.",
    });
  });

  it("keeps the modal open with a validation error when the reason is empty", async () => {
    const res = await POST(
      signedFormRequest({
        type: "view_submission",
        team: { id: "T0TEAM" },
        view: {
          callback_id: "approval_reject_reason",
          private_metadata: JSON.stringify({
            approval_id: "appr-1",
            response_url: "https://hooks.slack.test/resp/123",
          }),
          state: { values: { reason_block: { reason: { value: "   " } } } },
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.response_action).toBe("errors");
    expect(rejectSubmitMock).not.toHaveBeenCalled();
  });

  it("acks-and-ignores unknown actions and teamless payloads", async () => {
    const res = await POST(
      signedFormRequest({
        type: "block_actions",
        team: { id: "T0TEAM" },
        response_url: "https://hooks.slack.test/resp/123",
        actions: [{ action_id: "something_else", value: "x" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(approveMock).not.toHaveBeenCalled();

    const res2 = await POST(signedFormRequest({ type: "block_actions" }));
    expect(res2.status).toBe(200);
  });
});
