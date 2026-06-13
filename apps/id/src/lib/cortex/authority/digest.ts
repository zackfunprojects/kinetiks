/**
 * The periodic authority digest block — E3, per addendum §2.9 ("the
 * entries are not surfaced individually to the customer; they are
 * aggregated into the grant's usage_summary and the periodic digest")
 * and §2.10 ("the daily digest includes a 'budget pressure' callout
 * when any action class is approaching its cap").
 *
 * Composition over new infrastructure: the digest is a deterministic
 * plain-language block folded into the existing daily/weekly/monthly
 * brief context (the D4a delivery loop already emails/DMs/alerts the
 * brief), not a new delivery channel. Sonnet weaves the block into the
 * brief's narrative.
 *
 * Customer-language rules apply even to prompt INPUT: the block says
 * "permissions", never the internal phrase; PII-free (action class
 * keys, counts, spend totals — no payload content).
 *
 * Returns null when the account has no authority surface to report
 * (no live grants, no window activity) so briefs stay clean for
 * accounts that haven't granted anything.
 */

import "server-only";

import { listActionClasses } from "@kinetiks/tools";
import type { SupabaseClient } from "@supabase/supabase-js";

import { captureException } from "@/lib/observability/sentry";

/** A class is "approaching" its judgment budget at this fraction. */
export const JUDGMENT_BUDGET_PRESSURE_THRESHOLD = 0.8;

interface GrantRow {
  id: string;
  status: string;
  scope_description: string;
}

interface LedgerEventRow {
  event_type: string;
  detail: Record<string, unknown> | null;
}

interface JudgmentSpendRow {
  task: string;
  cost_usd: number | null;
}

export interface AuthorityActivityInputs {
  grants: GrantRow[];
  windowEvents: LedgerEventRow[];
  judgmentSpendToday: JudgmentSpendRow[];
  /**
   * True when the event read hit its page backstop and the totals below
   * cover only the most recent slice of the window. Surfaced explicitly
   * so the digest never presents a partial figure as a complete-period
   * total. False/absent for the normal full-drain path.
   */
  truncated?: boolean;
}

/** Keyset page size + runaway backstop for the window-event drain. */
const EVENT_PAGE_SIZE = 1000;
const MAX_EVENT_PAGES = 50;

/**
 * Pure renderer — unit-tested directly. Aggregates the window's
 * authority events and today's LLM-judgment spend into the digest
 * block, or null when there is nothing to say.
 */
export function renderAuthorityActivityBlock(
  inputs: AuthorityActivityInputs,
): string | null {
  const live = inputs.grants.filter(
    (g) => g.status === "active" || g.status === "paused",
  );
  if (live.length === 0 && inputs.windowEvents.length === 0) return null;

  const lines: string[] = [];

  const active = live.filter((g) => g.status === "active");
  const paused = live.filter((g) => g.status === "paused");
  const labelList = (rows: GrantRow[]) =>
    rows
      .slice(0, 3)
      .map((g) => g.scope_description)
      .join("; ") + (rows.length > 3 ? `; +${rows.length - 3} more` : "");
  if (active.length > 0) {
    lines.push(`Active permissions: ${active.length} (${labelList(active)})`);
  }
  if (paused.length > 0) {
    lines.push(`Paused permissions: ${paused.length} (${labelList(paused)})`);
  }

  // Window activity: actions grouped by class, spend summed, escalations counted.
  const actionCounts: Record<string, number> = {};
  let actionsTotal = 0;
  let spendTotal = 0;
  let escalations = 0;
  const escalationReasons: Record<string, number> = {};
  for (const event of inputs.windowEvents) {
    if (event.event_type === "authority_action_taken") {
      actionsTotal += 1;
      const cls =
        typeof event.detail?.action_class === "string"
          ? event.detail.action_class
          : "unknown";
      actionCounts[cls] = (actionCounts[cls] ?? 0) + 1;
      const spend = event.detail?.spend_amount;
      if (typeof spend === "number" && Number.isFinite(spend) && spend > 0) {
        spendTotal += spend;
      }
    } else if (event.event_type === "authority_action_escalated") {
      escalations += 1;
      const reason =
        typeof event.detail?.reason_code === "string"
          ? event.detail.reason_code
          : "review";
      escalationReasons[reason] = (escalationReasons[reason] ?? 0) + 1;
    }
  }

  if (actionsTotal > 0) {
    const byClass = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cls, n]) => `${cls}: ${n}`)
      .join(", ");
    const spendNote =
      spendTotal > 0 ? `; spend under permissions: $${spendTotal.toFixed(2)}` : "";
    lines.push(
      `Actions taken under permissions this period: ${actionsTotal} (${byClass})${spendNote}`,
    );
  } else if (live.length > 0) {
    lines.push("Actions taken under permissions this period: none");
  }

  if (escalations > 0) {
    const topReason = Object.entries(escalationReasons).sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    lines.push(
      `Escalations routed to approval this period: ${escalations} (most common reason: ${topReason.replace(/_/g, " ")})`,
    );
  }

  // §2.10 budget-pressure callout: per-class LLM judgment spend today
  // vs the class's declared daily cap.
  const spentByTask: Record<string, number> = {};
  for (const row of inputs.judgmentSpendToday) {
    spentByTask[row.task] = (spentByTask[row.task] ?? 0) + (Number(row.cost_usd) || 0);
  }
  for (const descriptor of listActionClasses()) {
    const budget = descriptor.llm_judgment_budget;
    if (!budget || budget.daily_usd <= 0) continue;
    const spent = spentByTask[`authority.llm_judged.${descriptor.action_class}`] ?? 0;
    const fraction = spent / budget.daily_usd;
    if (fraction >= JUDGMENT_BUDGET_PRESSURE_THRESHOLD) {
      lines.push(
        `Review-budget pressure: ${descriptor.action_class} has used $${spent.toFixed(2)} of its $${budget.daily_usd.toFixed(2)}/day automated-review budget (${Math.round(fraction * 100)}%)${fraction >= 1 ? ` - over budget, fallback "${budget.fallback_on_budget_exhausted === "escalate_to_user" ? "escalate to you" : "structured checks only"}" is active` : ""}`,
      );
    }
  }

  if (inputs.truncated) {
    lines.push(
      "Note: activity was high this period; the figures above cover the most recent actions and may understate the full total.",
    );
  }

  if (lines.length === 0) return null;
  return ["Permissions and authority activity:", ...lines.map((l) => `- ${l}`)].join(
    "\n",
  );
}

