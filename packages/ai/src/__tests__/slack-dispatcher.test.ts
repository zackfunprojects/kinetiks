import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetSlackDispatcherForTests,
  configureSlackCredentialSource,
  dispatchSlackMessage,
} from "../slack-dispatcher";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  _resetSlackDispatcherForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSlackDispatcherForTests();
});

const INPUT = {
  account_id: "acc-1",
  channel: "C-acme",
  body: "Reply rates recovered to 7.1% this week.",
};

describe("dispatchSlackMessage", () => {
  it("fails closed with configuration_error when no credential source is wired", async () => {
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      name: "ToolError",
      errorClass: "configuration_error",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a missing connection to unavailable", async () => {
    configureSlackCredentialSource(async () => null);
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a credential-source crash to transient", async () => {
    configureSlackCredentialSource(async () => {
      throw new Error("db down");
    });
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "transient",
    });
  });

  it("posts with the per-account token and the named-identity username override", async () => {
    configureSlackCredentialSource(async (accountId) => {
      expect(accountId).toBe("acc-1");
      return { bot_token: "xoxb-per-account", post_as_name: "Kit" };
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, ts: "1700000000.000100", channel: "C-acme" }),
    );

    const result = await dispatchSlackMessage({ ...INPUT, thread_ts: "1699.000001" });

    expect(result).toEqual({ ts: "1700000000.000100", channel: "C-acme" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer xoxb-per-account",
    });
    const payload = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      channel: "C-acme",
      text: INPUT.body,
      thread_ts: "1699.000001",
      username: "Kit",
    });
    expect(payload.blocks).toBeUndefined();
  });

  it("omits the username override when no system name is resolved", async () => {
    configureSlackCredentialSource(async () => ({ bot_token: "xoxb-x", post_as_name: null }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, ts: "1.2", channel: "C" }));

    await dispatchSlackMessage(INPUT);

    const payload = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect("username" in payload).toBe(false);
  });

  it("passes Block Kit blocks through with body as notification fallback", async () => {
    configureSlackCredentialSource(async () => ({ bot_token: "xoxb-x" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, ts: "1.2", channel: "C" }));

    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "*hello*" } }];
    await dispatchSlackMessage({ ...INPUT, blocks });

    const payload = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(payload.blocks).toEqual(blocks);
    expect(payload.text).toBe(INPUT.body);
  });

  it("classifies HTTP 429/5xx as transient and other 4xx as permanent", async () => {
    configureSlackCredentialSource(async () => ({ bot_token: "xoxb-x" }));

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "30" }));
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "transient",
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "transient",
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 403));
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "permanent",
    });
  });

  it("maps Slack ok:false tags (rate_limited transient, others permanent), no body in context", async () => {
    configureSlackCredentialSource(async () => ({ bot_token: "xoxb-x" }));

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: "rate_limited" }));
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "transient",
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: "channel_not_found" }));
    const err = await dispatchSlackMessage(INPUT).catch((e: unknown) => e);
    expect(err).toMatchObject({ errorClass: "permanent" });
    // PII rule: error context never carries the message body.
    expect(JSON.stringify((err as { context?: unknown }).context ?? {})).not.toContain(
      "recovered to 7.1%",
    );
  });

  it("rejects a success payload missing ts/channel", async () => {
    configureSlackCredentialSource(async () => ({ bot_token: "xoxb-x" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(dispatchSlackMessage(INPUT)).rejects.toMatchObject({
      errorClass: "permanent",
    });
  });
});
