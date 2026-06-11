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
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test",
    GOOGLE_WORKSPACE_CLIENT_ID: "google-client-id",
    GOOGLE_WORKSPACE_CLIENT_SECRET: "google-client-secret",
    SLACK_CLIENT_ID: undefined,
    SLACK_CLIENT_SECRET: undefined,
  }),
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateAdmin = vi.mocked(createAdminClient);

function makeRequest(provider: string): Request {
  return new Request(`https://id.kinetiks.test/api/connections/system/${provider}/start`);
}

function routeParams(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

function stubExistingLookup(row: { id: string; status: string } | null, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const neq = vi.fn(() => ({ order }));
  const eqProvider = vi.fn(() => ({ neq }));
  const eqAccount = vi.fn(() => ({ eq: eqProvider }));
  const select = vi.fn(() => ({ eq: eqAccount }));
  mockCreateAdmin.mockReturnValue({ from: vi.fn(() => ({ select })) } as never);
  return { eqAccount, neq };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    auth: { account_id: "acc-1" },
    error: null,
  } as never);
});

describe("GET /api/connections/system/[provider]/start", () => {
  it("redirects to the Google authorize URL and sets the state cookie", async () => {
    stubExistingLookup(null);

    const res = await GET(makeRequest("google_workspace"), routeParams("google_workspace"));

    expect(res.status).toBeGreaterThanOrEqual(302);
    expect(res.status).toBeLessThan(400);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain("access_type=offline");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("kt_sysconn_state_google_workspace=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    // The state in the URL matches the cookie value.
    const state = new URL(location).searchParams.get("state");
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(setCookie).toContain(state as string);
  });

  it("scopes the existing-connection check to the caller's account", async () => {
    const { eqAccount, neq } = stubExistingLookup(null);
    await GET(makeRequest("calendar"), routeParams("calendar"));
    expect(eqAccount).toHaveBeenCalledWith("account_id", "acc-1");
    expect(neq).toHaveBeenCalledWith("status", "revoked");
  });

  it("bounces an already-active connection back with a banner", async () => {
    stubExistingLookup({ id: "conn-1", status: "active" });

    const res = await GET(makeRequest("google_workspace"), routeParams("google_workspace"));

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/cortex/integrations");
    expect(location).toContain("system_connect=already_connected");
  });

  it("allows re-auth when the existing row is in error state", async () => {
    stubExistingLookup({ id: "conn-1", status: "error" });

    const res = await GET(makeRequest("google_workspace"), routeParams("google_workspace"));

    expect(res.headers.get("location") ?? "").toContain("accounts.google.com");
  });

  it("redirects unknown providers back with an error banner", async () => {
    stubExistingLookup(null);

    const res = await GET(makeRequest("hubspot"), routeParams("hubspot"));

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("system_connect=error");
  });

  it("reports not_configured when the deployment lacks the provider's OAuth client", async () => {
    stubExistingLookup(null);

    const res = await GET(makeRequest("slack"), routeParams("slack"));

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("system_connect=not_configured");
    expect(location).toContain("provider=slack");
  });

  it("bounces an unauthenticated browser through login", async () => {
    mockRequireAuth.mockResolvedValue({
      auth: null,
      error: new Response(null, { status: 401 }),
    } as never);

    const res = await GET(makeRequest("google_workspace"), routeParams("google_workspace"));

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("redirect=%2Fcortex%2Fintegrations");
  });
});
