import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(async () => undefined),
}));

const { getTokenMock, intelligenceMock, emitInsightMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  intelligenceMock: vi.fn(),
  emitInsightMock: vi.fn(),
}));
vi.mock("@/lib/connections/google-workspace-token", () => ({
  getGoogleWorkspaceAccessToken: getTokenMock,
}));
vi.mock("@/lib/email/inbound-intelligence", () => ({
  extractInboundEmailIntelligence: intelligenceMock,
}));
vi.mock("@/lib/insights/emit", () => ({
  emitInsight: emitInsightMock,
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { extractPlainText, pollGmailInbox, senderDisplayName } from "../receive";

const mockCreateAdmin = vi.mocked(createAdminClient);
const fetchMock = vi.fn<typeof fetch>();

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface StubOptions {
  connection?: { id: string; metadata: Record<string, unknown>; status: string } | null;
  claimDuplicateKeys?: Set<string>;
}

function stubAdmin(options: StubOptions = {}) {
  const claims: Array<Record<string, unknown>> = [];
  const watermarkUpdates: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_inbound_events") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          claims.push(row);
          const duplicate = options.claimDuplicateKeys?.has(String(row.event_key));
          return Promise.resolve({
            error: duplicate ? { code: "23505", message: "duplicate" } : null,
          });
        }),
      };
    }
    // kinetiks_connections
    const maybeSingle = vi.fn(async () => ({
      data:
        options.connection === null
          ? null
          : (options.connection ?? {
              id: "conn-1",
              metadata: { gmail_poll_after: 1_781_000_000 },
              status: "active",
            }),
      error: null,
    }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eqStatus = vi.fn(() => ({ order }));
    const eqProvider = vi.fn(() => ({ eq: eqStatus }));
    const eqAccount = vi.fn(() => ({ eq: eqProvider }));
    return {
      select: vi.fn(() => ({ eq: eqAccount })),
      update: vi.fn((patch: Record<string, unknown>) => {
        watermarkUpdates.push(patch);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    };
  });
  mockCreateAdmin.mockReturnValue({ from } as never);
  return { claims, watermarkUpdates };
}

function gmailMessage(args: {
  id: string;
  from: string;
  subject: string;
  body: string;
  internalDate?: number;
}) {
  return {
    internalDate: String((args.internalDate ?? 1_781_100_000) * 1000),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: args.from },
        { name: "Subject", value: args.subject },
      ],
      parts: [{ mimeType: "text/plain", body: { data: b64url(args.body) } }],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getTokenMock.mockResolvedValue({
    access_token: "ya29.x",
    token_type: "Bearer",
    expires_in: 3599,
    connected_email: "kit@acme.test",
  });
  intelligenceMock.mockResolvedValue({
    relevant: true,
    category: "competitive_intel",
    summary: "Rival launched usage-based pricing.",
    action_items: [],
    entities: ["Rival"],
  });
  emitInsightMock.mockResolvedValue({ id: "insight-1" });
});

describe("extractPlainText", () => {
  it("digs the first text/plain part out of nested multiparts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("hello world") } },
            { mimeType: "text/html", body: { data: b64url("<p>hello</p>") } },
          ],
        },
      ],
    };
    expect(extractPlainText(payload)).toBe("hello world");
    expect(extractPlainText(undefined)).toBe("");
  });
});

describe("senderDisplayName", () => {
  it("extracts the display name and never returns the address", () => {
    expect(senderDisplayName('"Jane Doe" <jane@acme.test>')).toBe("Jane Doe");
    expect(senderDisplayName("Jane Doe <jane@acme.test>")).toBe("Jane Doe");
    expect(senderDisplayName("jane@acme.test")).toBe("jane");
    expect(senderDisplayName("")).toBe("Unknown sender");
  });
});

