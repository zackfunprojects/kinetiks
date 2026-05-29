import { describe, expect, it } from "vitest";

import { normalizeTwitterTweet } from "../handlers/twitter";

describe("normalizeTwitterTweet", () => {
  it("returns null when id is missing", () => {
    const out = normalizeTwitterTweet({ created_at: "2026-05-01T00:00:00Z" });
    expect(out).toBe(null);
  });

  it("returns null when created_at is missing", () => {
    const out = normalizeTwitterTweet({ id: "tweet-1" });
    expect(out).toBe(null);
  });

  it("normalizes a typical tweet", () => {
    const out = normalizeTwitterTweet({
      id: "tweet-1",
      text: "Hello world #build #ship",
      created_at: "2026-05-01T00:00:00Z",
      public_metrics: {
        like_count: 10,
        reply_count: 2,
        retweet_count: 5,
        quote_count: 1,
        bookmark_count: 3,
        impression_count: 1000,
      },
      entities: {
        hashtags: [{ tag: "build" }, { tag: "ship" }],
        mentions: [{ username: "alice" }],
      },
      conversation_id: "conv-1",
    });
    expect(out).not.toBe(null);
    if (!out) return;
    expect(out.provider_post_id).toBe("tweet-1");
    expect(out.content_summary).toBe("Hello world #build #ship");
    expect(out.engagement.likes).toBe(10);
    expect(out.engagement.replies).toBe(2);
    expect(out.engagement.reposts).toBe(5);
    expect(out.engagement.impressions).toBe(1000);
    expect(out.metadata.hashtags).toEqual(["build", "ship"]);
    expect(out.metadata.mention_hashes).toHaveLength(1);
    // Mention is hashed, not raw
    const hash = (out.metadata.mention_hashes as string[])[0];
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).not.toContain("alice");
    expect(out.metadata.conversation_id).toBe("conv-1");
    expect(out.metadata.post_url).toBe("https://twitter.com/i/web/status/tweet-1");
  });

  it("handles missing public_metrics gracefully", () => {
    const out = normalizeTwitterTweet({
      id: "tweet-2",
      text: "no metrics",
      created_at: "2026-05-01T00:00:00Z",
    });
    if (!out) return;
    expect(out.engagement.likes).toBe(0);
    expect(out.engagement.impressions).toBe(0);
    expect(out.metadata.hashtags).toEqual([]);
    expect(out.metadata.mention_hashes).toEqual([]);
  });
});
