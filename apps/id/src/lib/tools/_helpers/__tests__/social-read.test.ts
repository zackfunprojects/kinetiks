import { afterEach, describe, expect, it, vi } from "vitest";

import { defineSocialReadTool } from "../social-read";

afterEach(() => {
  vi.restoreAllMocks();
});

// Mock createAdminClient to control the SELECT chain inline per test.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { createAdminClient } = await import("@/lib/supabase/admin");

interface MockPostRow {
  posted_at: string;
  content_summary: string | null;
  engagement: Record<string, number>;
  metadata: Record<string, unknown>;
}

function mockAdmin(opts: {
  connection?: { status: string } | null;
  posts?: MockPostRow[] | null;
  postsError?: { message: string } | null;
}) {
  const admin = {
    from: vi.fn((table: string) => {
      if (table === "kinetiks_connections") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: opts.connection === undefined ? { status: "active" } : opts.connection,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "kinetiks_social_posts") {
        // Phase 7 CR round 2: paginated query chain ends in
        // `.order().order().limit()` and may have `.or()` appended on
        // page ≥ 2. The terminal node in either path is a Promise
        // (resolves with the mocked posts).
        const resolveData = () =>
          Promise.resolve({
            data: opts.posts ?? [],
            error: opts.postsError ?? null,
          });
        const limitTerminus = {
          then: (...args: Parameters<Promise<unknown>["then"]>) =>
            resolveData().then(...args),
          or: () => resolveData(),
        };
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => limitTerminus,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(admin);
  return admin;
}

const TWITTER_TOOL = defineSocialReadTool({
  name: "twitter_query_test",
  description: "test fixture",
  source: "twitter",
  provider: "twitter",
  connection_provider: "twitter",
  cortex_layer: "voice",
  primary_metric: "impressions",
});

const CTX = {
  accountId: "acct-1",
  invokedByAgent: "test",
} as Parameters<typeof TWITTER_TOOL.execute>[1];

describe("defineSocialReadTool", () => {
  it("returns not_connected when no active connection exists", async () => {
    mockAdmin({ connection: null });
    const result = await TWITTER_TOOL.execute({ time_window: "last_28_days", top_n: 5 }, CTX);
    expect(result.status).toBe("not_connected");
  });

  it("returns ok empty_window when no posts in the window", async () => {
    mockAdmin({ posts: [] });
    const result = await TWITTER_TOOL.execute({ time_window: "last_28_days", top_n: 5 }, CTX);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.empty_window).toBe(true);
      expect(result.total_posts).toBe(0);
      expect(result.top_posts).toEqual([]);
    }
  });

  it("returns error when the posts query fails", async () => {
    mockAdmin({ posts: null, postsError: { message: "boom" } });
    const result = await TWITTER_TOOL.execute({ time_window: "last_28_days", top_n: 5 }, CTX);
    expect(result.status).toBe("error");
  });

  it("ranks top_posts by the primary metric", async () => {
    const posts: MockPostRow[] = [
      {
        posted_at: "2026-05-20T00:00:00Z",
        content_summary: "low",
        engagement: { impressions: 100, likes: 5 },
        metadata: { hashtags: ["a"], post_url: "https://twitter.com/x/1" },
      },
      {
        posted_at: "2026-05-21T00:00:00Z",
        content_summary: "high",
        engagement: { impressions: 9000, likes: 1 },
        metadata: { hashtags: ["a", "b"], post_url: "https://twitter.com/x/2" },
      },
      {
        posted_at: "2026-05-22T00:00:00Z",
        content_summary: "mid",
        engagement: { impressions: 500, likes: 50 },
        metadata: { hashtags: ["b"], post_url: null },
      },
    ];
    mockAdmin({ posts });
    const result = await TWITTER_TOOL.execute({ time_window: "last_28_days", top_n: 2 }, CTX);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.total_posts).toBe(3);
      expect(result.top_posts).toHaveLength(2);
      expect(result.top_posts[0].content_summary).toBe("high");
      expect(result.top_posts[0].primary_metric_value).toBe(9000);
      expect(result.top_posts[1].content_summary).toBe("mid");
    }
  });

  it("filters out posts below min_engagement", async () => {
    const posts: MockPostRow[] = [
      { posted_at: "2026-05-20T00:00:00Z", content_summary: "a", engagement: { impressions: 50 }, metadata: {} },
      { posted_at: "2026-05-21T00:00:00Z", content_summary: "b", engagement: { impressions: 500 }, metadata: {} },
    ];
    mockAdmin({ posts });
    const result = await TWITTER_TOOL.execute(
      { time_window: "last_28_days", top_n: 5, min_engagement: 100 },
      CTX,
    );
    if (result.status === "ok") {
      expect(result.total_posts).toBe(1);
      expect(result.top_posts[0].content_summary).toBe("b");
    }
  });

  it("aggregates hashtag uses across posts", async () => {
    const posts: MockPostRow[] = [
      { posted_at: "2026-05-20T00:00:00Z", content_summary: null, engagement: { impressions: 1 }, metadata: { hashtags: ["build", "ship"] } },
      { posted_at: "2026-05-21T00:00:00Z", content_summary: null, engagement: { impressions: 1 }, metadata: { hashtags: ["build"] } },
      { posted_at: "2026-05-22T00:00:00Z", content_summary: null, engagement: { impressions: 1 }, metadata: { hashtags: ["test"] } },
    ];
    mockAdmin({ posts });
    const result = await TWITTER_TOOL.execute({ time_window: "last_28_days", top_n: 5 }, CTX);
    if (result.status === "ok") {
      expect(result.top_hashtags[0]).toEqual({ tag: "build", uses: 2 });
      expect(result.top_hashtags.find((h) => h.tag === "test")?.uses).toBe(1);
    }
  });

  it("falls back to first numeric metric when primary_metric is absent", async () => {
    // Configure tool to look for a metric the data doesn't have.
    const tool = defineSocialReadTool({
      name: "fallback_test",
      description: "x",
      source: "tiktok",
      provider: "tiktok",
      connection_provider: "tiktok",
      cortex_layer: "brand",
      primary_metric: "missing_metric",
    });
    mockAdmin({
      posts: [
        { posted_at: "2026-05-20T00:00:00Z", content_summary: "x", engagement: { views: 42 }, metadata: {} },
      ],
    });
    const result = await tool.execute({ time_window: "last_28_days", top_n: 1 }, CTX);
    if (result.status === "ok") {
      expect(result.top_posts[0].primary_metric_value).toBe(42);
    }
  });
});
