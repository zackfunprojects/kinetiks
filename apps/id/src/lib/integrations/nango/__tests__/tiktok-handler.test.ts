import { describe, expect, it } from "vitest";

import {
  normalizeTikTokVideo,
  parseTikTokCreatedAt,
  extractTikTokHashtags,
  extractTikTokMentionHashes,
} from "../handlers/tiktok";

describe("tiktok handler normalization", () => {
  describe("parseTikTokCreatedAt", () => {
    it("parses unix epoch seconds", () => {
      const out = parseTikTokCreatedAt(1700000000);
      expect(out).toBe("2023-11-14T22:13:20.000Z");
    });

    it("parses ISO strings", () => {
      const out = parseTikTokCreatedAt("2026-05-27T10:00:00Z");
      expect(out).toBe("2026-05-27T10:00:00.000Z");
    });

    it("returns null for unparseable input", () => {
      expect(parseTikTokCreatedAt(undefined)).toBe(null);
      expect(parseTikTokCreatedAt("not a date")).toBe(null);
    });
  });

  describe("extractTikTokHashtags", () => {
    it("extracts hashtags lowercased + deduplicated", () => {
      const out = extractTikTokHashtags("Build with #SHIP and #ship #test");
      expect(out).toEqual(["ship", "test"]);
    });
    it("handles unicode tags", () => {
      const out = extractTikTokHashtags("post #café #まち");
      expect(out).toContain("café");
      expect(out).toContain("まち");
    });
    it("returns empty for missing text", () => {
      expect(extractTikTokHashtags(undefined)).toEqual([]);
    });
  });

  describe("extractTikTokMentionHashes", () => {
    it("redacts mentions to hash-only output", () => {
      const out = extractTikTokMentionHashes("hi @alice and @bob");
      expect(out).toHaveLength(2);
      for (const h of out) {
        // 16 hex chars per pii.hashHandle truncation
        expect(h).toMatch(/^[0-9a-f]{16}$/);
      }
      // Never leaks the raw handle
      const joined = out.join(",");
      expect(joined).not.toContain("alice");
      expect(joined).not.toContain("bob");
    });
  });

  describe("normalizeTikTokVideo — defensive metadata catch-all", () => {
    it("returns null when id is missing", () => {
      const out = normalizeTikTokVideo({ create_time: 1700000000, title: "x" });
      expect(out).toBe(null);
    });

    it("returns null when create_time is missing", () => {
      const out = normalizeTikTokVideo({ id: "v1", title: "x" });
      expect(out).toBe(null);
    });

    it("normalizes a typical video row", () => {
      const out = normalizeTikTokVideo({
        id: "v1",
        create_time: 1700000000,
        video_description: "hello #ship",
        view_count: 5000,
        like_count: 200,
        share_url: "https://www.tiktok.com/@user/video/v1",
        duration: 30,
        sound_id: "sound-123",
      });
      expect(out).not.toBe(null);
      if (!out) return;
      expect(out.provider_post_id).toBe("v1");
      expect(out.engagement.views).toBe(5000);
      expect(out.engagement.likes).toBe(200);
      expect(out.metadata.hashtags).toEqual(["ship"]);
      expect(out.metadata.duration_sec).toBe(30);
      expect(out.metadata.sound_id).toBe("sound-123");
      expect(out.metadata.post_url).toBe("https://www.tiktok.com/@user/video/v1");
    });

    it("preserves unknown fields in metadata.extra (TikTok schema drift)", () => {
      const out = normalizeTikTokVideo({
        id: "v2",
        create_time: 1700000000,
        video_description: "hi",
        view_count: 100,
        // Hypothetical future fields TikTok adds without notice:
        new_metric_2027: 999,
        engagement_v2: { foo: "bar" },
      });
      if (!out) return;
      const extra = out.metadata.extra as Record<string, unknown>;
      expect(extra).toBeDefined();
      expect(extra.new_metric_2027).toBe(999);
      expect(extra.engagement_v2).toEqual({ foo: "bar" });
    });

    it("zero-fills missing engagement counts", () => {
      const out = normalizeTikTokVideo({
        id: "v3",
        create_time: 1700000000,
        title: "minimal",
      });
      if (!out) return;
      expect(out.engagement.views).toBe(0);
      expect(out.engagement.likes).toBe(0);
      expect(out.engagement.comments).toBe(0);
      expect(out.engagement.shares).toBe(0);
    });

    it("truncates very long captions to 280 chars", () => {
      const long = "x".repeat(500);
      const out = normalizeTikTokVideo({
        id: "v4",
        create_time: 1700000000,
        video_description: long,
      });
      if (!out) return;
      expect(out.content_summary!.length).toBeLessThanOrEqual(280);
      expect(out.content_summary!.endsWith("...")).toBe(true);
    });

    it("falls back to title when video_description is absent", () => {
      const out = normalizeTikTokVideo({
        id: "v5",
        create_time: 1700000000,
        title: "Just a title",
      });
      expect(out?.content_summary).toBe("Just a title");
    });

    it("redacts mention handles in metadata", () => {
      const out = normalizeTikTokVideo({
        id: "v6",
        create_time: 1700000000,
        video_description: "shoutout @alice and @bob_creator",
      });
      const hashes = out!.metadata.mention_hashes as string[];
      expect(hashes).toHaveLength(2);
      for (const h of hashes) {
        expect(h).toMatch(/^[0-9a-f]{16}$/);
      }
    });
  });
});
