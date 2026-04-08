/**
 * Server-side Lens orchestrator.
 *
 * Hydrates a `LensInput` from Supabase + Operator Profile, picks the
 * right `LensConfig` via `computeLensConfig`, runs the engine, and
 * returns the resulting `GateResult` to the route.
 *
 * Two callers in this PR:
 *   - POST /api/reply/draft  → live gate feedback during autosave
 *   - POST /api/reply/post   → server-side re-validation before
 *                              consuming the confirmation token (the
 *                              "client bypass" defense from build-plan §3.6)
 *
 * The orchestrator is the IO layer; the engine itself is pure. All
 * the database reads here are best-effort: any individual fetch can
 * fail and Lens still produces a meaningful result (the missing data
 * just collapses the corresponding check into a silent skip).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCppiScore,
  computeLensConfig,
  runLens,
  type CPPI,
  type GateResult,
  type LensInput,
  type LensOperatorView,
  type Platform,
  type RecentReplyVector,
  type CommunityGateConfig,
  type BillingTier,
} from "@kinetiks/deskof";
import type { OperatorProfile } from "@kinetiks/cortex";
import { getOperatorProfile } from "@/lib/cortex/operator-profile-service";
import { refreshPlatformHealthSnapshot } from "./platform-health";
import { getLensLLM } from "./llm";

const CPPI_STALE_HOURS = 6;
const RECENT_VECTOR_DAYS = 7;

export interface RunLensRequest {
  user_id: string;
  user_tier: BillingTier;
  opportunity_id: string;
  platform: Platform;
  community: string | null;
  thread_question?: string | null;
  content: string;
}

/**
 * Hydrate inputs and run the Lens gate engine. NEVER throws — failure
 * modes collapse to a clear-with-skipped-checks result so the editor
 * can still save and the post route can still proceed under the
 * advisory_only contract.
 */
export async function runLensForRequest(
  supabase: SupabaseClient,
  req: RunLensRequest
): Promise<GateResult> {
  // 1. Operator profile (creates one if missing — onboarding contract).
  let profile: OperatorProfile | null = null;
  try {
    profile = await getOperatorProfile(supabase, req.user_id);
  } catch {
    profile = null;
  }
  const operatorView: LensOperatorView = {
    created_at: profile?.created_at ?? new Date().toISOString(),
    per_check_sensitivity:
      profile?.gate_adjustments.per_check_sensitivity ?? {},
    product_names:
      profile?.professional.products.map((p) => p.product_name) ?? [],
  };

  // 2. Platform health snapshot (30-day rolling).
  let platformHealth = null;
  try {
    platformHealth = await refreshPlatformHealthSnapshot(
      supabase,
      req.user_id,
      req.platform,
      operatorView.product_names
    );
  } catch {
    platformHealth = null;
  }

  // 3. CPPI snapshot — read latest, recompute if stale.
  const cppi = await loadOrComputeCppi(supabase, req.user_id);

  // 4. Recent reply vectors (last 7 days, any platform).
  const recentVectors = await loadRecentVectors(supabase, req.user_id);

  // 5. Community config override (silent if absent).
  const communityConfig = await loadCommunityConfig(
    supabase,
    req.platform,
    req.community
  );

  // 6. LLM client — null on free tier or missing API key.
  const llm = req.user_tier === "free" ? null : getLensLLM();

  const config = computeLensConfig({
    operator: operatorView,
    profileCreatedAt: operatorView.created_at,
    tier: req.user_tier,
    communityConfig,
  });

  const input: LensInput = {
    content: req.content,
    platform: req.platform,
    community: req.community,
    threadQuestion: req.thread_question ?? null,
    operator: operatorView,
    platformHealth,
    cppi,
    recentVectors,
    communityConfig,
    llm,
  };

  return runLens(input, config);
}

interface CppiRow {
  score: number;
  volume: number;
  concentration: number;
  clustering: number;
  level: CPPI["level"];
  snapshot_at: string;
}

