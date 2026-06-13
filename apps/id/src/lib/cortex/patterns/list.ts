/**
 * Shared Pattern Library read helper per the Kinetiks Contract Addendum §1.5.
 *
 * Both the `query_patterns` tool and the Cortex Patterns Server Action
 * (commit 17) call this. The single shared helper enforces the
 * orthogonal read-side axes:
 *
 *   - caller_app !== "customer_ui": include only patterns whose
 *     descriptor.read_apps contains caller_app
 *   - caller_app === "customer_ui": include only patterns whose
 *     descriptor.customer_visible === true
 *
 * Default ordering: lift_ratio DESC NULLS LAST, confidence_score DESC,
 * last_observed_at DESC, observation_count DESC. Per canonical §1.5
 * the lift_ratio drives ranking (when present); confidence + recency
 * + observation breadth break ties. Suppressed patterns excluded by default;
 * archived patterns excluded unless explicitly requested via
 * `include_archived: true` (the tool never requests it; the UI requests
 * it via the dedicated archived view).
 *
 * Confidence is projected at read time per §1.6: suppressed patterns
 * surface with confidence_score = 0; storage is unchanged.
 *
 * Server-side only: imports `server-only` so client bundles fail at
 * compile time on accidental import.
 */

import "server-only";
import {
  getPatternType,
  listCustomerVisiblePatternTypes,
  listPatternTypesForReadingApp,
} from "@kinetiks/tools";
import type { Pattern, PatternLifecycleStatus } from "@kinetiks/types";
import { projectConfidenceForRead } from "@/lib/patterns/confidence";

/** Either an agent app key or the special UI-context sentinel. */
export type PatternReadCaller = string | "customer_ui";

export interface ListPatternsInput {
  account_id: string;
  caller_app: PatternReadCaller;
  pattern_types?: string[];
  source_apps?: string[];
  applies_to_icp?: string | null;
  minimum_confidence?: number;
  status_in?: ReadonlyArray<Exclude<PatternLifecycleStatus, "archived">>;
  exclude_user_suppressed?: boolean;
  /** Customer UI only: when true, include archived patterns. */
  include_archived?: boolean;
  /** Customer UI / Marcus brief: when true, only starred patterns. */
  only_starred?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListPatternsResult {
  patterns: Pattern[];
  total: number;
}

/** Minimal admin client seam (same shape as patterns/db-adapter). */
interface AdminLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function listPatterns(
  admin: AdminLike,
  input: ListPatternsInput,
): Promise<ListPatternsResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, input.offset ?? 0);
  const excludeSuppressed = input.exclude_user_suppressed ?? true;
  const statusFilter: PatternLifecycleStatus[] = input.include_archived
    ? ["emerging", "validated", "declining", "archived"]
    : input.status_in
      ? [...input.status_in]
      : ["emerging", "validated", "declining"];

  // Resolve which pattern_types are visible to this caller. Then either
  // intersect with the caller-supplied filter or use the visible set as
  // the filter.
  const visibleByContext =
    input.caller_app === "customer_ui"
      ? listCustomerVisiblePatternTypes().map((d) => d.pattern_type)
      : listPatternTypesForReadingApp(input.caller_app).map((d) => d.pattern_type);

  // Defense-in-depth: when an agent app asks for specific pattern_types,
  // intersect with read_apps allowance. Types outside the allowance are
  // dropped, and (E3) the drop is LEDGERED for agent callers: the
  // allowlist is a contract boundary, and a denial with no audit trail
  // is enforcement the customer can never see. Unregistered keys are
  // typos, not denials; customer_ui visibility filtering is routine
  // surface scoping. Neither writes an entry.
  let deniedTypes: string[] = [];
  const requestedTypes = input.pattern_types && input.pattern_types.length > 0
    ? input.pattern_types.filter((t) => {
        const d = getPatternType(t);
        if (!d) return false;
        if (input.caller_app === "customer_ui") return d.customer_visible;
        if (!d.read_apps.includes(input.caller_app)) {
          deniedTypes.push(t);
          return false;
        }
        return true;
      })
    : visibleByContext;

  if (deniedTypes.length > 0 && input.caller_app !== "customer_ui") {
    await recordPatternReadDenial(admin, {
      account_id: input.account_id,
      caller_app: input.caller_app,
      denied_pattern_types: deniedTypes,
    });
  }

  if (requestedTypes.length === 0) {
    return { patterns: [], total: 0 };
  }

  // Build the query. Use count: 'exact' on a single round-trip to
  // produce both total and the page.
  let query = admin
    .from("kinetiks_pattern_library")
    .select("*", { count: "exact" })
    .eq("account_id", input.account_id)
    .in("pattern_type", requestedTypes)
    .in("status", statusFilter);

  if (input.source_apps && input.source_apps.length > 0) {
    query = query.in("source_app", input.source_apps);
  }
  if (input.applies_to_icp !== undefined) {
    if (input.applies_to_icp === null) {
      query = query.is("applies_to_icp", null);
    } else {
      query = query.eq("applies_to_icp", input.applies_to_icp);
    }
  }
  if (input.minimum_confidence !== undefined) {
    query = query.gte("confidence_score", input.minimum_confidence);
  }
  if (excludeSuppressed) {
    query = query.eq("user_suppressed", false);
  }
  if (input.only_starred) {
    query = query.eq("user_starred", true);
  }

  query = query
    .order("lift_ratio", { ascending: false, nullsFirst: false })
    .order("confidence_score", { ascending: false })
    .order("last_observed_at", { ascending: false })
    .order("observation_count", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    throw new Error(
      `cortex/patterns list: ${error.message} (${error.code ?? "no_code"})`,
    );
  }
  const rows = (data ?? []) as Pattern[];

  // Read-time confidence projection per §1.6.
  const projected = rows.map((row) => ({
    ...row,
    confidence_score: projectConfidenceForRead({
      stored_score: row.confidence_score,
      user_suppressed: row.user_suppressed,
    }),
  }));

  return { patterns: projected, total: typeof count === "number" ? count : projected.length };
}


/**
 * E3 — append-only audit entry for an allowlist denial. Best-effort:
 * the read result is identical whether the entry lands or not, so a
 * Ledger failure degrades to Sentry, never to a failed read.
 */
async function recordPatternReadDenial(
  admin: AdminLike,
  args: {
    account_id: string;
    caller_app: string;
    denied_pattern_types: string[];
  },
): Promise<void> {
  try {
    const { error } = await admin.from("kinetiks_ledger").insert({
      account_id: args.account_id,
      event_type: "pattern_read_denied",
      source_app: "kinetiks_id",
      source_operator: "pattern_read_allowlist",
      detail: {
        caller_app: args.caller_app,
        denied_pattern_types: args.denied_pattern_types.slice(0, 20),
        denied_count: args.denied_pattern_types.length,
      },
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    const { captureException } = await import("@/lib/observability/sentry");
    await captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: {
        route: "lib/cortex/patterns/list",
        action: "pattern_read_denied",
        stage: "ledger",
        app: "id",
      },
      user: { id: args.account_id },
      extra: { callerApp: args.caller_app },
    });
  }
}
