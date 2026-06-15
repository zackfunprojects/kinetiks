import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
const { processApprovalDecisionMock } = vi.hoisted(() => ({
  processApprovalDecisionMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/approvals/learning-loop", () => ({
  processApprovalDecision: processApprovalDecisionMock,
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);

const APPROVAL_ID = "a1111111-0000-0000-0000-aaaaaaaaaaaa";

function makeRequest(body: unknown, raw = false): Request {
  return new Request("https://id.kinetiks.test/api/approvals/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

/**
 * Mock createAdminClient so the first fetch
 * (.select().eq(id).eq(account_id).single()) returns `approval`, and the
 * post-decision re-fetch (.select().eq(id).single()) returns `updated`.
 */
function stubAdmin(approval: unknown, updated: unknown) {
  const from = vi.fn(() => ({
    select: vi.fn(() => {
      const afterFirstEq = {
        // chain 1: scoped fetch — second .eq() then .single()
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: approval, error: null })),
        })),
        // chain 2: re-fetch updated — .single() directly after one .eq()
        single: vi.fn(async () => ({ data: updated, error: null })),
      };
      return { eq: vi.fn(() => afterFirstEq) };
    }),
  }));
  mockCreateAdmin.mockReturnValue({ from } as never);
}

function authOk() {
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1", user_id: "u-1", auth_method: "session" },
    error: null,
  } as never);
}

describe("POST /api/approvals/action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authOk();
  });

  it("returns the auth error when unauthorized", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireAuth.mockResolvedValue({
      auth: null,
      error: NextResponse.json({ success: false }, { status: 401 }),
    } as never);

    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "approve" }));
    expect(res.status).toBe(401);
    expect(processApprovalDecisionMock).not.toHaveBeenCalled();
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(makeRequest("not json{", true));
    expect(res.status).toBe(400);
  });

  it("400s when approval_id or action is missing", async () => {
    const res = await POST(makeRequest({ action: "approve" }));
    expect(res.status).toBe(400);
  });

  it("400s on an action that is not approve/reject", async () => {
    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "maybe" }));
    expect(res.status).toBe(400);
  });

  it("400s when rejecting without a reason", async () => {
    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "reject" }));
    expect(res.status).toBe(400);
    expect(processApprovalDecisionMock).not.toHaveBeenCalled();
  });

  it("404s when the approval is not in the caller's account (cross-tenant)", async () => {
    // The route scopes the fetch by account_id; another tenant's approval
    // resolves to null → 404, and no decision is processed.
    stubAdmin(null, null);
    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "approve" }));
    expect(res.status).toBe(404);
    expect(processApprovalDecisionMock).not.toHaveBeenCalled();
  });

  it("400s when the approval is not pending", async () => {
    stubAdmin({ id: APPROVAL_ID, account_id: "acc-1", status: "approved" }, null);
    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "approve" }));
    expect(res.status).toBe(400);
    expect(processApprovalDecisionMock).not.toHaveBeenCalled();
  });

  it("processes a valid approve and returns the updated record", async () => {
    const pending = { id: APPROVAL_ID, account_id: "acc-1", status: "pending" };
    const updated = { id: APPROVAL_ID, account_id: "acc-1", status: "approved" };
    stubAdmin(pending, updated);

    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "approve" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("approved");
    expect(processApprovalDecisionMock).toHaveBeenCalledOnce();
    expect(processApprovalDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: APPROVAL_ID, status: "pending" }),
      expect.objectContaining({ approval_id: APPROVAL_ID, action: "approve" })
    );
  });

  it("500s when processApprovalDecision throws", async () => {
    stubAdmin({ id: APPROVAL_ID, account_id: "acc-1", status: "pending" }, null);
    processApprovalDecisionMock.mockRejectedValueOnce(new Error("ledger write failed"));
    const res = await POST(makeRequest({ approval_id: APPROVAL_ID, action: "approve" }));
    expect(res.status).toBe(500);
  });
});
