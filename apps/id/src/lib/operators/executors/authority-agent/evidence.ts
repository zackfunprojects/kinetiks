/**
 * Evidence brief assembler for the Authority Agent per
 * Kinetiks Contract Addendum §2.5.
 *
 * Deterministic data assembly with ONE compact Haiku call to extract
 * the "edit-signal narrative" — the narrative bits genuinely benefit
 * from LLM compression; the structured bits (pattern_ids, counts,
 * prior grant outcomes) ride raw into the proposal prompt.
 *
 * This is the "Haiku evidence brief" mentioned in the Phase 4 plan;
 * the actual implementation is mostly deterministic + a single Haiku
 * summarizer over noisy ledger event detail. Splitting the work this
 * way avoids paying Haiku for structure we already have.
 *
 * Server-side only.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { routeAskClaude } from "@kinetiks/ai";
import type { AuthorityRevocationReason } from "@kinetiks/types";

import {
  AUTHORITY_AGENT_EVIDENCE_SYSTEM,
  buildAuthorityEvidenceUserPrompt,
} from "@/lib/ai/prompts/authority-agent";
import { listPatterns } from "@/lib/cortex/patterns/list";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PatternReference {
  pattern_id: string;
  pattern_type: string;
  lift_ratio: number | null;
  summary: string;
}

export interface PriorGrantReference {
  grant_id: string;
  outcome:
    | "approved_as_proposed"
    | "approved_with_edits"
    | "rejected"
    | "expired_clean"
    | "expired_with_escalations";
  common_edits_applied: string[];
}

export interface LedgerSummary {
  proposals_last_90d: number;
  approval_rate: number;
  most_common_edit_type: string | null;
}

export interface EvidenceBrief {
  patterns_referenced: PatternReference[];
  prior_grants: PriorGrantReference[];
  ledger_summary: LedgerSummary;
  identity_signals: string[];
}

export interface BuildEvidenceBriefArgs {
  account_id: string;
  /** Used for the patterns read allowlist check. */
  caller_app?: string;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Pattern types to consult on a campaign-launch brief. v1 reads
 *  Marcus/Oracle/Harvest-relevant types — every type whose `read_apps`
 *  allows `kinetiks_id`. The listPatterns helper handles the
 *  allowlist filter; the agent does not enumerate them. */
const DEFAULT_PATTERN_LIMIT = 25;

export async function buildEvidenceBrief(
  args: BuildEvidenceBriefArgs,
): Promise<EvidenceBrief> {
  const admin = createAdminClient() as unknown as SupabaseClient;

  // Parallel fetches keep the brief assembly under one second on a
  // warm cache. Each helper handles its own RLS / scoping; the agent
  // runs under service role so reads return all account-scoped rows.
  const [patternRows, ledgerEvents, priorGrants, identitySignals] =
    await Promise.all([
      fetchRelevantPatterns(admin, args),
      fetchAuthorityLedgerLast90Days(admin, args.account_id),
      fetchPriorGrants(admin, args.account_id),
      fetchIdentitySignals(admin, args.account_id),
    ]);

  const ledgerSummary = aggregateLedger(ledgerEvents);

  // Single Haiku call to extract narrative signals from ledger detail.
  // Skipped when there's no history (first proposal); the agent will
  // see "no prior signal" via the identity_signals placeholder.
  const editSignals =
    ledgerEvents.length > 0
      ? await summarizeEditSignals(ledgerEvents, ledgerSummary, args.account_id)
      : [];

  return {
    patterns_referenced: patternRows,
    prior_grants: priorGrants,
    ledger_summary: ledgerSummary,
    identity_signals: [...identitySignals, ...editSignals].slice(0, 8),
  };
}

// ─────────────────────────────────────────────
// Pattern reads
// ─────────────────────────────────────────────

