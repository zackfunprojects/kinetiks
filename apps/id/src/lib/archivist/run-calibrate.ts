import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Pattern, PatternTypeDescriptor } from "@kinetiks/types";
import { getPatternType } from "@kinetiks/tools";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  calibratePattern,
  type CalibrationDecision,
} from "@/lib/patterns/decay-calibration";
import { fetchDecliningCountsForAccount } from "@/lib/patterns/declining-history";

/** Page size when scanning eligible patterns per account. */
const PATTERN_PAGE_SIZE = 100;

/** Lowest known descriptor threshold across the registry (defensive). */
const MIN_OBSERVATION_COUNT_FOR_QUERY = 2;

export interface CalibrationAccountResult {
  account_id: string;
  patterns_evaluated: number;
  patterns_moved: number;
  patterns_skipped: number;
  patterns_raced: number;
  errors: string[];
}

/**
 * Per-account Phase 2 empirical decay calibration. Extracted from
 * `apps/id/src/app/api/archivist/patterns/calibrate/route.ts` so the
 * Phase 3 Workflow dispatcher can invoke the helper directly via the
 * Archivist operator (no self-HTTP).
 *
 * The eligibility query, page size, CAS RPC, and Ledger detail shape
 * are identical to the route's behaviour. The route file still exists
 * and now delegates here.
 */
export async function runArchivistCalibrateForAccount(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  now: Date,
): Promise<CalibrationAccountResult> {
  const result: CalibrationAccountResult = {
    account_id: accountId,
    patterns_evaluated: 0,
    patterns_moved: 0,
    patterns_skipped: 0,
    patterns_raced: 0,
    errors: [],
  };

  try {
    const decliningCounts = await fetchDecliningCountsForAccount({
      admin,
      account_id: accountId,
      now,
    });

    let lastSeenId: string | null = null;
    while (true) {
      let pageQuery = admin
        .from("kinetiks_pattern_library")
        .select("*")
        .eq("account_id", accountId)
        .neq("status", "archived")
        .gte("observation_count", MIN_OBSERVATION_COUNT_FOR_QUERY)
        .order("id", { ascending: true })
        .limit(PATTERN_PAGE_SIZE);
      if (lastSeenId !== null) {
        pageQuery = pageQuery.gt("id", lastSeenId);
      }
      const { data: page, error: pageErr } = await pageQuery;

      if (pageErr) {
        result.errors.push(
          `page after=${lastSeenId ?? "<start>"}: ${pageErr.message} (${pageErr.code})`,
        );
        Sentry.captureException(new Error(pageErr.message), {
          tags: {
            route: "archivist/patterns/calibrate",
            action: "fetch_page",
            stage: "select",
            app: "id",
          },
          extra: { account_id: accountId, last_seen_id: lastSeenId },
        });
        break;
      }
      if (!page || page.length === 0) break;

      for (const row of page) {
        await processPattern({
          pattern: row as unknown as Pattern,
          decliningCounts,
          admin,
          accountId,
          now,
          result,
        });
      }

      if (page.length < PATTERN_PAGE_SIZE) break;
      lastSeenId = (page[page.length - 1] as { id: string }).id;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    result.errors.push(`account loop: ${msg}`);
    Sentry.captureException(err, {
      tags: {
        route: "archivist/patterns/calibrate",
        action: "account_loop",
        stage: "iterate",
        app: "id",
      },
      extra: { account_id: accountId },
    });
  }

  return result;
}

async function processPattern(args: {
  pattern: Pattern;
  decliningCounts: Map<string, number>;
  admin: ReturnType<typeof createAdminClient>;
  accountId: string;
  now: Date;
  result: CalibrationAccountResult;
}): Promise<void> {
  const { pattern, decliningCounts, admin, accountId, now, result } = args;
  result.patterns_evaluated += 1;

  const descriptor: PatternTypeDescriptor | undefined = getPatternType(
    pattern.pattern_type,
  );
  if (!descriptor) {
    result.patterns_skipped += 1;
    return;
  }

  const decision: CalibrationDecision = calibratePattern({
    pattern,
    descriptor,
    recent_declining_count: decliningCounts.get(pattern.id) ?? 0,
    now,
  });

  if (decision.decision !== "extend" && decision.decision !== "shorten") {
    result.patterns_skipped += 1;
    return;
  }

  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    "_kt_apply_pattern_decay_calibration",
    {
      p_account_id: accountId,
      p_pattern_id: pattern.id,
      p_prior_effective_decay_days: decision.prior_effective_decay_days,
      p_prior_updated_at: pattern.updated_at,
      p_next_effective_decay_days: decision.next_effective_decay_days,
      p_next_decay_at: decision.next_decay_at,
      p_ledger_detail: {
        pattern_id: pattern.id,
        pattern_type: pattern.pattern_type,
        prior_effective_decay_days: decision.prior_effective_decay_days,
        next_effective_decay_days: decision.next_effective_decay_days,
        prior_decay_at: decision.prior_decay_at,
        next_decay_at: decision.next_decay_at,
        observed_variance: pattern.variance,
        observation_count: pattern.observation_count,
        declining_transitions_in_window:
          decliningCounts.get(pattern.id) ?? 0,
        decision: decision.decision,
        rationale: decision.rationale,
      },
    },
  );

  if (rpcErr) {
    result.errors.push(`rpc ${pattern.id}: ${rpcErr.message}`);
    Sentry.captureException(new Error(rpcErr.message), {
      tags: {
        route: "archivist/patterns/calibrate",
        action: "apply_calibration_rpc",
        stage: "rpc",
        app: "id",
      },
      extra: {
        account_id: accountId,
        pattern_id: pattern.id,
        pattern_type: pattern.pattern_type,
        decision: decision.decision,
      },
    });
    return;
  }

  const applied =
    typeof rpcResult === "object" &&
    rpcResult !== null &&
    (rpcResult as { applied?: unknown }).applied === true;

  if (!applied) {
    result.patterns_raced += 1;
    return;
  }

  result.patterns_moved += 1;
}
