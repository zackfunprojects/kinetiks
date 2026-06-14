import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/observability/sentry", () => ({
  captureException: captureExceptionMock,
}));

import { requireAuth } from "@/lib/auth/require-auth";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

const mockRequireAuth = vi.mocked(requireAuth);
const mockCreateClient = vi.mocked(createClient);

function makeRequest(): Request {
  return new Request("https://id.kinetiks.test/api/health");
}

type Claims = Record<string, unknown> | undefined;

/** Build a minimal supabase server client stub whose getClaims is controlled. */
function stubClient(getClaims: () => Promise<{ data: { claims: Claims } | null }>) {
  return { auth: { getClaims } } as unknown as ReturnType<typeof createClient>;
}

function authOk(account_id: string, method: "session" | "api_key" = "session") {
  return {
    auth: { account_id, user_id: "u-1", auth_method: method },
    error: null,
  } as unknown as Awaited<ReturnType<typeof requireAuth>>;
}

async function jwtBlock(res: NextResponse) {
  const body = (await res.json()) as {
    data: { jwt: { applicable: boolean; claim_present: boolean; claim_matches_db: boolean } };
  };
  return body.data.jwt;
}

describe("GET /api/health — JWT account_id claim assertion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the auth error when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      auth: null,
      error: NextResponse.json({ success: false }, { status: 401 }),
    } as unknown as Awaited<ReturnType<typeof requireAuth>>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("session + claim present and matching DB → claim_present + claim_matches_db", async () => {
    mockRequireAuth.mockResolvedValue(authOk("acc-1"));
    mockCreateClient.mockReturnValue(
      stubClient(async () => ({ data: { claims: { account_id: "acc-1" } } }))
    );

    const jwt = await jwtBlock(await GET(makeRequest()));
    expect(jwt).toEqual({ applicable: true, claim_present: true, claim_matches_db: true });
  });

  it("session + claim present but mismatched DB → present, not matching", async () => {
    mockRequireAuth.mockResolvedValue(authOk("acc-1"));
    mockCreateClient.mockReturnValue(
      stubClient(async () => ({ data: { claims: { account_id: "acc-OTHER" } } }))
    );

    const jwt = await jwtBlock(await GET(makeRequest()));
    expect(jwt).toEqual({ applicable: true, claim_present: true, claim_matches_db: false });
  });

  it("session + claim absent → not present (hook not registered yet)", async () => {
    mockRequireAuth.mockResolvedValue(authOk("acc-1"));
    mockCreateClient.mockReturnValue(
      stubClient(async () => ({ data: { claims: {} } }))
    );

    const jwt = await jwtBlock(await GET(makeRequest()));
    expect(jwt).toEqual({ applicable: true, claim_present: false, claim_matches_db: false });
  });

  it("session + getClaims throws → reported as not present, never throws", async () => {
    mockRequireAuth.mockResolvedValue(authOk("acc-1"));
    mockCreateClient.mockReturnValue(
      stubClient(async () => {
        throw new Error("network");
      })
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const jwt = await jwtBlock(res);
    expect(jwt).toEqual({ applicable: true, claim_present: false, claim_matches_db: false });
    expect(captureExceptionMock).toHaveBeenCalledOnce();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({
          route: "/api/health",
          action: "account_claim_check",
          app: "id",
        }),
      })
    );
  });

  it("non-session auth (api_key) → not applicable, no token inspected", async () => {
    mockRequireAuth.mockResolvedValue(authOk("acc-1", "api_key"));

    const jwt = await jwtBlock(await GET(makeRequest()));
    expect(jwt).toEqual({ applicable: false, claim_present: false, claim_matches_db: false });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
