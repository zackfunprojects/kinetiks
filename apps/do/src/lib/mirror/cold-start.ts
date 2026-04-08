/**
 * Mirror v0 — Operator Profile cold start pipeline.
 *
 * Quality Addendum #6 specifies a 4-phase aggressive cold start that
 * builds the profile during onboarding without making the user fill
 * out a form. Phase 2 ships:
 *
 *   Phase A (this module):
 *     - Content URL ingestion       (manual submit, processed in background)
 *     - Manual personal interests   (free-text input from onboarding step 4)
 *
 *   Phase B (this module):
 *     - 10-thread expertise calibration → tier assignment
 *
 *   Phase C/D (later phases):
 *     - Behavioral learning loops (Phase 7 — Mirror v1)
 *     - Reddit / Quora history import (Phase 1.4 follow-up + Phase 7)
 *
 * The functions here are pure orchestration over @kinetiks/cortex
 * primitives. They never call LLMs or scrape — that's a future Phase
 * 7 expansion. The goal of Phase 2 is to make the cold-start data
 * captured by onboarding actually shape the Operator Profile.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExpertiseTier,
  ExpertiseTierLevel,
  Interest,
} from "@kinetiks/cortex";
import {
  addExpertiseTiers,
  addPersonalInterests,
} from "@/lib/cortex/operator-profile-service";

// ----------------------------------------------------------------
// Phase A: content URL submission
// ----------------------------------------------------------------

export interface ContentUrlInput {
  url: string;
  source: "blog" | "newsletter" | "linkedin" | "twitter" | "other";
}

const CONTENT_URL_LIMITS = {
  free: 0,
  standard: 10,
  hero: Number.POSITIVE_INFINITY,
} as const;

/**
 * Submit content URLs from onboarding step 2. Stores them in
 * deskof_content_urls; the actual ingestion job (scrape, NLP extract,
 * voice fingerprint) runs in a background Edge Function later.
 *
 * Enforces the per-tier content URL limit from Quality Addendum #10.4.
 */
export async function submitContentUrls(
  supabase: SupabaseClient,
  userId: string,
  tier: "free" | "standard" | "hero",
  urls: ContentUrlInput[]
): Promise<{ accepted: number; rejected: number; reason?: string }> {
  const limit = CONTENT_URL_LIMITS[tier];
  if (limit === 0) {
    return {
      accepted: 0,
      rejected: urls.length,
      reason: "Content URL ingestion is a Standard+ feature",
    };
  }

  const cleaned = urls
    .map((u) => ({ ...u, url: u.url.trim() }))
    .filter((u) => isValidUrl(u.url));

  // Deduplicate by URL within this batch. PostgreSQL upsert raises
  // "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // if the same conflict target appears twice in the same statement.
  const deduped = Array.from(
    new Map(cleaned.map((u) => [u.url, u])).values()
  );
  const limited = deduped.slice(0, limit);

  if (limited.length === 0) {
    return { accepted: 0, rejected: urls.length, reason: "No valid URLs" };
  }

  const { error, count } = await supabase
    .from("deskof_content_urls")
    .upsert(
      limited.map((u) => ({
        user_id: userId,
        url: u.url,
        source: u.source,
      })),
      { onConflict: "user_id,url", count: "exact" }
    );

  if (error) {
    throw new Error(`submitContentUrls failed: ${error.message}`);
  }

  return {
    accepted: count ?? limited.length,
    rejected: urls.length - limited.length,
  };
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------
// Phase A: personal interests
// ----------------------------------------------------------------

/**
 * Persist the personal interests the user entered during onboarding
 * step 4. Stored on the Operator Profile (not as a separate table)
 * because they're consumed alongside other personal-side fields.
 */
export async function submitPersonalInterests(
  supabase: SupabaseClient,
  userId: string,
  topics: string[]
): Promise<void> {
  const interests: Interest[] = topics
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((topic) => ({
      topic,
      source: "manual",
      confidence: 0.7,
    }));

  if (interests.length === 0) return;

  await addPersonalInterests(supabase, userId, interests);
}

// ----------------------------------------------------------------
// Phase B: 10-thread expertise calibration
// ----------------------------------------------------------------

export type CalibrationJudgement =
  | "sweet_spot"
  | "could_contribute"
  | "not_for_me";

export interface CalibrationResponse {
  thread_id: string;
  judgement: CalibrationJudgement;
  /** Topic extracted from the thread (Scout already tagged it) */
  topic: string;
}

const JUDGEMENT_TO_TIER: Record<
  CalibrationJudgement,
  ExpertiseTierLevel | null
> = {
  sweet_spot: "core_authority",
  could_contribute: "credible_adjacency",
  not_for_me: null, // skip — but counts as a Genuine Curiosity signal IF
  // the user later engages with similar content
};

/**
 * Take the 10 calibration responses and produce ExpertiseTier entries
 * to merge into the Operator Profile.
 *
 * Threads marked "sweet_spot" become core_authority tiers.
 * Threads marked "could_contribute" become credible_adjacency tiers.
 * Threads marked "not_for_me" are stored but do NOT yet generate a
 * tier — they become Genuine Curiosity candidates that Phase 7's
 * behavioral learning loop can promote based on actual engagement.
 *
 * Each tier carries the calibration thread_id as evidence for
 * traceability — Mirror v1 (Phase 7) will use this to debug or
 * recompute confidence.
 */
export async function applyCalibrationResponses(
  supabase: SupabaseClient,
  userId: string,
  responses: CalibrationResponse[]
): Promise<void> {
  // Persist the raw responses for the Phase 7 behavioral learning loop.
  // Fail fast — if this write fails we must NOT proceed to mutate the
  // Operator Profile, or the evidence table and the derived tiers will
  // diverge.
  const { error: persistError } = await supabase
    .from("deskof_calibration_responses")
    .upsert(
      responses.map((r) => ({
        user_id: userId,
        thread_id: r.thread_id,
        judgement: r.judgement,
      })),
      { onConflict: "user_id,thread_id" }
    );

  if (persistError) {
    throw new Error(
      `applyCalibrationResponses: persist failed: ${persistError.message}`
    );
  }

  // Group by topic and infer tiers
  const tierByTopic = new Map<string, ExpertiseTier>();

  for (const r of responses) {
    const tierLevel = JUDGEMENT_TO_TIER[r.judgement];
    if (!tierLevel) continue;

    const topic = r.topic.toLowerCase();
    const existing = tierByTopic.get(topic);

    // Strongest tier wins if the user labels two threads on the same
    // topic with different judgements
    if (existing && rank(existing.tier) >= rank(tierLevel)) {
      existing.evidence.push(r.thread_id);
      continue;
    }

    tierByTopic.set(topic, {
      topic: r.topic,
      tier: tierLevel,
      evidence: [r.thread_id],
      confidence: tierLevel === "core_authority" ? 0.7 : 0.5,
    });
  }

  if (tierByTopic.size === 0) return;
  await addExpertiseTiers(supabase, userId, Array.from(tierByTopic.values()));
}

function rank(level: ExpertiseTierLevel): number {
  switch (level) {
    case "core_authority":
      return 3;
    case "credible_adjacency":
      return 2;
    case "genuine_curiosity":
      return 1;
  }
}
