import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: vi.fn(() => ({
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM_EMAIL: "notifications@kinetiks.test",
  })),
}));

const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }));
vi.mock("@/lib/connections/google-workspace-token", () => ({
  getGoogleWorkspaceAccessToken: getTokenMock,
}));

import { serverEnv } from "@kinetiks/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOwnerEmail,
  sendSystemEmail,
  SYSTEM_EMAIL_DAILY_CAP,
} from "../sender";

const mockCreateAdmin = vi.mocked(createAdminClient);
const mockServerEnv = vi.mocked(serverEnv);

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface AdminStubOptions {
  ownerEmail?: string;
  sentInWindow?: number;
  workspaceStatus?: string | null;
  systemName?: string | null;
  ledgerError?: { message: string } | null;
}

function stubAdmin(options: AdminStubOptions = {}) {
  const ledger: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    if (table === "kinetiks_accounts") {
      const maybeSingle = vi.fn(async () => ({
        data: { user_id: "user-1", system_name: options.systemName ?? "Kit" },
        error: null,
      }));
      const eq = vi.fn(() => ({ maybeSingle }));
      return { select: vi.fn(() => ({ eq })) };
    }
    if (table === "kinetiks_ledger") {
      return {
        select: vi.fn(() => {
          const gte = vi.fn(async () => ({
            count: options.sentInWindow ?? 0,
            error: null,
          }));
          const eqType = vi.fn(() => ({ gte }));
          const eqAccount = vi.fn(() => ({ eq: eqType }));
          return { eq: eqAccount };
        }),
        insert: vi.fn((row: Record<string, unknown>) => {
          ledger.push(row);
          return Promise.resolve({ error: options.ledgerError ?? null });
        }),
      };
    }
    // kinetiks_connections
    const maybeSingle = vi.fn(async () => ({
      data:
        options.workspaceStatus === null
          ? null
          : { status: options.workspaceStatus ?? "active" },
      error: null,
    }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const eqProvider = vi.fn(() => ({ neq }));
    const eqAccount = vi.fn(() => ({ eq: eqProvider }));
    return { select: vi.fn(() => ({ eq: eqAccount })) };
  });

  const auth = {
    admin: {
      getUserById: vi.fn(async () => ({
        data: { user: { email: options.ownerEmail ?? "Owner@Acme.test" } },
        error: null,
      })),
    },
  };

  mockCreateAdmin.mockReturnValue({ from, auth } as never);
  return { ledger };
}

const BASE_INPUT = {
  account_id: "acc-1",
  to: ["owner@acme.test"],
  subject: "Daily Brief",
  text: "All quiet on the funnel front.",
  kind: "brief" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mockServerEnv.mockReturnValue({
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM_EMAIL: "notifications@kinetiks.test",
  } as never);
  getTokenMock.mockResolvedValue({
    access_token: "ya29.x",
    token_type: "Bearer",
    expires_in: 3599,
    connected_email: "kit@acme.test",
  });
});

describe("resolveOwnerEmail", () => {
  it("returns the owner's auth email lowercased", async () => {
    stubAdmin({ ownerEmail: "Owner@Acme.test" });
    await expect(resolveOwnerEmail("acc-1")).resolves.toBe("owner@acme.test");
  });
});

describe("sendSystemEmail — safeguards", () => {
  it("rejects recipients outside the internal policy without sending", async () => {
    stubAdmin({});
    await expect(
      sendSystemEmail({ ...BASE_INPUT, to: ["prospect@external.test"] }),
    ).rejects.toMatchObject({ errorClass: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the 20-per-24h cap from ledger counts", async () => {
    stubAdmin({ sentInWindow: SYSTEM_EMAIL_DAILY_CAP });
    await expect(sendSystemEmail(BASE_INPUT)).rejects.toMatchObject({
      errorClass: "rate_limited",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the owner address case-insensitively", async () => {
    stubAdmin({ ownerEmail: "OWNER@ACME.TEST" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "gmail-msg-1" }));
    await expect(sendSystemEmail(BASE_INPUT)).resolves.toMatchObject({
      provider: "gmail",
    });
  });
});

describe("sendSystemEmail — gmail path", () => {
  it("sends through the google_workspace connection as the named identity", async () => {
    const { ledger } = stubAdmin({ systemName: "Kit" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "gmail-msg-1" }));

    const result = await sendSystemEmail({ ...BASE_INPUT, html: "<p>hi</p>" });

    expect(result).toEqual({ provider: "gmail", message_id: "gmail-msg-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    const payload = JSON.parse(String((init as RequestInit).body)) as { raw: string };
    const decoded = Buffer.from(
      payload.raw.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    expect(decoded).toContain('From: "Kit" <kit@acme.test>');
    expect(decoded).toContain("multipart/alternative");

    // Ledger entry: PII-free detail.
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      event_type: "system_email_sent",
      detail: {
        kind: "brief",
        provider: "gmail",
        recipient_count: 1,
        subject_length: BASE_INPUT.subject.length,
        body_length: BASE_INPUT.text.length,
      },
    });
    expect(JSON.stringify(ledger[0])).not.toContain("owner@acme.test");
    expect(JSON.stringify(ledger[0])).not.toContain("funnel front");
  });

  it("surfaces a loud error when the email left but the ledger write failed", async () => {
    stubAdmin({ ledgerError: { message: "constraint violated" } });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "gmail-msg-1" }));
    await expect(sendSystemEmail(BASE_INPUT)).rejects.toMatchObject({
      errorClass: "internal_error",
    });
  });
});

describe("sendSystemEmail — resend fallback", () => {
  it("falls back to Resend with the honest via-Kinetiks identity when no workspace connection", async () => {
    stubAdmin({ workspaceStatus: null, systemName: "Kit" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "resend-msg-1" }));

    const result = await sendSystemEmail(BASE_INPUT);

    expect(result).toEqual({ provider: "resend", message_id: "resend-msg-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(payload.from).toBe("Kit via Kinetiks <notifications@kinetiks.test>");
    expect(payload.to).toEqual(["owner@acme.test"]);
  });

  it("sanitizes control characters out of the Resend from identity (CR)", async () => {
    stubAdmin({ workspaceStatus: null, systemName: "Kit\r\nBcc: attacker@evil.test" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "resend-msg-2" }));

    await sendSystemEmail(BASE_INPUT);

    const payload = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body),
    ) as Record<string, unknown>;
    expect(String(payload.from)).not.toContain("\r");
    expect(String(payload.from)).not.toContain("\n");
    expect(String(payload.from)).toContain("via Kinetiks <notifications@kinetiks.test>");
  });

  it("maps unavailable when neither workspace nor Resend is configured", async () => {
    stubAdmin({ workspaceStatus: null });
    mockServerEnv.mockReturnValue({} as never);
    await expect(sendSystemEmail(BASE_INPUT)).rejects.toMatchObject({
      errorClass: "unavailable",
    });
  });

  it("classifies Resend HTTP failures (429 transient)", async () => {
    stubAdmin({ workspaceStatus: null });
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "slow down" }, 429));
    await expect(sendSystemEmail(BASE_INPUT)).rejects.toMatchObject({
      errorClass: "transient",
    });
  });
});