async function fetchRelevantPatterns(
  admin: SupabaseClient,
  args: BuildEvidenceBriefArgs,
): Promise<PatternReference[]> {
  // Read every pattern type kinetiks_id is allowed to consume. The
  // wildcard sentinel on the operator descriptor (`required_patterns:
  // ['*']`) maps to "read every type whose read_apps includes
  // kinetiks_id" — listPatterns' caller_app filter does the work.
  const page = await listPatterns(admin as never, {
    account_id: args.account_id,
    caller_app: args.caller_app ?? "kinetiks_id",
    minimum_confidence: 0.4,
    status_in: ["validated", "emerging"],
    exclude_user_suppressed: true,
    limit: DEFAULT_PATTERN_LIMIT,
  });
  return page.patterns.map((p) => ({
    pattern_id: p.id,
    pattern_type: p.pattern_type,
    lift_ratio: p.lift_ratio ?? null,
    summary: `${p.outcome_metric}=${p.outcome_value.toFixed(2)} (n=${p.sample_size}, conf=${p.confidence_score.toFixed(2)})`,
  }));
}

// ─────────────────────────────────────────────
// Ledger aggregation
// ─────────────────────────────────────────────

interface AuthorityLedgerEvent {
  event_type: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const AUTHORITY_LEDGER_EVENT_TYPES = [
  "authority_grant_proposed",
  "authority_grant_approved",
  "authority_grant_paused",
  "authority_grant_narrowed",
  "authority_grant_revoked",
  "authority_grant_expired",
  "authority_action_taken",
  "authority_action_escalated",
] as const;

async function fetchAuthorityLedgerLast90Days(
  admin: SupabaseClient,
  account_id: string,
): Promise<AuthorityLedgerEvent[]> {
  const since = new Date(Date.now() - NINETY_DAYS_MS).toISOString();
  const { data, error } = await admin
    .from("kinetiks_ledger")
    .select("event_type, detail, created_at")
    .eq("account_id", account_id)
    .in("event_type", AUTHORITY_LEDGER_EVENT_TYPES as unknown as string[])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    throw new Error(
      `[authority-agent/evidence] ledger fetch failed: ${error.message}`,
    );
  }
  return (data ?? []) as AuthorityLedgerEvent[];
}

function aggregateLedger(events: AuthorityLedgerEvent[]): LedgerSummary {
  const proposed = events.filter((e) => e.event_type === "authority_grant_proposed").length;
  const approved = events.filter((e) => e.event_type === "authority_grant_approved").length;
  const editsApplied = events
    .filter((e) => e.event_type === "authority_grant_approved")
    .map(
      (e) => (e.detail as { edit_categories?: string[] } | null)?.edit_categories,
    )
    .filter((arr): arr is string[] => Array.isArray(arr) && arr.length > 0)
    .flat();

  const editCounts: Record<string, number> = {};
  for (const c of editsApplied) editCounts[c] = (editCounts[c] ?? 0) + 1;

  const most_common_edit_type =
    Object.entries(editCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    proposals_last_90d: proposed,
    approval_rate: proposed > 0 ? approved / proposed : 0,
    most_common_edit_type,
  };
}

// ─────────────────────────────────────────────
// Prior grants
// ─────────────────────────────────────────────

async function fetchPriorGrants(
  admin: SupabaseClient,
  account_id: string,
): Promise<PriorGrantReference[]> {
  const { data, error } = await admin
    .from("kinetiks_authority_grants")
    .select("id, status, revocation_reason, usage_summary, granted_at, revoked_at")
    .eq("account_id", account_id)
    .order("granted_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) {
    throw new Error(
      `[authority-agent/evidence] prior-grants fetch failed: ${error.message}`,
    );
  }
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    revocation_reason: AuthorityRevocationReason | null;
    usage_summary: { escalations_triggered?: number } | null;
    granted_at: string | null;
    revoked_at: string | null;
  }>;

  return rows.map((r) => ({
    grant_id: r.id,
    outcome: classifyOutcome(r),
    // v1: common_edits_applied is derived from authority_grant_approved
    // events on the grant; we leave it empty here and let the Haiku
    // summarizer surface edit patterns at the brief level. Per-grant
    // edit tracking lands in a follow-up.
    common_edits_applied: [],
  }));
}

