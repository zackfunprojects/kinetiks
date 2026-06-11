import { describe, expect, it } from "vitest";

import {
  assertSystemProviderConfigValid,
  getSystemProvider,
  isSystemProvider,
  isSystemProviderConfigured,
  listSystemProviders,
} from "../system-providers";
import { listProviders } from "../providers";

describe("system provider registry", () => {
  it("registers exactly the three D1 system providers", () => {
    expect(listSystemProviders().map((d) => d.provider).sort()).toEqual([
      "calendar",
      "google_workspace",
      "slack",
    ]);
  });

  it("isSystemProvider accepts registry members and rejects everything else", () => {
    expect(isSystemProvider("google_workspace")).toBe(true);
    expect(isSystemProvider("slack")).toBe(true);
    expect(isSystemProvider("calendar")).toBe(true);
    expect(isSystemProvider("ga4")).toBe(false);
    expect(isSystemProvider("hubspot")).toBe(false);
    expect(isSystemProvider("")).toBe(false);
    expect(isSystemProvider("__proto__")).toBe(false);
  });

  it("declares the spec scopes for each provider", () => {
    expect(getSystemProvider("google_workspace").scopes).toEqual([
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ]);
    expect(getSystemProvider("calendar").scopes).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    // Slack bot scopes per comms spec §3.1.
    expect(getSystemProvider("slack").scopes).toContain("chat:write");
    expect(getSystemProvider("slack").scopes).toContain("app_mentions:read");
    expect(getSystemProvider("slack").scopes).toContain("im:write");
  });

  it("is disjoint from the Nango data-provider set (boot assertion passes)", () => {
    expect(() => assertSystemProviderConfigValid()).not.toThrow();
    const dataProviders = new Set(listProviders().map((p) => p.provider));
    for (const def of listSystemProviders()) {
      expect(dataProviders.has(def.provider as never)).toBe(false);
    }
  });

  it("configured-check keys off the right env pair per oauth kind", () => {
    const env = {
      GOOGLE_WORKSPACE_CLIENT_ID: "gid",
      GOOGLE_WORKSPACE_CLIENT_SECRET: "gsecret",
      SLACK_CLIENT_ID: undefined,
      SLACK_CLIENT_SECRET: undefined,
    };
    expect(isSystemProviderConfigured("google_workspace", env)).toBe(true);
    expect(isSystemProviderConfigured("calendar", env)).toBe(true);
    expect(isSystemProviderConfigured("slack", env)).toBe(false);

    const slackOnly = {
      GOOGLE_WORKSPACE_CLIENT_ID: undefined,
      GOOGLE_WORKSPACE_CLIENT_SECRET: undefined,
      SLACK_CLIENT_ID: "sid",
      SLACK_CLIENT_SECRET: "ssecret",
    };
    expect(isSystemProviderConfigured("slack", slackOnly)).toBe(true);
    expect(isSystemProviderConfigured("google_workspace", slackOnly)).toBe(false);
  });
});
