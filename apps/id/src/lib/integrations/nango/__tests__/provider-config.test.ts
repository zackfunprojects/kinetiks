import { describe, expect, it } from "vitest";

import {
  assertProviderConfigValid,
  getNangoProviderConfig,
  getProviderByNangoIntegrationId,
  listNangoProviderConfigs,
} from "../provider-config";

describe("provider-config", () => {
  it("registers exactly the 10 Phase 7 providers", () => {
    const all = listNangoProviderConfigs();
    expect(all).toHaveLength(10);
    const providers = all.map((c) => c.provider).sort();
    expect(providers).toEqual(
      [
        "ga4",
        "google_ads",
        "gsc",
        "hubspot",
        "instagram",
        "linkedin",
        "meta_ads",
        "stripe",
        "tiktok",
        "twitter",
      ].sort(),
    );
  });

  it("looks up by Kinetiks provider", () => {
    const config = getNangoProviderConfig("tiktok");
    expect(config.nango_integration_id).toBe("tiktok");
    expect(config.sync_names).toContain("tiktok-videos");
    expect(config.sync_names).toContain("tiktok-account-stats");
  });

  it("looks up by Nango integration_id (reverse)", () => {
    const config = getProviderByNangoIntegrationId("instagram-business");
    expect(config?.provider).toBe("instagram");
  });

  it("returns undefined for unknown Nango integration_id", () => {
    expect(getProviderByNangoIntegrationId("definitely-not-real")).toBeUndefined();
  });

  it("passes assertProviderConfigValid", () => {
    expect(() => assertProviderConfigValid()).not.toThrow();
  });

  it("ensures every provider declares at least one sync_name", () => {
    for (const config of listNangoProviderConfigs()) {
      expect(config.sync_names.length).toBeGreaterThan(0);
    }
  });
});
