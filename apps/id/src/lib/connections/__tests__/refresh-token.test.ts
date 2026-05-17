import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We mock the underlying manager + oauth modules so withFreshToken can
// be exercised without a live Supabase instance or live token endpoints.
vi.mock("../manager", () => ({
  ensureFreshToken: vi.fn(),
  getDecryptedCredentials: vi.fn(),
  updateConnectionCredentials: vi.fn(),
  updateConnectionStatus: vi.fn(),
}));

vi.mock("../oauth", () => ({
  refreshAccessToken: vi.fn(),
}));

import {
  ensureFreshToken,
  getDecryptedCredentials,
  updateConnectionCredentials,
  updateConnectionStatus,
} from "../manager";
import { refreshAccessToken } from "../oauth";
import { TokenRejectedError, withFreshToken } from "../refresh-token";

const mockEnsureFreshToken = vi.mocked(ensureFreshToken);
const mockGetDecryptedCredentials = vi.mocked(getDecryptedCredentials);
const mockUpdateConnectionCredentials = vi.mocked(updateConnectionCredentials);
const mockUpdateConnectionStatus = vi.mocked(updateConnectionStatus);
const mockRefreshAccessToken = vi.mocked(refreshAccessToken);

const admin = {} as Parameters<typeof withFreshToken>[0];
const baseConnection = {
  id: "conn-1",
  account_id: "acc-1",
  provider: "ga4",
  status: "active",
  credentials: { encrypted: "..." },
  last_sync_at: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
} as unknown as Parameters<typeof withFreshToken>[1];

const oauthCreds = (overrides: Partial<{ access_token: string; refresh_token: string; expires_at: number }> = {}) => ({
  type: "oauth" as const,
  access_token: overrides.access_token ?? "token-A",
  refresh_token: overrides.refresh_token ?? "refresh-A",
  expires_at: overrides.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  token_type: "Bearer",
  scope: "analytics.readonly",
});

beforeEach(() => {
  mockEnsureFreshToken.mockReset();
  mockGetDecryptedCredentials.mockReset();
  mockUpdateConnectionCredentials.mockReset();
  mockUpdateConnectionStatus.mockReset();
  mockRefreshAccessToken.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("withFreshToken - happy path", () => {
  it("returns fn() result when token is fresh and fn succeeds", async () => {
    mockGetDecryptedCredentials.mockReturnValue(oauthCreds());
    mockEnsureFreshToken.mockResolvedValue(oauthCreds());

    const fn = vi.fn().mockResolvedValue({ ok: true, data: 42 });
    const result = await withFreshToken(admin, baseConnection, fn);

    expect(result).toEqual({ ok: true, data: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(mockUpdateConnectionStatus).not.toHaveBeenCalled();
  });
});

describe("withFreshToken - force refresh on 401", () => {
  it("force-refreshes on TokenRejectedError and retries fn once", async () => {
    mockGetDecryptedCredentials.mockReturnValue(oauthCreds());
    mockEnsureFreshToken.mockResolvedValue(oauthCreds({ access_token: "token-A" }));
    mockRefreshAccessToken.mockResolvedValue({
      access_token: "token-B",
      refresh_token: "refresh-B",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "Bearer",
      scope: "analytics.readonly",
    });
    mockUpdateConnectionCredentials.mockResolvedValue();

    let calls = 0;
    const fn = vi.fn().mockImplementation(async (creds) => {
      calls++;
      if (calls === 1) throw new TokenRejectedError("ga4", { httpStatus: 401 });
      return { token_used: creds.access_token };
    });

    const result = await withFreshToken(admin, baseConnection, fn);

    expect(result).toEqual({ token_used: "token-B" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockRefreshAccessToken).toHaveBeenCalledExactlyOnceWith("ga4", "refresh-A");
    expect(mockUpdateConnectionCredentials).toHaveBeenCalledExactlyOnceWith(
      admin,
      "conn-1",
      expect.objectContaining({ access_token: "token-B", refresh_token: "refresh-B" })
    );
    expect(mockUpdateConnectionStatus).not.toHaveBeenCalled();
  });

  it("marks connection 'error' when force refresh itself fails", async () => {
    mockGetDecryptedCredentials.mockReturnValue(oauthCreds());
    mockEnsureFreshToken.mockResolvedValue(oauthCreds());
    mockRefreshAccessToken.mockRejectedValue(new Error("invalid_grant"));
    mockUpdateConnectionStatus.mockResolvedValue();

    const fn = vi.fn().mockRejectedValue(new TokenRejectedError("ga4", { httpStatus: 401 }));

    await expect(withFreshToken(admin, baseConnection, fn)).rejects.toBeInstanceOf(
      TokenRejectedError
    );

    expect(mockUpdateConnectionStatus).toHaveBeenCalledWith(
      admin,
      "conn-1",
      "error",
      expect.stringContaining("Token refresh failed")
    );
  });

  it("marks connection 'error' when fn rejects on retry too", async () => {
    mockGetDecryptedCredentials.mockReturnValue(oauthCreds());
    mockEnsureFreshToken.mockResolvedValue(oauthCreds());
    mockRefreshAccessToken.mockResolvedValue({
      access_token: "token-B",
      refresh_token: "refresh-A",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "Bearer",
      scope: null,
    });
    mockUpdateConnectionCredentials.mockResolvedValue();
    mockUpdateConnectionStatus.mockResolvedValue();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TokenRejectedError("ga4", { httpStatus: 401 }))
      .mockRejectedValueOnce(new TokenRejectedError("ga4", { httpStatus: 401 }));

    await expect(withFreshToken(admin, baseConnection, fn)).rejects.toBeInstanceOf(
      TokenRejectedError
    );

    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockUpdateConnectionStatus).toHaveBeenCalledWith(
      admin,
      "conn-1",
      "error",
      expect.stringContaining("reauthorization")
    );
  });

  it("throws cleanly with no refresh token", async () => {
    mockGetDecryptedCredentials.mockReturnValue(oauthCreds({ refresh_token: "" }));
    mockEnsureFreshToken.mockResolvedValue(oauthCreds({ refresh_token: "" }));
    mockUpdateConnectionStatus.mockResolvedValue();

    const fn = vi.fn().mockRejectedValue(new TokenRejectedError("ga4", { httpStatus: 401 }));

    await expect(withFreshToken(admin, baseConnection, fn)).rejects.toBeInstanceOf(
      TokenRejectedError
    );
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });
});

describe("withFreshToken - non-401 errors propagate", () => {
  it("does not retry on a non-TokenRejectedError", async () => {
    mockGetDecryptedCredentials.mockReturnValue(oauthCreds());
    mockEnsureFreshToken.mockResolvedValue(oauthCreds());

    const fn = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(withFreshToken(admin, baseConnection, fn)).rejects.toThrow("network down");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(mockUpdateConnectionStatus).not.toHaveBeenCalled();
  });
});

describe("withFreshToken - non-OAuth connections", () => {
  it("throws synchronously when called on a non-OAuth connection", async () => {
    mockGetDecryptedCredentials.mockReturnValue({
      type: "api_key",
      api_key: "sk_test_xxx",
    } as ReturnType<typeof getDecryptedCredentials>);

    await expect(
      withFreshToken(admin, baseConnection, async () => "never")
    ).rejects.toThrow("non-OAuth");
  });
});
