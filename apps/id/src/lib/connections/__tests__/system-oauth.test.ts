import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@kinetiks/lib/env", () => ({
  serverEnv: () => ({
    NEXT_PUBLIC_APP_URL: "https://id.kinetiks.test",
    GOOGLE_WORKSPACE_CLIENT_ID: "google-client-id",
    GOOGLE_WORKSPACE_CLIENT_SECRET: "google-client-secret",
    SLACK_CLIENT_ID: "slack-client-id",
    SLACK_CLIENT_SECRET: "slack-client-secret",
  }),
}));

import {
  buildAuthorizeUrl,
  createOauthState,
  emailFromGoogleIdToken,
  exchangeCodeForCredentials,
  oauthStateCookieName,
  oauthStateMatches,
  revokeSystemCredentials,
  SystemOAuthError,
  systemOauthRedirectUri,
} from "../system-oauth";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeIdToken(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(payload)}.signature`;
}

describe("oauth state", () => {
  it("generates 64-hex-char states and matches in constant time", () => {
    const state = createOauthState();
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(oauthStateMatches(state, state)).toBe(true);
    expect(oauthStateMatches(state, createOauthState())).toBe(false);
    expect(oauthStateMatches(undefined, state)).toBe(false);
    expect(oauthStateMatches(state, null)).toBe(false);
    expect(oauthStateMatches(state, state.slice(0, 32))).toBe(false);
  });

  it("derives a per-provider cookie name", () => {
    expect(oauthStateCookieName("slack")).toBe("kt_sysconn_state_slack");
    expect(oauthStateCookieName("google_workspace")).toBe(
      "kt_sysconn_state_google_workspace",
    );
  });
});

describe("redirect uri", () => {
  it("prefers NEXT_PUBLIC_APP_URL over the request origin", () => {
    expect(
      systemOauthRedirectUri("slack", "http://localhost:3000/api/connections/system/slack/start"),
    ).toBe("https://id.kinetiks.test/api/connections/system/slack/callback");
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds the Google URL with offline access, forced consent, and openid email", () => {
    const url = new URL(
      buildAuthorizeUrl({
        provider: "google_workspace",
        redirectUri: "https://id.kinetiks.test/api/connections/system/google_workspace/callback",
        state: "st4te",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("st4te");
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("gmail.send");
    expect(scope).toContain("openid");
    expect(scope).toContain("email");
  });

  it("builds the calendar URL with calendar scopes on the same Google client", () => {
    const url = new URL(
      buildAuthorizeUrl({
        provider: "calendar",
        redirectUri: "https://id.kinetiks.test/api/connections/system/calendar/callback",
        state: "s",
      }),
    );
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("calendar.events");
    expect(scope).not.toContain("gmail");
  });

  it("builds the Slack URL with comma-joined bot scopes", () => {
    const url = new URL(
      buildAuthorizeUrl({
        provider: "slack",
        redirectUri: "https://id.kinetiks.test/api/connections/system/slack/callback",
        state: "s",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("slack-client-id");
    expect(url.searchParams.get("scope")).toContain("chat:write,");
  });
});

describe("emailFromGoogleIdToken", () => {
  it("extracts the email claim", () => {
    expect(emailFromGoogleIdToken(fakeIdToken({ email: "kit@acme.test" }))).toBe(
      "kit@acme.test",
    );
  });

  it("returns null on garbage", () => {
    expect(emailFromGoogleIdToken(undefined)).toBeNull();
    expect(emailFromGoogleIdToken("not-a-jwt")).toBeNull();
    expect(emailFromGoogleIdToken("a.b")).toBeNull();
    expect(emailFromGoogleIdToken(`x.${Buffer.from("not-json").toString("base64url")}.y`)).toBeNull();
    expect(emailFromGoogleIdToken(fakeIdToken({}))).toBeNull();
  });
});

describe("exchangeCodeForCredentials — google", () => {
  it("normalizes a happy-path exchange into the dispatcher credential shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: "ya29.short-lived",
        refresh_token: "1//refresh",
        scope:
          "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify openid email",
        token_type: "Bearer",
        expires_in: 3599,
        id_token: fakeIdToken({ email: "kit@acme.test" }),
      }),
    );

    const result = await exchangeCodeForCredentials({
      provider: "google_workspace",
      code: "auth-code",
      redirectUri: "https://id.kinetiks.test/cb",
    });

    expect(result.credentials).toEqual({
      refresh_token: "1//refresh",
      scopes: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "openid",
        "email",
      ],
      email: "kit@acme.test",
    });
    expect(result.metadata).toEqual({ connected_email: "kit@acme.test" });
    expect(result.detail).toBe("kit@acme.test");
    // The credentials object is the ONLY place a token appears.
    expect(JSON.stringify(result.metadata)).not.toContain("refresh");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = String((init as RequestInit).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=auth-code");
  });

  it("throws missing_refresh_token when Google omits the refresh token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "ya29.x", token_type: "Bearer", expires_in: 3599 }),
    );
    await expect(
      exchangeCodeForCredentials({
        provider: "google_workspace",
        code: "c",
        redirectUri: "https://id.kinetiks.test/cb",
      }),
    ).rejects.toMatchObject({ code: "missing_refresh_token" });
  });

  it("throws exchange_rejected on an OAuth error response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 400));
    await expect(
      exchangeCodeForCredentials({
        provider: "calendar",
        code: "c",
        redirectUri: "https://id.kinetiks.test/cb",
      }),
    ).rejects.toMatchObject({ code: "exchange_rejected", status: 400 });
  });

  it("throws malformed_response on non-JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>nope</html>", { status: 200 }));
    await expect(
      exchangeCodeForCredentials({
        provider: "google_workspace",
        code: "c",
        redirectUri: "https://id.kinetiks.test/cb",
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });
});

describe("exchangeCodeForCredentials — slack", () => {
  it("normalizes a happy-path exchange", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        access_token: "xoxb-bot-token",
        token_type: "bot",
        scope: "chat:write,im:write",
        bot_user_id: "U0BOT",
        team: { id: "T0TEAM", name: "Acme" },
        authed_user: { id: "U0OWNER" },
      }),
    );

    const result = await exchangeCodeForCredentials({
      provider: "slack",
      code: "slack-code",
      redirectUri: "https://id.kinetiks.test/cb",
    });

    expect(result.credentials).toEqual({
      bot_token: "xoxb-bot-token",
      scopes: ["chat:write", "im:write"],
      bot_user_id: "U0BOT",
      team_id: "T0TEAM",
      team_name: "Acme",
      installer_user_id: "U0OWNER",
    });
    expect(result.metadata).toEqual({
      team_id: "T0TEAM",
      team_name: "Acme",
      bot_user_id: "U0BOT",
      installer_user_id: "U0OWNER",
    });
    expect(result.detail).toBe("Workspace: Acme");
    expect(JSON.stringify(result.metadata)).not.toContain("xoxb");
  });

  it("throws exchange_rejected when Slack returns ok:false (even with HTTP 200)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: "invalid_code" }, 200));
    await expect(
      exchangeCodeForCredentials({
        provider: "slack",
        code: "bad",
        redirectUri: "https://id.kinetiks.test/cb",
      }),
    ).rejects.toMatchObject({ code: "exchange_rejected" });
  });

  it("throws malformed_response when ok:true carries no token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(
      exchangeCodeForCredentials({
        provider: "slack",
        code: "c",
        redirectUri: "https://id.kinetiks.test/cb",
      }),
    ).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("maps a network failure to exchange_http_error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      exchangeCodeForCredentials({
        provider: "slack",
        code: "c",
        redirectUri: "https://id.kinetiks.test/cb",
      }),
    ).rejects.toMatchObject({ code: "exchange_http_error" });
    expect(new SystemOAuthError("exchange_http_error", "x").name).toBe("SystemOAuthError");
  });
});

describe("revokeSystemCredentials", () => {
  it("revokes a Google grant via the revoke endpoint", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const outcome = await revokeSystemCredentials({
      provider: "google_workspace",
      credentials: { refresh_token: "1//refresh" },
    });
    expect(outcome).toBe("revoked");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(String((init as RequestInit).body)).toContain("token=");
  });

  it("revokes a Slack bot token via auth.revoke", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, revoked: true }));
    const outcome = await revokeSystemCredentials({
      provider: "slack",
      credentials: { bot_token: "xoxb-token" },
    });
    expect(outcome).toBe("revoked");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/auth.revoke");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer xoxb-token",
    });
  });

  it("skips when the credential blob has no token, fails soft on upstream errors", async () => {
    expect(
      await revokeSystemCredentials({ provider: "slack", credentials: {} }),
    ).toBe("skipped");

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: "token_revoked" }));
    expect(
      await revokeSystemCredentials({
        provider: "slack",
        credentials: { bot_token: "xoxb" },
      }),
    ).toBe("failed");

    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    expect(
      await revokeSystemCredentials({
        provider: "google_workspace",
        credentials: { refresh_token: "r" },
      }),
    ).toBe("failed");
  });
});