function classifyOutcome(row: {
  status: string;
  revocation_reason: AuthorityRevocationReason | null;
  usage_summary: { escalations_triggered?: number } | null;
}): PriorGrantReference["outcome"] {
  if (row.status === "active" || row.status === "paused") {
    return "approved_as_proposed";
  }
  if (row.status === "expired") {
    return (row.usage_summary?.escalations_triggered ?? 0) > 0
      ? "expired_with_escalations"
      : "expired_clean";
  }
  if (row.status === "revoked") {
    if (row.revocation_reason === "customer_edited") return "approved_with_edits";
    return "rejected";
  }
  // Proposed but never approved is treated as rejected for the
  // agent's calibration purposes.
  return "rejected";
}

// ─────────────────────────────────────────────
// Identity signals (v1 stub)
// ─────────────────────────────────────────────

async function fetchIdentitySignals(
  _admin: SupabaseClient,
  _account_id: string,
): Promise<string[]> {
  // v1: identity signals from the Cortex Identity layer aren't yet
  // surfaced via a structured "autonomy preferences" field. Returns an
  // empty array; the Haiku summarizer alone provides the signal text.
  // When the Identity layer adds preference fields, plumb here.
  return [];
}

// ─────────────────────────────────────────────
// Haiku narrative summarizer
// ─────────────────────────────────────────────

async function summarizeEditSignals(
  events: AuthorityLedgerEvent[],
  summary: LedgerSummary,
  account_id: string,
): Promise<string[]> {
  // Tally revocation reasons.
  const revocations: Record<string, number> = {};
  for (const e of events) {
    if (e.event_type === "authority_grant_revoked") {
      const reason =
        (e.detail as { revocation_reason?: string } | null)?.revocation_reason ??
        "unknown";
      revocations[reason] = (revocations[reason] ?? 0) + 1;
    }
  }
  // Recent proposals snapshot (last 10).
  const recent_proposals_summary = events
    .filter((e) => e.event_type === "authority_grant_proposed")
    .slice(0, 10)
    .map((e) => {
      const detail = e.detail as { grant_id?: string } | null;
      return {
        grant_id: detail?.grant_id ?? "unknown",
        outcome: "(see prior_grants)",
        common_edits_applied: [],
      };
    });

  const prompt = buildAuthorityEvidenceUserPrompt({
    proposals_last_90d: summary.proposals_last_90d,
    approval_rate: summary.approval_rate,
    most_common_edit_type: summary.most_common_edit_type,
    revocations_with_reasons: Object.entries(revocations).map(
      ([reason, count]) => ({ reason, count }),
    ),
    recent_proposals_summary,
  });

  try {
    const raw = await routeAskClaude(
      "authority_agent.evidence_summarize",
      prompt,
      AUTHORITY_AGENT_EVIDENCE_SYSTEM,
      {
        context: { accountId: account_id },
        // Compact output: a few short strings.
        maxTokens: 512,
      },
    );
    return parseHaikuStringArray(raw);
  } catch {
    // Haiku failure must not block the brief; the proposer can still
    // produce a conservative proposal from the structured evidence
    // alone. Return empty signals.
    return [];
  }
}

function parseHaikuStringArray(raw: string): string[] {
  // The prompt instructs JSON-array-of-strings output, but the model
  // occasionally wraps in fences. Strip ```json``` / ``` fences then
  // try JSON.parse; on failure, fall back to splitting by newline.
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string").slice(0, 8);
    }
  } catch {
    // fallthrough
  }
  return stripped
    .split(/\n+/)
    .map((s) => s.replace(/^[-*•\s]+/, "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 8);
}
