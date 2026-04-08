import { describe, expect, it } from "vitest";
import {
  collectAntiSignals,
  detectAlreadyWellAnswered,
  detectColdEntry,
  detectCommunityHostility,
  detectDuplicateCoverage,
  detectRequiresSelfPromo,
  type AntiSignalContext,
} from "./anti-signals";
import type { ThreadSnapshot } from "../types/opportunity";

const baseThread: ThreadSnapshot = {
  id: "t1",
  platform: "reddit",
  external_id: "abc",
  url: "https://reddit.com/r/saas/comments/abc",
  community: "r/saas",
  title: "How do you price your first SaaS?",
  body: "Looking for real founder stories.",
  score: 100,
  comment_count: 10,
  created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  fetched_at: new Date().toISOString(),
};

const baseCtx: AntiSignalContext = {
  thread: baseThread,
  active_communities: new Set(["r/saas", "r/marketing"]),
  recent_replies_by_community: new Map(),
  product_names: [],
};

describe("@kinetiks/deskof/scout/anti-signals", () => {
  describe("cold-entry", () => {
    it("flags communities the operator has never posted in", () => {
      const flag = detectColdEntry({
        ...baseCtx,
        thread: { ...baseThread, community: "r/never-here" },
      });
      expect(flag?.reason).toBe("no_posting_history");
      expect(flag?.hard).toBe(false);
    });
    it("does not flag communities the operator is active in", () => {
      expect(detectColdEntry(baseCtx)).toBeNull();
    });
  });

  describe("already-well-answered", () => {
    it("ignores fresh threads even with high comment count", () => {
      const flag = detectAlreadyWellAnswered({
        ...baseCtx,
        thread: {
          ...baseThread,
          existing_reply_count: 100,
          created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
      });
      expect(flag).toBeNull();
    });
    it("flags mature threads with 25+ replies", () => {
      const flag = detectAlreadyWellAnswered({
        ...baseCtx,
        thread: {
          ...baseThread,
          existing_reply_count: 30,
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        },
      });
      expect(flag?.reason).toBe("already_well_answered");
      expect(flag?.hard).toBe(false);
    });
    it("hard-filters mature threads with 50+ replies", () => {
      const flag = detectAlreadyWellAnswered({
        ...baseCtx,
        thread: {
          ...baseThread,
          existing_reply_count: 80,
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        },
      });
      expect(flag?.hard).toBe(true);
    });
  });

  describe("requires-self-promotion", () => {
    it("returns null when product names are empty", () => {
      expect(detectRequiresSelfPromo(baseCtx)).toBeNull();
    });
    it("flags threads asking about the operator's product by name", () => {
      const flag = detectRequiresSelfPromo({
        ...baseCtx,
        product_names: ["Acme"],
        thread: {
          ...baseThread,
          title: "Best alternatives to Acme?",
        },
      });
      expect(flag?.reason).toBe("requires_self_promotion");
    });
    it("ignores threads that mention the product casually", () => {
      const flag = detectRequiresSelfPromo({
        ...baseCtx,
        product_names: ["Acme"],
        thread: { ...baseThread, body: "I tried Acme last year and it was fine." },
      });
      expect(flag).toBeNull();
    });
  });

  describe("duplicate-coverage", () => {
    it("flags ≥3 recent replies in the community", () => {
      const flag = detectDuplicateCoverage({
        ...baseCtx,
        recent_replies_by_community: new Map([["r/saas", 4]]),
      });
      expect(flag?.reason).toBe("duplicate_coverage");
      expect(flag?.hard).toBe(false);
    });
    it("hard-filters at ≥5 recent replies", () => {
      const flag = detectDuplicateCoverage({
        ...baseCtx,
        recent_replies_by_community: new Map([["r/saas", 6]]),
      });
      expect(flag?.hard).toBe(true);
    });
    it("does not fire below threshold", () => {
      const flag = detectDuplicateCoverage({
        ...baseCtx,
        recent_replies_by_community: new Map([["r/saas", 2]]),
      });
      expect(flag).toBeNull();
    });
  });

  describe("community-hostility", () => {
    it("flags removal rate ≥ 0.2", () => {
      const flag = detectCommunityHostility({
        ...baseCtx,
        thread: { ...baseThread, mod_removal_rate: 0.25 },
      });
      expect(flag?.reason).toBe("community_hostility");
      expect(flag?.hard).toBe(false);
    });
    it("hard-filters at removal rate ≥ 0.4", () => {
      const flag = detectCommunityHostility({
        ...baseCtx,
        thread: { ...baseThread, mod_removal_rate: 0.55 },
      });
      expect(flag?.hard).toBe(true);
    });
    it("does not fire when mod_removal_rate is null", () => {
      expect(detectCommunityHostility(baseCtx)).toBeNull();
    });
  });

  describe("collectAntiSignals", () => {
    it("returns an empty array when nothing fires", () => {
      expect(collectAntiSignals(baseCtx)).toEqual([]);
    });
    it("collects multiple flags in order", () => {
      const flags = collectAntiSignals({
        ...baseCtx,
        thread: {
          ...baseThread,
          community: "r/cold",
          existing_reply_count: 60,
          created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          mod_removal_rate: 0.5,
        },
      });
      const reasons = flags.map((f) => f.reason);
      expect(reasons).toContain("no_posting_history");
      expect(reasons).toContain("already_well_answered");
      expect(reasons).toContain("community_hostility");
    });
  });
});