async function loadOrComputeCppi(
  supabase: SupabaseClient,
  userId: string
): Promise<CPPI | null> {
  let latest: CppiRow | null = null;
  try {
    const { data } = await supabase
      .from("deskof_cppi_log")
      .select("score, volume, concentration, clustering, level, snapshot_at")
      .eq("user_id", userId)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latest = (data ?? null) as CppiRow | null;
  } catch {
    latest = null;
  }

  if (latest && !isStale(latest.snapshot_at)) {
    return {
      score: latest.score,
      volume: latest.volume,
      concentration: latest.concentration,
      clustering: latest.clustering,
      level: latest.level,
    };
  }

  // Stale or missing → recompute from posted replies in the last 7 days.
  // The math is intentionally simple here; a richer Phase 6 job will
  // replace it with a Pulse-side computation backed by external
  // platform metadata.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let rows: Array<{ posted_at: string | null; gate_result: unknown }> = [];
  try {
    const { data } = await supabase
      .from("deskof_replies")
      .select("posted_at, gate_result")
      .eq("user_id", userId)
      .gte("posted_at", since);
    rows = data ?? [];
  } catch {
    return latest
      ? {
          score: latest.score,
          volume: latest.volume,
          concentration: latest.concentration,
          clustering: latest.clustering,
          level: latest.level,
        }
      : null;
  }

  const total = rows.length;
  if (total === 0) return latest ? toCppi(latest) : null;

  let promotional = 0;
  const dayBuckets = new Map<string, number>();
  for (const row of rows) {
    const gr = row.gate_result as
      | { checks?: Array<{ type: string; passed: boolean }> }
      | null;
    const promoCheck = gr?.checks?.find((c) => c.type === "link_presence");
    if (promoCheck && promoCheck.passed === false) promotional += 1;
    if (row.posted_at) {
      const day = row.posted_at.slice(0, 10);
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
    }
  }

  const volume = promotional / total;
  // Concentration: top product share. Without per-product metadata
  // we approximate as 1 (one effective product) when promotional > 0.
  const concentration = promotional > 0 ? 1 : 0;
  // Clustering: max-day / total → 0 spread, 1 burst.
  let maxDay = 0;
  for (const v of dayBuckets.values()) maxDay = Math.max(maxDay, v);
  const clustering = total > 0 ? maxDay / total : 0;

  const fresh = computeCppiScore(volume, concentration, clustering);

  // Fire-and-forget snapshot write. Failure must never break the gate.
  try {
    await supabase.from("deskof_cppi_log").insert({
      user_id: userId,
      score: fresh.score,
      volume: fresh.volume,
      concentration: fresh.concentration,
      clustering: fresh.clustering,
      level: fresh.level,
    });
  } catch {
    // ignore
  }

  return fresh;
}

function toCppi(row: CppiRow): CPPI {
  return {
    score: row.score,
    volume: row.volume,
    concentration: row.concentration,
    clustering: row.clustering,
    level: row.level,
  };
}

function isStale(snapshotAt: string): boolean {
  const ageMs = Date.now() - new Date(snapshotAt).getTime();
  return ageMs > CPPI_STALE_HOURS * 60 * 60 * 1000;
}

async function loadRecentVectors(
  supabase: SupabaseClient,
  userId: string
): Promise<RecentReplyVector[]> {
  const since = new Date(
    Date.now() - RECENT_VECTOR_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  try {
    const { data } = await supabase
      .from("deskof_topic_vectors")
      .select("reply_id, community, computed_at, vector")
      .eq("user_id", userId)
      .gte("computed_at", since);
    if (!data) return [];
    return (data as Array<{
      reply_id: string;
      community: string | null;
      computed_at: string;
      vector: number[];
    }>).map((row) => ({
      reply_id: row.reply_id,
      community: row.community,
      posted_at: row.computed_at,
      vector: row.vector,
    }));
  } catch {
    return [];
  }
}

async function loadCommunityConfig(
  supabase: SupabaseClient,
  platform: Platform,
  community: string | null
): Promise<CommunityGateConfig | null> {
  if (!community) return null;
  try {
    const { data } = await supabase
      .from("deskof_community_gate_config")
      .select("platform, community, thresholds, removal_rate, sample_size")
      .eq("platform", platform)
      .eq("community", community)
      .maybeSingle();
    if (!data) return null;
    return data as CommunityGateConfig;
  } catch {
    return null;
  }
}
