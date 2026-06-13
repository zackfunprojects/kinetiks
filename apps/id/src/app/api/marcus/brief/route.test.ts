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
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test" }),
}));
vi.mock("@kinetiks/ai", () => ({
  askClaude: vi.fn(async () => "Pipeline steady. Reply rates up 0.8pt.\n\nFocus today: the Acme thread."),
}));
vi.mock("@/lib/marcus/context-assembly", () => ({
  assembleContext: vi.fn(async () => "context"),
}));
vi.mock("@/lib/ai/prompts/marcus-brief", () => ({
  buildDailyBriefPrompt: vi.fn(() => "prompt"),
  buildWeeklyDigestPrompt: vi.fn(async () => "prompt"),
  buildMonthlyReviewPrompt: vi.fn(async () => "prompt"),
}));

const { sendSystemEmailMock, resolveOwnerEmailMock, deliverSlackDmMock, createInAppAlertMock } = vi.hoisted(() => ({
  sendSystemEmailMock: vi.fn(),
  resolveOwnerEmailMock: vi.fn(),
  deliverSlackDmMock: vi.fn(),
  createInAppAlertMock: vi.fn(),
}));
vi.mock("@/lib/email/sender", () => ({
  sendSystemEmail: sendSystemEmailMock,
  resolveOwnerEmail: resolveOwnerEmailMock,
}));
vi.mock("@/lib/cortex/authority/digest", () => ({
  buildAuthorityActivitySummary: vi.fn(async () => null),
}));
vi.mock("@/lib/comms/proactive-delivery", () => ({
  deliverSlackDm: deliverSlackDmMock,
  createInAppAlert: createInAppAlertMock,
}));

import { ToolError } from "@kinetiks/tools";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);

function makeRequest(body: unknown): Request {
  return new Request("https://id.kinetiks.test/api/marcus/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stubAdmin(options: { channel?: string | null; scheduleError?: boolean }) {
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_marcus_schedules") {
      const maybeSingle = vi.fn(async () => ({
        data:
          options.scheduleError || options.channel === null
            ? null
            : { channel: options.channel ?? "email" },
        error: options.scheduleError ? { message: "db down" } : null,
      }));
      const eqType = vi.fn(() => ({ maybeSingle }));
      const eqAccount = vi.fn(() => ({ eq: eqType }));
      return { select: vi.fn(() => ({ eq: eqAccount })) };
    }
    if (table === "kinetiks_accounts") {
      const maybeSingle = vi.fn(async () => ({
        data: { system_name: "Kit" },
        error: null,
      }));
      const eq = vi.fn(() => ({ maybeSingle }));
      return { select: vi.fn(() => ({ eq })) };
    }
    // getRecentActivity tables (proposals / ledger / confidence...):
    // a permissive chain that resolves to empty rows however it ends.
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "limit"]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.single = vi.fn(async () => ({ data: null, error: null }));
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    (chain as { then?: unknown }).then = (
      resolve: (v: typeof result) => unknown,
    ) => Promise.resolve(result).then(resolve);
    return chain;
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1", auth_method: "session" },
    error: null,
  } as never);
  resolveOwnerEmailMock.mockResolvedValue("owner@acme.test");
  sendSystemEmailMock.mockResolvedValue({ provider: "gmail", message_id: "m1" });
  deliverSlackDmMock.mockResolvedValue("sent");
  createInAppAlertMock.mockResolvedValue("alert-1");
});

describe("POST /api/marcus/brief — delivery (D2)", () => {
  it("preview-only without deliver (pre-D2 behavior unchanged)", async () => {
    stubAdmin({});
    const res = await POST(makeRequest({ type: "daily_brief" }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: Record<string, unknown> };
    expect(payload.data.content).toContain("Pipeline steady");
    expect(payload.data.delivery).toBeUndefined();
    expect(sendSystemEmailMock).not.toHaveBeenCalled();
  });

  it("deliver:true sends the rendered brief to the owner via the system sender", async () => {
    stubAdmin({ channel: "email" });
    const res = await POST(makeRequest({ type: "daily_brief", deliver: true }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery).toEqual({
      email: "sent",
      slack: "skipped",
      in_app: "created",
    });
    // The in-app alert is the brief itself, with the actually-sent
    // channels on the record.
    expect(createInAppAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        title: "Daily Brief",
        severity: "info",
        delivered_via: ["in_app", "email"],
      }),
    );

    expect(sendSystemEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendSystemEmailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.account_id).toBe("acc-1");
    expect(sent.to).toEqual(["owner@acme.test"]);
    expect(sent.kind).toBe("brief");
    expect(String(sent.subject)).toContain("Daily Brief");
    expect(String(sent.html)).toContain("Pipeline steady");
    // AI prose is escaped into the HTML shell.
    expect(String(sent.html)).toContain("<p");
  });

  it("slack-only schedules DM the customer as the named system (D4)", async () => {
    stubAdmin({ channel: "slack" });
    const res = await POST(makeRequest({ type: "weekly_digest", deliver: true }));
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery).toEqual({
      email: "skipped",
      slack: "sent",
      in_app: "created",
    });
    expect(sendSystemEmailMock).not.toHaveBeenCalled();
    expect(deliverSlackDmMock).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "acc-1" }),
    );
    const dm = deliverSlackDmMock.mock.calls[0]![0] as { body: string };
    expect(dm.body).toContain("Weekly Digest");
    expect(dm.body).toContain("Pipeline steady");
  });

  it("reports unavailable when the workspace has no installer mapping", async () => {
    stubAdmin({ channel: "slack" });
    deliverSlackDmMock.mockResolvedValueOnce("unavailable");
    const res = await POST(makeRequest({ type: "weekly_digest", deliver: true }));
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery.slack).toBe("unavailable");
  });

  it("channel both delivers every leg", async () => {
    stubAdmin({ channel: "both" });
    const res = await POST(makeRequest({ type: "daily_brief", deliver: true }));
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery).toEqual({
      email: "sent",
      slack: "sent",
      in_app: "created",
    });
    expect(createInAppAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({ delivered_via: ["in_app", "email", "slack"] }),
    );
  });

  it("isolates leg failures: a slack crash never blocks email or the alert", async () => {
    stubAdmin({ channel: "both" });
    deliverSlackDmMock.mockRejectedValueOnce(new Error("slack down"));
    const res = await POST(makeRequest({ type: "daily_brief", deliver: true }));
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery).toEqual({
      email: "sent",
      slack: "failed",
      in_app: "created",
    });
  });

  it("maps a sender failure to delivery.email=failed without failing the request", async () => {
    stubAdmin({ channel: "email" });
    sendSystemEmailMock.mockRejectedValueOnce(
      new ToolError("rate_limited", "cap reached", { context: {} }),
    );
    const res = await POST(makeRequest({ type: "daily_brief", deliver: true }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery.email).toBe("failed");
  });

  it("never defaults to email when the schedule lookup FAILS (CR)", async () => {
    stubAdmin({ scheduleError: true });
    const res = await POST(makeRequest({ type: "daily_brief", deliver: true }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery).toEqual({
      email: "failed",
      slack: "failed",
      in_app: "failed",
    });
    expect(sendSystemEmailMock).not.toHaveBeenCalled();
    expect(deliverSlackDmMock).not.toHaveBeenCalled();
  });

  it("defaults to the email leg when no schedule row exists", async () => {
    stubAdmin({ channel: null });
    const res = await POST(makeRequest({ type: "daily_brief", deliver: true }));
    const payload = (await res.json()) as { data: { delivery: Record<string, string> } };
    expect(payload.data.delivery.email).toBe("sent");
  });
});
