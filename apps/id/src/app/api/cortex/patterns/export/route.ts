/**
 * GET /api/cortex/patterns/export
 *
 * Per addendum §1.10. Full Pattern Library export, customer-owned data.
 * Includes all statuses (archived too) with user_starred / user_suppressed
 * / user_annotation preserved.
 *
 * Auth: user session (not internal). Customer-data-portability is a
 * customer right; internal callers can use the DB directly.
 *
 * Rate limit: 5 per hour per account, via Ledger-based counting on the
 * existing composite index from migration 00004_ledger_rate_limit_index.sql.
 *
 * Writes a single `pattern_exported` Ledger entry per export.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/utils/api-response";
import type {
  Pattern,
  PatternExportPayload,
  PatternExportEntry,
} from "@kinetiks/types";

const EXPORT_RATE_LIMIT_PER_HOUR = 5;

export async function GET(_request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    return apiError("Not authenticated", 401);
  }

  const admin = createAdminClient();

  // Resolve the user's primary account. Phase 1 is single-account; v2
  // multi-team scoping will accept an account_id param.
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!account) {
    return apiError("No Kinetiks account for this user", 404);
  }

  // ── Rate limit: count pattern_exported entries in the last hour ──
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentExports, error: countError } = await admin
    .from("kinetiks_ledger")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("event_type", "pattern_exported")
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error(
      `pattern export rate-limit count failed account=${account.id}: ${countError.message}`,
    );
    return apiError("Could not verify rate limit", 500);
  }

  if (typeof recentExports === "number" && recentExports >= EXPORT_RATE_LIMIT_PER_HOUR) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Export rate limit reached (${EXPORT_RATE_LIMIT_PER_HOUR} per hour). Try again later.`,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // ── Pull all patterns for the account (no status filter) ──
  const { data: rows, error } = await admin
    .from("kinetiks_pattern_library")
    .select("*")
    .eq("account_id", account.id)
    .order("pattern_type", { ascending: true })
    .order("first_observed_at", { ascending: true });

  if (error) {
    console.error(
      `pattern export read failed account=${account.id}: ${error.message}`,
    );
    return apiError("Could not read patterns", 500);
  }

  const patterns = (rows ?? []) as unknown as Pattern[];

  const exportEntries: PatternExportEntry[] = patterns.map((p) => ({
    pattern_type: p.pattern_type,
    emitting_app: p.emitting_app,
    applies_to_icp: p.applies_to_icp,
    status: p.status,
    confidence_score: p.confidence_score,
    observation_count: p.observation_count,
    first_observed_at: p.first_observed_at,
    last_observed_at: p.last_observed_at,
    effective_decay_days: p.effective_decay_days,
    user_starred: p.user_starred,
    user_suppressed: p.user_suppressed,
    user_annotation: p.user_annotation,
    dimensions: p.dimensions,
    outcome_metrics: p.outcome_metrics,
  }));

  const payload: PatternExportPayload = {
    schema_version: "2027-1",
    exported_at: new Date().toISOString(),
    account_id: account.id,
    patterns: exportEntries,
  };

  // ── Audit log: pattern_exported ──
  await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "pattern_exported",
    source_app: "kinetiks_id",
    source_operator: "cortex_ui",
    target_layer: null,
    detail: {
      pattern_count: exportEntries.length,
      schema_version: "2027-1",
    },
  });

  const filename = `kinetiks-patterns-${account.id}-${new Date().toISOString().split("T")[0]}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
