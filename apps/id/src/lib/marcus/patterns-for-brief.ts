/**
 * Patterns pre-fetch for Marcus's evidence brief per the Kinetiks Contract Addendum
 * §1.10 (Marcus Usage Rules). Patterns enter the manifest PASSIVELY, alongside Cortex
 * context layers, NOT as a step 7.5 tool decision. Marcus weaves them
 * into the implication of the response; the response body never dumps
 * raw statistics.
 *
 * The `query_patterns` tool remains available for step 7.5 when the
 * user's question is explicitly "what patterns do you have about X" —
 * passive pre-fetch and active tool use are the two paths.
 */

import { listPatterns } from "@/lib/cortex/patterns/list";
import type { Pattern } from "@kinetiks/types";

/** Default cap on patterns surfaced into the brief. */
export const PATTERNS_FOR_BRIEF_LIMIT = 5;

/** Confidence floor for inclusion. */
export const PATTERNS_FOR_BRIEF_MIN_CONFIDENCE = 0.6;

interface AdminLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface PatternForBrief {
  pattern_id: string;
  pattern_type: string;
  source_app: string;
  status: "emerging" | "validated" | "declining";
  applies_to_icp: string | null;
  confidence_score: number;
  observation_count: number;
  sample_size: number;
  /** Single primary outcome per canonical §1.2. */
  primary_metric: { name: string; value: number; unit: string } | null;
  /** outcome_value / baseline_value when both present. */
  lift_ratio: number | null;
  summary: string;
}

function humanize(t: string): string {
  return t
    .split(".")
    .map((p) => p.replace(/_/g, " "))
    .join(" / ");
}

function compactDimensions(d: Record<string, unknown>): string {
  // Drop verbose / non-identity fields and render as a compact "k=v"
  // sequence for the brief one-liner.
  return Object.entries(d)
    .filter(([_k, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
}

function formatPrimary(metric: PatternForBrief["primary_metric"]): string | null {
  if (!metric) return null;
  if (metric.unit === "ratio_0_1") {
    return `${metric.name}=${(metric.value * 100).toFixed(1)}%`;
  }
  return `${metric.name}=${metric.value.toLocaleString()} ${metric.unit}`;
}

export async function loadPatternsForBrief(args: {
  admin: AdminLike;
  account_id: string;
  applies_to_icp?: string | null;
  limit?: number;
}): Promise<PatternForBrief[]> {
  const limit = args.limit ?? PATTERNS_FOR_BRIEF_LIMIT;
  try {
    const { patterns } = await listPatterns(args.admin, {
      account_id: args.account_id,
      caller_app: "marcus",
      status_in: ["validated", "emerging"],
      minimum_confidence: PATTERNS_FOR_BRIEF_MIN_CONFIDENCE,
      exclude_user_suppressed: true,
      applies_to_icp: args.applies_to_icp ?? undefined,
      limit,
    });
    return patterns.map(toBriefShape);
  } catch (err) {
    // Non-fatal: a Pattern Library read failure must not block Marcus.
    // Log and return empty.
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(
      `[patterns-for-brief] read failed account=${args.account_id}: ${message}`,
    );
    return [];
  }
}

function toBriefShape(p: Pattern): PatternForBrief {
  // Canonical L1b: row carries a single primary outcome. The unit is
  // descriptor-declared and not stored on the row; we default to
  // "ratio_0_1" for ratios under 1 and "count" otherwise as a display
  // heuristic. The real unit is in the registry snapshot.
  const inferredUnit =
    Math.abs(p.outcome_value) <= 1 ? "ratio_0_1" : "count";
  const primary = {
    name: p.outcome_metric,
    value: p.outcome_value,
    unit: inferredUnit,
  };
  const dims = compactDimensions(p.dimensions);
  const primaryStr = formatPrimary(primary);
  // Single-line summary: type, ICP if present, key dims, primary metric,
  // confidence, lift, sample size. No raw statistics dump.
  const parts = [
    humanize(p.pattern_type),
    p.applies_to_icp ? `icp=${p.applies_to_icp}` : null,
    dims || null,
    primaryStr,
    p.lift_ratio !== null ? `lift=${p.lift_ratio.toFixed(2)}x` : null,
    `conf=${(p.confidence_score * 100).toFixed(0)}%`,
    `n=${p.sample_size}`,
  ].filter(Boolean);
  return {
    pattern_id: p.id,
    pattern_type: p.pattern_type,
    source_app: p.source_app,
    status: (p.status === "archived" ? "validated" : p.status) as
      | "emerging"
      | "validated"
      | "declining",
    applies_to_icp: p.applies_to_icp,
    confidence_score: p.confidence_score,
    observation_count: p.observation_count,
    sample_size: p.sample_size,
    primary_metric: primary,
    lift_ratio: p.lift_ratio,
    summary: parts.join(" | "),
  };
}
