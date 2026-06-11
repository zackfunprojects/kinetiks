import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PATCH } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);

const SCHEDULE_ID = "0b6f9a3e-8f1c-4f4e-9d8a-2b7c6e5d4f3a";

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/marcus/schedules/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stubAdmin(updatedRows: Array<{ id: string; enabled: boolean }>) {
  const eqAccount = vi.fn(() => ({
    select: vi.fn(async () => ({ data: updatedRows, error: null })),
  }));
  const eqId = vi.fn(() => ({ eq: eqAccount }));
  const update = vi.fn(() => ({ eq: eqId }));
  mockCreateAdmin.mockReturnValue({
    from: vi.fn(() => ({ update })),
  } as never);
  return { update, eqId, eqAccount };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1" },
    error: null,
  } as never);
});

describe("PATCH /api/marcus/schedules/[id]", () => {
  it("toggles a schedule the caller owns", async () => {
    const { eqAccount } = stubAdmin([{ id: SCHEDULE_ID, enabled: false }]);

    const res = await PATCH(makeRequest({ enabled: false }), {
      params: Promise.resolve({ id: SCHEDULE_ID }),
    });

    expect(res.status).toBe(200);
    // The update is scoped to the caller's account - the ownership guard.
    expect(eqAccount).toHaveBeenCalledWith("account_id", "acc-1");
  });

  it("returns 404 when the schedule belongs to another account (zero rows)", async () => {
    stubAdmin([]);

    const res = await PATCH(makeRequest({ enabled: true }), {
      params: Promise.resolve({ id: SCHEDULE_ID }),
    });

    expect(res.status).toBe(404);
  });

  it("rejects a non-uuid id before touching the database", async () => {
    const { update } = stubAdmin([]);

    const res = await PATCH(makeRequest({ enabled: true }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a body without a boolean enabled", async () => {
    const { update } = stubAdmin([]);

    const res = await PATCH(makeRequest({ enabled: "yes" }), {
      params: Promise.resolve({ id: SCHEDULE_ID }),
    });

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
