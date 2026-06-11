import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test",
    GOOGLE_WORKSPACE_CLIENT_ID: "google-client-id",
    GOOGLE_WORKSPACE_CLIENT_SECRET: "google-client-secret",
    SLACK_CLIENT_ID: "slack-client-id",
    SLACK_CLIENT_SECRET: "slack-client-secret",
  }),
}));

const { exchangeMock } = vi.hoisted(() => ({ exchangeMock: vi.fn() }));
vi.mock("@/lib/connections/system-oauth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/connections/system-oauth")>();
  return { ...original, exchangeCodeForCredentials: exchangeMock };
});

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { decryptCredentials } from "@/lib/connections/encryption";
import { SystemOAuthError } from "@/lib/connections/system-oauth";
import { GET } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);
const mockCapture = vi.mocked(captureException);

const STATE = "a".repeat(64);

beforeAll(() => {
  // Real AES-256-GCM in this suite: the assertion that matters is
  // that what lands in the credentials column decrypts back to the
  // exchange result (i.e. it was actually encrypted, not plaintext).
  process.env.KINETIKS_ENCRYPTION_KEY = "ab".repeat(32);
});

function makeRequest(provider: string, query: Record<string, string>, cookieState?: string): Request {
  const url = new URL(`https://id.kinetiks.test/api/connections/system/${provider}/callback`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers = new Headers();
  if (cookieState) {
    headers.set("cookie", `kt_sysconn_state_${provider}=${cookieState}`);
  }
  return new Request(url, { headers });
}

function routeParams(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

interface AdminStubOptions {
  existing?: { id: string; status: string } | null;
  insertError?: { code: string; message: string } | null;
}

function stubAdmin(options: AdminStubOptions = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const ledger: Array<Record<string, unknown>> = [];

  const from = vi.fn((table: string) => {
    if (table === "kinetiks_ledger") {
      return {
        insert: vi.fn((row: Record<string, unknown>) => {
          ledger.push(row);
          return Promise.resolve({ error: null });
        }),
      };
    }
    // kinetiks_connections
    const maybeSingleExisting = vi.fn(async () => ({
      data: options.existing ?? null,
      error: null,
    }));
    const limit = vi.fn(() => ({ maybeSingle: maybeSingleExisting }));
    const order = vi.fn(() => ({ limit }));
    const neq = vi.fn(() => ({ order }));
    const eqProvider = vi.fn(() => ({ neq }));
    const eqAccount = vi.fn(() => ({ eq: eqProvider }));
    return {
      select: vi.fn(() => ({ eq: eqAccount })),
      insert: vi.fn((row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () =>
              options.insertError
                ? { data: null, error: options.insertError }
                : { data: { id: "conn-new" }, error: null },
            ),
          })),
        };
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        updated.push(patch);
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: options.existing?.id ?? "conn-upd" },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }),
    };
  });

  mockCreateAdmin.mockReturnValue({ from } as never);
  return { inserted, updated, ledger };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1" },
    error: null,
  } as never);
  exchangeMock.mockResolvedValue({
    credentials: { refresh_token: "1//refresh", scopes: ["s"], email: "kit@acme.test" },
    metadata: { connected_email: "kit@acme.test" },
    detail: "kit@acme.test",
  });
});

describe("GET /api/connections/system/[provider]/callback", () => {
  it("completes the dance: encrypts credentials, inserts the row, emits the ledger entry", async () => {
    const { inserted, ledger } = stubAdmin();

    const res = await GET(
      makeRequest("google_workspace", { code: "auth-code", state: STATE }, STATE),
      routeParams("google_workspace"),
    );

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("system_connect=success");
    expect(location).toContain("provider=google_workspace");

    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;
    expect(row.account_id).toBe("acc-1");
    expect(row.provider).toBe("google_workspace");
    expect(row.status).toBe("active");
    // The stored credentials are ciphertext, not plaintext...
    const stored = String(row.credentials);
    expect(stored).not.toContain("refresh");
    expect(stored).not.toContain("kit@acme.test");
    // ...and decrypt back to exactly what the exchange returned.
    expect(decryptCredentials(stored)).toEqual({
      refresh_token: "1//refresh",
      scopes: ["s"],
      email: "kit@acme.test",
    });
    // Metadata carries display fields only, no tokens.
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.connected_email).toBe("kit@acme.test");
    expect(meta.connected_via).toBe("direct_oauth");
    expect(JSON.stringify(meta)).not.toContain("refresh");

    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      account_id: "acc-1",
      event_type: "connection_created",
      detail: {
        connection_id: "conn-new",
        provider: "google_workspace",
        method: "direct_oauth",
        reauth: false,
      },
    });

    // The state cookie is cleared on the way out.
    expect(res.headers.get("set-cookie") ?? "").toContain("kt_sysconn_state_google_workspace=;");
  });

  it("updates the existing live row on re-auth instead of inserting", async () => {
    const { inserted, updated, ledger } = stubAdmin({
      existing: { id: "conn-old", status: "error" },
    });

    const res = await GET(
      makeRequest("google_workspace", { code: "auth-code", state: STATE }, STATE),
      routeParams("google_workspace"),
    );

    expect(res.headers.get("location") ?? "").toContain("system_connect=success");
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.status).toBe("active");
    expect(ledger[0]!.detail).toMatchObject({ reauth: true, connection_id: "conn-old" });
  });

  it("rejects a state mismatch without calling the token endpoint", async () => {
    stubAdmin();

    const res = await GET(
      makeRequest("google_workspace", { code: "auth-code", state: "b".repeat(64) }, STATE),
      routeParams("google_workspace"),
    );

    expect(res.headers.get("location") ?? "").toContain("system_connect=error");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalled();
  });

  it("rejects when the state cookie is missing entirely", async () => {
    stubAdmin();

    const res = await GET(
      makeRequest("google_workspace", { code: "auth-code", state: STATE }),
      routeParams("google_workspace"),
    );

    expect(res.headers.get("location") ?? "").toContain("system_connect=error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("treats a consent denial as a calm non-error", async () => {
    stubAdmin();

    const res = await GET(
      makeRequest("slack", { error: "access_denied", state: STATE }, STATE),
      routeParams("slack"),
    );

    expect(res.headers.get("location") ?? "").toContain("system_connect=denied");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("maps an exchange failure to the error banner and captures it", async () => {
    stubAdmin();
    exchangeMock.mockRejectedValueOnce(
      new SystemOAuthError("exchange_rejected", "Google token exchange rejected (invalid_grant)"),
    );

    const res = await GET(
      makeRequest("google_workspace", { code: "bad", state: STATE }, STATE),
      routeParams("google_workspace"),
    );

    expect(res.headers.get("location") ?? "").toContain("system_connect=error");
    expect(mockCapture).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        extra: expect.objectContaining({ oauth_error_code: "exchange_rejected" }),
      }),
    );
  });

  it("maps the unique-index race (23505) to already_connected", async () => {
    stubAdmin({ insertError: { code: "23505", message: "duplicate key value" } });

    const res = await GET(
      makeRequest("google_workspace", { code: "auth-code", state: STATE }, STATE),
      routeParams("google_workspace"),
    );

    expect(res.headers.get("location") ?? "").toContain("system_connect=already_connected");
  });
});
