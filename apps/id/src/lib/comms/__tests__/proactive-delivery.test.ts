import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { dispatchMock } = vi.hoisted(() => ({ dispatchMock: vi.fn() }));
vi.mock("@kinetiks/ai/slack-dispatcher", () => ({
  dispatchSlackMessage: dispatchMock,
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { createInAppAlert, deliverSlackDm } from "../proactive-delivery";

const mockCreateAdmin = vi.mocked(createAdminClient);

function stubAdmin(options: {
  slackMetadata?: Record<string, unknown> | null;
  alertInsertError?: { message: string } | null;
}) {
  const alerts: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_marcus_alerts") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          alerts.push(row);
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                options.alertInsertError
                  ? { data: null, error: options.alertInsertError }
                  : { data: { id: "alert-1" }, error: null },
              ),
            })),
          };
        }),
      };
    }
    // kinetiks_connections
    const maybeSingle = vi.fn(async () => ({
      data:
        options.slackMetadata === null
          ? null
          : { metadata: options.slackMetadata ?? {}, status: "active" },
      error: null,
    }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eqStatus = vi.fn(() => ({ order }));
    const eqProvider = vi.fn(() => ({ eq: eqStatus }));
    const eqAccount = vi.fn(() => ({ eq: eqProvider }));
    return { select: vi.fn(() => ({ eq: eqAccount })) };
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
  return { alerts };
}

beforeEach(() => {
  vi.clearAllMocks();
  dispatchMock.mockResolvedValue({ ts: "1.2", channel: "D0DM" });
});

describe("deliverSlackDm", () => {
  it("DMs the installer through the named-identity dispatcher", async () => {
    stubAdmin({ slackMetadata: { installer_user_id: "U0OWNER" } });

    const outcome = await deliverSlackDm({
      account_id: "acc-1",
      body: "Daily Brief\n\nPipeline steady.",
    });

    expect(outcome).toBe("sent");
    expect(dispatchMock).toHaveBeenCalledWith({
      account_id: "acc-1",
      channel: "U0OWNER",
      body: "Daily Brief\n\nPipeline steady.",
      blocks: undefined,
    });
  });

  it("reports unavailable without dispatching when no connection or installer mapping exists", async () => {
    stubAdmin({ slackMetadata: null });
    expect(await deliverSlackDm({ account_id: "acc-1", body: "x" })).toBe("unavailable");

    stubAdmin({ slackMetadata: {} });
    expect(await deliverSlackDm({ account_id: "acc-1", body: "x" })).toBe("unavailable");
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("propagates dispatch failures to the caller", async () => {
    stubAdmin({ slackMetadata: { installer_user_id: "U0OWNER" } });
    dispatchMock.mockRejectedValueOnce(new Error("channel_not_found"));
    await expect(deliverSlackDm({ account_id: "acc-1", body: "x" })).rejects.toThrow(
      "channel_not_found",
    );
  });
});

describe("createInAppAlert", () => {
  it("writes the alert row and returns the id", async () => {
    const { alerts } = stubAdmin({});
    const id = await createInAppAlert({
      account_id: "acc-1",
      title: "Daily Brief",
      body: "Pipeline steady.",
      severity: "info",
      trigger_type: "gap",
      delivered_via: ["in_app", "email"],
    });
    expect(id).toBe("alert-1");
    expect(alerts[0]).toMatchObject({
      account_id: "acc-1",
      title: "Daily Brief",
      severity: "info",
      source_app: "kinetiks_id",
      delivered_via: ["in_app", "email"],
    });
  });

  it("throws on insert failure so callers report the leg honestly", async () => {
    stubAdmin({ alertInsertError: { message: "constraint violated" } });
    await expect(
      createInAppAlert({
        account_id: "acc-1",
        title: "t",
        body: "b",
        severity: "info",
        trigger_type: "gap",
        delivered_via: ["in_app"],
      }),
    ).rejects.toThrow("alert insert failed");
  });
});
