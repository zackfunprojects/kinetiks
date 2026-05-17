/**
 * Patterns pre-fetch for Marcus's evidence brief per the 2027 addendum
 * §1.12. Patterns enter the manifest PASSIVELY, alongside Cortex
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
  emitting_app: string;
  status: "emerging" | "validated" | "declining";
  applies_to_icp: string | null;
  confidence_score: number;
  observation_count: number;
  primary_metric: { name: string; value: number; unit: string } | null;
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
  const primary = p.outcome_metrics[0] ?? null;
  const dims = compactDimensions(p.dimensions);
  const primaryStr = primary
    ? formatPrimary({ name: primary.metric_name, value: primary.value, unit: primary.unit })
    : null;
  // Single-line summary: type, ICP if present, key dims, primary metric.
  // No statistics dump; just the load-bearing values.
  const parts = [
    humanize(p.pattern_type),
    p.applies_to_icp ? `icp=${p.applies_to_icp}` : null,
    dims || null,
    primaryStr,
    `conf=${(p.confidence_score * 100).toFixed(0)}%`,
    `n=${p.observation_count}`,
  ].filter(Boolean);
  return {
    pattern_id: p.id,
    pattern_type: p.pattern_type,
    emitting_app: p.emitting_app,
    status: (p.status === "archived" ? "validated" : p.status) as
      | "emerging"
      | "validated"
      | "declining",
    applies_to_icp: p.applies_to_icp,
    confidence_score: p.confidence_score,
    observation_count: p.observation_count,
    primary_metric: primary
      ? { name: primary.metric_name, value: primary.value, unit: primary.unit }
      : null,
    summary: parts.join(" | "),
  };
}