describe("pollGmailInbox", () => {
  it("polls past the watermark, claims each message, routes intelligence to insights", async () => {
    const { claims, watermarkUpdates } = stubAdmin();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "msg-1" }] }))
      .mockResolvedValueOnce(
        jsonResponse(
          gmailMessage({
            id: "msg-1",
            from: "Jane Doe <jane@rival.test>",
            subject: "Rival pricing page",
            body: "They moved to usage-based pricing. Reach me at jane@rival.test",
            internalDate: 1_781_200_000,
          }),
        ),
      );

    const result = await pollGmailInbox("acc-1");

    expect(result).toMatchObject({
      status: "polled",
      fetched: 1,
      processed: 1,
      relevant: 1,
      duplicates: 0,
    });
    // The list query carries the watermark + excludes our own sends.
    const listUrl = String(fetchMock.mock.calls[0]![0]);
    expect(listUrl).toContain("after%3A1781000000");
    expect(listUrl).toContain("-from%3Ame");
    // Claimed exactly-once under the gmail key.
    expect(claims[0]).toMatchObject({
      source: "gmail",
      event_key: "gmail:acc-1:msg-1",
    });
    // The watermark advanced to the newest internalDate.
    expect(watermarkUpdates[0]!.metadata).toMatchObject({
      gmail_poll_after: 1_781_200_000,
    });
    // Insight emitted on the analytics channel (no action items).
    expect(emitInsightMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        account_id: "acc-1",
        delivery_channel: "analytics",
        severity: "info",
      }),
    );
  });

  it("routes action-bearing mail to the chat channel", async () => {
    stubAdmin();
    intelligenceMock.mockResolvedValueOnce({
      relevant: true,
      category: "forwarded_thread",
      summary: "Buyer raised compliance concerns twice.",
      action_items: ["Send the SOC 2 report"],
      entities: ["Acme"],
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "msg-2" }] }))
      .mockResolvedValueOnce(
        jsonResponse(
          gmailMessage({
            id: "msg-2",
            from: "Rep <rep@own.test>",
            subject: "Fwd: Acme thread",
            body: "see below",
          }),
        ),
      );

    await pollGmailInbox("acc-1");

    expect(emitInsightMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        delivery_channel: "chat",
        severity: "notable",
        suggested_action: { description: "Send the SOC 2 report" },
      }),
    );
  });

  it("skips duplicates via the claim table without fetching the message", async () => {
    stubAdmin({ claimDuplicateKeys: new Set(["gmail:acc-1:msg-1"]) });
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: "msg-1" }] }));

    const result = await pollGmailInbox("acc-1");

    expect(result.duplicates).toBe(1);
    expect(result.processed).toBe(0);
    // Only the list call went out.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops irrelevant mail without emitting insights", async () => {
    stubAdmin();
    intelligenceMock.mockResolvedValueOnce({
      relevant: false,
      category: "other",
      summary: "",
      action_items: [],
      entities: [],
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "msg-3" }] }))
      .mockResolvedValueOnce(
        jsonResponse(
          gmailMessage({ id: "msg-3", from: "noreply@spam.test", subject: "WIN NOW", body: "spam" }),
        ),
      );

    const result = await pollGmailInbox("acc-1");
    expect(result.relevant).toBe(0);
    expect(emitInsightMock).not.toHaveBeenCalled();
  });

  it("reports no_connection when the account has no live workspace connection", async () => {
    stubAdmin({ connection: null });
    const result = await pollGmailInbox("acc-1");
    expect(result.status).toBe("no_connection");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates one bad message: the cycle continues and the claim stands", async () => {
    stubAdmin();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: "bad" }, { id: "good" }] }))
      .mockRejectedValueOnce(new TypeError("network blip"))
      .mockResolvedValueOnce(
        jsonResponse(
          gmailMessage({ id: "good", from: "a <a@b.test>", subject: "s", body: "b" }),
        ),
      );

    const result = await pollGmailInbox("acc-1");
    expect(result.processed).toBe(1);
    expect(result.relevant).toBe(1);
  });
});