interface WindowEventCursor {
  created_at: string;
  id: string;
}

type WindowEventsResult =
  | { rows: LedgerEventRow[]; truncated: boolean; error?: undefined }
  | { rows: LedgerEventRow[]; truncated: false; error: { message: string } };

/**
 * Fully drain the window's authority events with keyset pagination over
 * `(created_at, id)` (CLAUDE.md: keyset on every unbounded ledger read).
 * A single capped `.limit()` would non-deterministically truncate a
 * high-activity account's totals; this walks the whole window in stable
 * order. The page backstop is a runaway guard, not a cost cap — when it
 * trips, the caller surfaces an explicit "may understate" note.
 */
async function fetchWindowEvents(
  admin: SupabaseClient,
  accountId: string,
  since: Date,
): Promise<WindowEventsResult> {
  const rows: LedgerEventRow[] = [];
  let cursor: WindowEventCursor | null = null;

  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    let query = admin
      .from("kinetiks_ledger")
      .select("event_type, detail, created_at, id")
      .eq("account_id", accountId)
      .in("event_type", ["authority_action_taken", "authority_action_escalated"])
      .gte("created_at", since.toISOString());
    if (cursor) {
      // WHERE (created_at, id) > (cursor) via OR composition — the same
      // strict-greater-than keyset idiom as cortex/authority/list.ts,
      // ascending so the window walks forward to completion.
      query = query.or(
        `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
      );
    }
    query = query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(EVENT_PAGE_SIZE);

    const { data, error } = await query;
    if (error) return { rows, truncated: false, error };

    const pageRows = (data ?? []) as Array<
      LedgerEventRow & { created_at: string; id: string }
    >;
    for (const r of pageRows) {
      rows.push({ event_type: r.event_type, detail: r.detail });
    }
    if (pageRows.length < EVENT_PAGE_SIZE) {
      return { rows, truncated: false };
    }
    const last = pageRows[pageRows.length - 1];
    cursor = { created_at: last.created_at, id: last.id };
  }

  // Backstop tripped: return what we have, flagged truncated.
  return { rows, truncated: true };
}

/**
 * Load the inputs and render the block for one account. `since` is the
 * brief's window start (24h/7d/30d per brief type).
 */
export async function buildAuthorityActivitySummary(
  admin: SupabaseClient,
  accountId: string,
  since: Date,
): Promise<string | null> {
  const [grantsRes, eventsResult, spendRes] = await Promise.all([
    admin
      .from("kinetiks_authority_grants")
      .select("id, status, scope_description")
      .eq("account_id", accountId)
      .in("status", ["active", "paused"]),
    // Full-drain keyset read of the window's authority events — the
    // totals must cover the whole window deterministically, not a
    // single capped/unordered slice.
    fetchWindowEvents(admin, accountId, since),
    admin
      .from("kinetiks_ai_calls")
      .select("task, cost_usd")
      .eq("account_id", accountId)
      .eq("status", "success")
      .like("task", "authority.llm_judged.%")
      .gte(
        "started_at",
        new Date(new Date().toISOString().slice(0, 10)).toISOString(),
      ),
  ]);

  // Side-panel posture: a failed read degrades to an absent digest
  // block (never a failed brief — the brief is the spine), captured
  // with a stage tag per the side-panel rule.
  const readError = grantsRes.error ?? eventsResult.error ?? spendRes.error;
  if (readError) {
    await captureException(new Error(readError.message), {
      tags: {
        route: "lib/cortex/authority/digest",
        action: "authority.digest",
        stage: grantsRes.error
          ? "grants"
          : eventsResult.error
            ? "events"
            : "judgment_spend",
        app: "id",
      },
      user: { id: accountId },
      extra: {},
    });
    return null;
  }

  return renderAuthorityActivityBlock({
    grants: (grantsRes.data ?? []) as GrantRow[],
    windowEvents: eventsResult.rows,
    judgmentSpendToday: (spendRes.data ?? []) as JudgmentSpendRow[],
    truncated: eventsResult.truncated,
  });
}
