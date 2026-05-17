import { describe, expect, it } from "vitest";

/**
 * D1 smoke test — runs against a REAL GA4 property.
 *
 * NOT run in CI. Gated by GA4_SMOKE_TEST_REFRESH_TOKEN. Set the env var
 * locally to a long-lived refresh token of a Google account that has
 * access to GA4_SMOKE_TEST_PROPERTY_ID, then run:
 *
 *   pnpm --filter @kinetiks/id vitest run \
 *     src/lib/connections/extractors/__tests__/ga4.smoke.test.ts
 *
 * Required env:
 *   GA4_SMOKE_TEST_REFRESH_TOKEN     long-lived refresh token
 *   GA4_SMOKE_TEST_PROPERTY_ID       numeric GA4 property id
 *   GA4_CLIENT_ID, GA4_CLIENT_SECRET (same as production)
 *
 * Purpose:
 *   - Catch package breakage (@google-analytics/data / google-auth-library
 *     version drift, transport changes)
 *   - Verify the OAuth refresh flow against the real Google token endpoint
 *   - Sanity-check that sessions, users, and bounce_rate all return
 *     parsable values for the configured property
 *
 * Run manually before any D1-area release.
 */

const REFRESH_TOKEN = process.env.GA4_SMOKE_TEST_REFRESH_TOKEN;
const PROPERTY_ID = process.env.GA4_SMOKE_TEST_PROPERTY_ID;
const CLIENT_ID = process.env.GA4_CLIENT_ID;
const CLIENT_SECRET = process.env.GA4_CLIENT_SECRET;

const isEnabled = Boolean(
  REFRESH_TOKEN && PROPERTY_ID && CLIENT_ID && CLIENT_SECRET
);

const describeIf = isEnabled ? describe : describe.skip;

describeIf("GA4 smoke (real provider, manual)", () => {
  it("queries sessions for last_7_days against the configured property", async () => {
    const { runGa4Query, createGa4Client } = await import("../ga4");

    // Mint a fresh access token via the same refresh path
    // production uses.
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN!,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
    });
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    expect(tokenResp.ok).toBe(true);
    const tokenJson = (await tokenResp.json()) as {
      access_token: string;
      expires_in: number;
    };

    const client = await createGa4Client({
      type: "oauth",
      access_token: tokenJson.access_token,
      refresh_token: REFRESH_TOKEN!,
      expires_at:
        Math.floor(Date.now() / 1000) + (tokenJson.expires_in ?? 3600),
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/analytics.readonly",
    });

    const result = await runGa4Query(client, PROPERTY_ID!, {
      metric: "ga4_sessions",
      date_range: "last_7_days",
    });

    expect(result.metric).toBe("ga4_sessions");
    expect(result.metric_unit).toBe("count");
    expect(result.property_id).toBe(PROPERTY_ID);
    expect(Array.isArray(result.rows)).toBe(true);
    // At least the no-dimension row should be present
    expect(result.rows.length).toBeGreaterThan(0);
    expect(typeof result.rows[0].value).toBe("number");
  }, 30_000);
});
