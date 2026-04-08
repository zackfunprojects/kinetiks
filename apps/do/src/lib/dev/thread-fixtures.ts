/**
 * Dev-only thread fixture loader.
 *
 * Phase 2.5 unblocker: until the Reddit OAuth client lands and
 * QuoraClient.fetchThreads is real, the Write tab has no data path.
 * This module provides a small set of realistic Quora thread fixtures
 * the dev seed route can drop into deskof_threads + deskof_opportunities
 * for the signed-in user, so the full Write loop can be exercised
 * end-to-end during development and CodeRabbit smoke testing.
 *
 * Production safety: the seed route refuses to run unless either
 * NODE_ENV !== 'production' OR DESKOF_ALLOW_DEV_SEED === 'true'. The
 * fixtures themselves are clearly labeled as such in the title text
 * so a fixture that accidentally leaks into production data is easy
 * to spot.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeMatchScore,
  buildBreakdown,
} from "@kinetiks/deskof";

interface FixtureThread {
  /** Stable external_id used as the upsert key */
  external_id: string;
  url: string;
  community: string;
  title: string;
  body: string;
  score: number;
  comment_count: number;
  /** Days ago the thread was "created" */
  age_days: number;
  /** Topic the fixture is about (drives expertise_fit during scoring) */
  topic: string;
}

const FIXTURES: FixtureThread[] = [
  {
    external_id: "fixture-saas-pricing-101",
    url: "https://www.quora.com/How-did-you-price-your-first-SaaS-product-fixture-1",
    community: "SaaS",
    title: "[Fixture] How did you price your first SaaS product?",
    body: "Looking for real founder stories. Did you start with cost-plus, value-based, or copy a competitor? What did you change after the first 10 customers?",
    score: 1240,
    comment_count: 18,
    age_days: 2,
    topic: "saas pricing",
  },
  {
    external_id: "fixture-growth-marketing-team",
    url: "https://www.quora.com/Building-a-marketing-team-from-zero-fixture-2",
    community: "Marketing",
    title: "[Fixture] Building a marketing team from zero — first 3 hires?",
    body: "We're a Series A B2B SaaS, mostly engineers. Just hired our first marketer. What were your first three roles after that and in what order?",
    score: 432,
    comment_count: 11,
    age_days: 1,
    topic: "growth marketing team building",
  },
  {
    external_id: "fixture-cold-outreach-reply-rate",
    url: "https://www.quora.com/Cold-outreach-reply-rates-fixture-3",
    community: "Sales",
    title: "[Fixture] Realistic cold email reply rates in 2026?",
    body: "Everyone says 1-3% but our last campaign hit 0.4%. Is the ceiling actually lower now that LLM filters are everywhere?",
    score: 880,
    comment_count: 27,
    age_days: 3,
    topic: "cold outreach reply rates",
  },
  {
    external_id: "fixture-deskof-style-product",
    url: "https://www.quora.com/Tools-for-finding-reddit-threads-fixture-4",
    community: "Marketing",
    title: "[Fixture] Tools for finding the right Reddit threads to engage in?",
    body: "I want to participate in genuine technical discussions in my domain, not spam. Are there tools that surface threads where my expertise actually adds value?",
    score: 312,
    comment_count: 9,
    age_days: 0,
    topic: "reddit discovery tools expertise",
  },
  {
    external_id: "fixture-quora-vs-reddit-attribution",
    url: "https://www.quora.com/Quora-vs-Reddit-attribution-fixture-5",
    community: "Marketing",
    title: "[Fixture] Has anyone built attribution from Quora answers to actual signups?",
    body: "Reddit attribution is hard enough. Curious if anyone has wired UTM links + GSC + branded search lift to get a real picture of what their Quora presence drives.",
    score: 156,
    comment_count: 6,
    age_days: 5,
    topic: "quora attribution branded search",
  },
];

interface SeedResult {
  threads_inserted: number;
  opportunities_inserted: number;
}

/**
 * Seed the fixtures into deskof_threads and create matching
 * opportunities for the given user. Idempotent — running it twice
 * in a row is a no-op (upserts on (platform, external_id) and
 * (user_id, thread_id)).
 *
 * Uses the service-role admin client because deskof_threads has no
 * insert policy for the authenticated role (it's a shared cache that
 * Scout owns).
 */
export async function seedFixturesForUser(
  admin: SupabaseClient,
  userId: string
): Promise<SeedResult> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Upsert the thread rows
  const threadRows = FIXTURES.map((f) => ({
    platform: "quora" as const,
    external_id: f.external_id,
    url: f.url,
    community: f.community,
    title: f.title,
    body: f.body,
    score: f.score,
    comment_count: f.comment_count,
    thread_created_at: new Date(now - f.age_days * dayMs).toISOString(),
    fetched_at: new Date(now).toISOString(),
  }));

  const { data: insertedThreads, error: threadError } = await admin
    .from("deskof_threads")
    .upsert(threadRows, { onConflict: "platform,external_id" })
    .select("id, external_id, thread_created_at");

  if (threadError) {
    throw new Error(`seed thread upsert failed: ${threadError.message}`);
  }

  // 2. For each thread, build an opportunity row. Score is the
  //    composite math from @kinetiks/deskof — Phase 2 only populates
  //    expertise_fit (full credit for fixtures, since we've hand-picked
  //    them) and timing_score from the freshness curve. The other
  //    dimensions stay 0 like in production Scout v1.
  const expirationHours = 48;
  const opportunityRows = (insertedThreads ?? []).map((row) => {
    const fixture =
      FIXTURES.find((f) => f.external_id === row.external_id) ?? FIXTURES[0];
    const ageHours =
      (now - new Date(row.thread_created_at).getTime()) / (60 * 60 * 1000);
    const timingScore = Math.max(
      0.05,
      Math.min(0.95, Math.pow(0.5, ageHours / 36))
    );
    const matchInput = {
      expertise_fit: 1.0,
      timing_score: timingScore,
      citation_probability: 0,
      answer_gap_score: 0,
      anti_signal_count: 0,
    };
    return {
      user_id: userId,
      thread_id: row.id,
      match_score: computeMatchScore(matchInput),
      match_breakdown: buildBreakdown(matchInput),
      suggested_angle: null,
      expertise_tier_matched: "core_authority" as const,
      opportunity_type: "professional" as const,
      status: "pending" as const,
      surfaced_at: new Date(now).toISOString(),
      expires_at: new Date(now + expirationHours * 60 * 60 * 1000).toISOString(),
    };
  });

  if (opportunityRows.length === 0) {
    return { threads_inserted: 0, opportunities_inserted: 0 };
  }

  // We can't use ON CONFLICT here because deskof_opportunities has no
  // unique constraint on (user_id, thread_id) — that's intentional in
  // production (re-surfacing a thread is allowed) but for the seed we
  // delete-and-reinsert any prior fixture opportunities first.
  await admin
    .from("deskof_opportunities")
    .delete()
    .eq("user_id", userId)
    .in(
      "thread_id",
      (insertedThreads ?? []).map((r) => r.id)
    );

  const { error: oppError } = await admin
    .from("deskof_opportunities")
    .insert(opportunityRows);

  if (oppError) {
    throw new Error(`seed opportunity insert failed: ${oppError.message}`);
  }

  return {
    threads_inserted: threadRows.length,
    opportunities_inserted: opportunityRows.length,
  };
}
