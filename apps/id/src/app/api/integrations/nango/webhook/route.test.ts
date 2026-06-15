import { beforeEach, describe, expect, it, vi } from "vitest";

// The webhook's security boundary is HMAC verification. Mock the verifier to
// drive the auth paths; stub the heavy downstream deps so the module loads
// without booting the real handler registrations / provider SDKs.
const { verifyMock, payloadSha256Mock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  payloadSha256Mock: vi.fn(() => "deadbeef"),
}));
vi.mock("@/lib/integrations/nango/webhook-verify", () => ({
  NANGO_SIGNATURE_HEADER: "x-nango-signature",
  verifyNangoSignature: verifyMock,
  payloadSha256: payloadSha256Mock,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/integrations/nango/handlers", () => ({ dispatchNangoSyncWebhook: vi.fn() }));
vi.mock("@/lib/integrations/nango/handlers/auth", () => ({ handleNangoAuthEvent: vi.fn() }));
vi.mock("@/lib/integrations/nango/handlers/boot", () => ({}));
vi.mock("@/lib/integrations/nango/sync-logs", () => ({
  isRecentReplay: vi.fn(async () => false),
  writeSyncLog: vi.fn(async () => undefined),
}));

import { POST } from "./route";

function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== undefined) headers["x-nango-signature"] = signature;
  return new Request("https://id.kinetiks.test/api/integrations/nango/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/integrations/nango/webhook — signature boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401s when the HMAC signature is invalid (the auth boundary)", async () => {
    verifyMock.mockReturnValue({ ok: false, reason: "signature_mismatch" });

    const res = await POST(makeRequest(JSON.stringify({ type: "sync" }), "bad"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; reason: string };
    expect(body.error).toBe("unauthorized");
    expect(body.reason).toBe("signature_mismatch");
  });

  it("401s when the signature header is missing", async () => {
    verifyMock.mockReturnValue({ ok: false, reason: "missing_signature" });

    const res = await POST(makeRequest(JSON.stringify({ type: "sync" })));
    expect(res.status).toBe(401);
  });

  it("400s on an authentic request whose body is not valid JSON", async () => {
    // Signature passes (verified against the raw bytes), but the body can't parse.
    verifyMock.mockReturnValue({ ok: true });

    const res = await POST(makeRequest("not-json{", "good-sig"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_body");
  });

  it("400s when an authentic body fails schema validation", async () => {
    verifyMock.mockReturnValue({ ok: true });

    // Valid JSON but missing the Nango webhook fields → schema rejects.
    const res = await POST(makeRequest(JSON.stringify({ not: "a webhook" }), "good-sig"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_body");
  });
});
