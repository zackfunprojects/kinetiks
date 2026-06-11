import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
}));
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test" }),
}));

const { decisionMock, resolveTeamMock, credentialsMock } = vi.hoisted(() => ({
  decisionMock: vi.fn(),
  resolveTeamMock: vi.fn(),
  credentialsMock: vi.fn(),
}));
vi.mock("@/lib/approvals/learning-loop", () => ({
  processApprovalDecision: decisionMock,
}));
vi.mock("@/lib/slack/inbound", () => ({
  resolveAccountBySlackTeam: resolveTeamMock,
}));
vi.mock("@/lib/comms/slack-credential-source", () => ({
  resolveSlackSendCredentials: credentialsMock,
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  openRejectReasonModal,
  processApprovalApprove,
  processRejectSubmission,
} from "../interactive";

const mockCreateAdmin = vi.mocked(createAdminClient);
const fetchMock = vi.fn<typeof fetch>();

function stubApprovalRead(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const eqAccount = vi.fn(() => ({ maybeSingle }));
  const eqId = vi.fn(() => ({ eq: eqAccount }));
  const select = vi.fn(() => ({ eq: eqId }));
  mockCreateAdmin.mockReturnValue({ from: vi.fn(() => ({ select })) } as never);
  return { eqAccount };
}

const PENDING = {
  id: "appr-1",
  account_id: "acc-1",
  status: "pending",
  title: "Send the Acme follow-up",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  resolveTeamMock.mockResolvedValue("acc-1");
  credentialsMock.mockResolvedValue({ bot_token: "xoxb-x", post_as_name: "Kit" });
  decisionMock.mockResolvedValue(undefined);
});

describe("processApprovalApprove", () => {
  it("approves through the shared decision path and replaces the card", async () => {
    stubApprovalRead(PENDING);

    const outcome = await processApprovalApprove({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/1",
    });

    expect(outcome).toBe("approved");
    expect(decisionMock).toHaveBeenCalledWith(PENDING, {
      approval_id: "appr-1",
      action: "approve",
      edits: null,
      rejection_reason: null,
    });
    // Card replaced via response_url.
    const updateCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://hooks.slack.test/resp/1",
    );
    expect(updateCall).toBeTruthy();
    const body = JSON.parse(String((updateCall![1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.replace_original).toBe(true);
    expect(String(body.text)).toContain("Approved");
  });

  it("scopes the approval read to the team's account (cross-tenant ids read as not_found)", async () => {
    resolveTeamMock.mockResolvedValue("acc-2");
    const { eqAccount } = stubApprovalRead(null);

    const outcome = await processApprovalApprove({
      teamId: "T0OTHER",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/1",
    });

    expect(outcome).toBe("not_found");
    expect(eqAccount).toHaveBeenCalledWith("account_id", "acc-2");
    expect(decisionMock).not.toHaveBeenCalled();
  });

  it("treats a double-click as already_decided without re-deciding", async () => {
    stubApprovalRead({ ...PENDING, status: "approved" });
    const outcome = await processApprovalApprove({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/1",
    });
    expect(outcome).toBe("already_decided");
    expect(decisionMock).not.toHaveBeenCalled();
  });

  it("returns failed (captured) when the decision path throws", async () => {
    stubApprovalRead(PENDING);
    decisionMock.mockRejectedValueOnce(new Error("calibration exploded"));
    const outcome = await processApprovalApprove({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/1",
    });
    expect(outcome).toBe("failed");
  });
});

describe("openRejectReasonModal", () => {
  it("opens views.open with the account's bot token and the approval in private_metadata", async () => {
    stubApprovalRead(PENDING);

    const outcome = await openRejectReasonModal({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      triggerId: "trig-1",
      responseUrl: "https://hooks.slack.test/resp/1",
    });

    expect(outcome).toBe("reject_modal_opened");
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "https://slack.com/api/views.open",
    );
    expect(call).toBeTruthy();
    const init = call![1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer xoxb-x" });
    const body = JSON.parse(String(init.body)) as {
      trigger_id: string;
      view: { callback_id: string; private_metadata: string };
    };
    expect(body.trigger_id).toBe("trig-1");
    expect(body.view.callback_id).toBe("approval_reject_reason");
    expect(JSON.parse(body.view.private_metadata)).toMatchObject({
      approval_id: "appr-1",
      response_url: "https://hooks.slack.test/resp/1",
    });
  });

  it("fails soft when views.open is rejected", async () => {
    stubApprovalRead(PENDING);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "invalid_trigger" }), { status: 200 }),
    );
    const outcome = await openRejectReasonModal({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      triggerId: "trig-stale",
      responseUrl: "https://hooks.slack.test/resp/1",
    });
    expect(outcome).toBe("failed");
  });
});

describe("processRejectSubmission", () => {
  it("rejects with the typed reason through the shared decision path", async () => {
    stubApprovalRead(PENDING);

    const outcome = await processRejectSubmission({
      teamId: "T0TEAM",
      approvalId: "appr-1",
      responseUrl: "https://hooks.slack.test/resp/1",
      reason: "Wrong audience for this message.",
    });

    expect(outcome).toBe("rejected");
    expect(decisionMock).toHaveBeenCalledWith(PENDING, {
      approval_id: "appr-1",
      action: "reject",
      edits: null,
      rejection_reason: "Wrong audience for this message.",
    });
  });
});
