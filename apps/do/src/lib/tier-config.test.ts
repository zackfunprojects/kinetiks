import { describe, it, expect } from "vitest";
import { canAccess, requiredTier, allFeatures, TIER_LIMITS } from "./tier-config";

describe("tier-config", () => {
  it("free tier blocks every Standard+ and Hero feature", () => {
    for (const feature of allFeatures()) {
      const required = requiredTier(feature);
      if (required === "free") continue; // none today, but future-proof
      expect(canAccess(feature, "free")).toBe(false);
    }
  });

  it("hero tier sees every feature", () => {
    for (const feature of allFeatures()) {
      expect(canAccess(feature, "hero")).toBe(true);
    }
  });

  it("standard tier blocks Hero-only features and sees Standard ones", () => {
    for (const feature of allFeatures()) {
      const required = requiredTier(feature);
      if (required === "hero") {
        expect(canAccess(feature, "standard")).toBe(false);
      } else {
        expect(canAccess(feature, "standard")).toBe(true);
      }
    }
  });

  it("encodes the Quality Addendum #10.4 critical gates", () => {
    // Suggested angles is the headline conversion trigger — must be Standard+
    expect(requiredTier("suggested_angles")).toBe("standard");
    // MCP write is Hero-only because the spec calls out the human-only-publishing
    // enforcement on the deskof_post tool
    expect(requiredTier("mcp_write_tools")).toBe("hero");
    // GSC correlation is Hero only
    expect(requiredTier("reputation_gsc_correlation")).toBe("hero");
    // Quora is Standard+
    expect(requiredTier("platform_quora")).toBe("standard");
    // Topic spacing + CPPI gates are Standard+
    expect(requiredTier("gate_cppi")).toBe("standard");
    expect(requiredTier("gate_topic_spacing")).toBe("standard");
  });

  it("content URL limits match the per-tier ceilings", () => {
    expect(TIER_LIMITS.content_urls.free).toBe(0);
    expect(TIER_LIMITS.content_urls.standard).toBe(10);
    expect(TIER_LIMITS.content_urls.hero).toBe(Number.POSITIVE_INFINITY);
  });
});
