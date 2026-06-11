import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: vi.fn(() => ({ SLACK_SIGNING_SECRET: "test-signing-secret" })),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
}));

const { processSlackEventMock, runAfterResponseMock } = vi.hoisted(() => ({
  processSlackEventMock: vi.fn(async () => "replied" as const),
  runAfterResponseMock: vi.fn((work: Promise<unknown>) => {
    void work.catch(() => undefined);
  }),
}));
vi.mock("@/lib/slack/inbound", () => ({
  processSlackEvent: processSlackEventMock,
}));
vi.mock("@/lib/utils/wait-until", () => ({
  runAfterResponse: runAfterResponseMock,
}));

import { serverEnv } from "@kinetiks/lib/env";
import { POST } from "./route";

const mockServerEnv = vi.mocked(serverEnv);

const SECRET = "test-signing-secret";

function signedRequest(body: string, opts?: { timestamp?: number; signature?: string }): Request {
  const timestamp = opts?.timestamp ?? Math.floor(Date.now() / 1000);
  const signature =
    opts?.signature ??
    `v0=${createHmac("sha256", SECRET).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  return new Request("https://id.kinetiks.test/api/slack/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": signature,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockServerEnv.mockReturnValue({ SLACK_SIGNING_SECRET: SECRET } as never);
});

describe("POST /api/slack/events", () => {
  it("answers the url_verification handshake with the challenge", async () => {
    const res = await POST(
      signedRequest(JSON.stringify({ type: "url_verification", challenge: "ch4llenge" })),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ challenge: "ch4llenge" });
  });

  it("rejects an invalid signature with 401 and never processes", async () => {
    const res = await POST(
      signedRequest(JSON.stringify({ type: "event_callback" }), {
        signature: "v0=deadbeef",
      }),
    );
    expect(res.status).toBe(401);
    expect(runAfterResponseMock).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp (replay) with 401", async () => {
    const res = await POST(
      signedRequest(JSON.stringify({ type: "event_callback" }), {
        timestamp: Math.floor(Date.now() / 1000) - 600,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("treats a missing signing secret as a configuration error: 500 + Sentry", async () => {
    mockServerEnv.mockReturnValue({} as never);
    const res = await POST(signedRequest(JSON.stringify({ type: "event_callback" })));
    expect(res.status).toBe(500);
  });

  it("acks an event_callback immediately and processes after the response", async () => {
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T0TEAM",
      event_id: "Ev0001",
      event: { type: "app_mention", text: "<@U0BOT> hi", channel: "C1", ts: "1.2", user: "U1" },
    });
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(runAfterResponseMock).toHaveBeenCalledTimes(1);
    expect(processSlackEventMock).toHaveBeenCalledWith({
      teamId: "T0TEAM",
      eventId: "Ev0001",
      event: expect.objectContaining({ type: "app_mention" }),
    });
  });

  it("acks-and-ignores non-event payloads and malformed callbacks", async () => {
    const res = await POST(
      signedRequest(JSON.stringify({ type: "event_callback", team_id: "T0TEAM" })),
    );
    expect(res.status).toBe(200);
    expect(runAfterResponseMock).not.toHaveBeenCalled();

    const res2 = await POST(signedRequest(JSON.stringify({ type: "app_rate_limited" })));
    expect(res2.status).toBe(200);
  });

  it("400s non-JSON bodies that carry a valid signature", async () => {
    const res = await POST(signedRequest("not-json"));
    expect(res.status).toBe(400);
  });
});
