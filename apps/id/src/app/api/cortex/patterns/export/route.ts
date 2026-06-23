/**
 * GET /api/cortex/patterns/export
 *
 * Per the Kinetiks Contract Addendum §1.7. Full Pattern Library export,
 * customer-owned data.
 *
 * Canonical L1b shape:
 *   - Includes all statuses (archived too) with user_starred /
 *     user_suppressed / user_annotation preserved
 *   - export_type: 'full' | 'filtered' (set by whether request filters
 *     were provided)
 *   - filters: echo of the request filters per canonical
 *   - pattern_type_registry_snapshot: descriptors for every
 *     pattern_type present in the export, so cross-account imports
 *     have the context to validate
 *   - Single-primary outcome columns per row (outcome_metric, value,
 *     direction, baseline_value, lift_ratio) + sample_size + variance
 *     + source_app + source_workflow_id + imported + imported_from
 *
 * Auth: user session (not internal). Customer-data-portability is a
 * customer right; internal callers can use the DB directly.
 *
 * Rate limit: 5 per hour per account, via Ledger-based counting on the
 * existing composite index from migration
 * 00004_ledger_rate_limit_index.sql.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/utils/api-response";
import { captureException, captureMessage } from "@/lib/observability/sentry";
import { getPatternType } from "@kinetiks/tools";
import type {
  Pattern,
  PatternExportEntry,
  PatternExportPayload,
  PatternExportRequest,
  PatternLifecycleStatus,
  PatternOutcomeDirection,
  PatternTypeDescriptorSnapshot,
} from "@kinetiks/types";

const EXPORT_RATE_LIMIT_PER_HOUR = 5;

const VALID_STATUSES: PatternLifecycleStatus[] = [
  "emerging",
  "validated",
  "declining",
  "archived",
];

function parseFilters(url: URL): PatternExportRequest {
  const pattern_types =
    url.searchParams.get("pattern_types")?.split(",").filter(Boolean) ?? undefined;
  const source_apps =
    url.searchParams.get("source_apps")?.split(",").filter(Boolean) ?? undefined;
  const status_raw = url.searchParams.get("status_in")?.split(",").filter(Boolean);
  const status_in =
    status_raw && status_raw.length > 0
      ? (status_raw.filter((s): s is PatternLifecycleStatus =>
          VALID_STATUSES.includes(s as PatternLifecycleStatus),
        ) as PatternLifecycleStatus[])
      : undefined;
  return {
    pattern_types,
    source_apps,
    status_in,
    format: "json",
  };
}

function snapshotDescriptor(patternType: string): PatternTypeDescriptorSnapshot | null {
  const d = getPatternType(patternType);
  if (!d) return null;
  return {
    pattern_type: d.pattern_type,
    source_app: d.source_app,
    description: d.description,
    fingerprint_dimensions: d.fingerprint_dimensions.map(String),
    outcome_metric: d.outcome_metric,
    outcome_unit: d.outcome_unit,
    outcome_direction: d.outcome_direction,
    read_apps: [...d.read_apps],
    customer_visible: d.customer_visible,
    decay_bounds: {
      initial_decay_days: d.decay_bounds.initial_decay_days,
      decay_floor_days: d.decay_bounds.decay_floor_days,
      decay_ceiling_days: d.decay_bounds.decay_ceiling_days,
      calibration_sample_threshold: d.decay_bounds.calibration_sample_threshold,
    },
    confidence_thresholds: {
      validate_at: d.confidence_thresholds.validate_at,
      decline_at: d.confidence_thresholds.decline_at,
    },
    expected_max_fingerprints_per_account:
      d.expected_max_fingerprints_per_account ?? null,
  };
}

export async function GET(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return apiError("Not authenticated", 401);

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!account) return apiError("No Kinetiks account for this user", 404);

  // ── Rate limit ───────────────────────────────────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentExports, error: countError } = await admin
    .from("kinetiks_ledger")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("event_type", "pattern_exported")
    .gte("created_at", oneHourAgo);

  if (countError) {
    await captureException(countError, {
      tags: {
        route: "/api/cortex/patterns/export",
        action: "patterns.export.rate_limit_count",
        stage: "query",
        app: "id",
      },
      user: { id: account.id },
    });
    return apiError("Could not verify rate limit", 500);
  }

  if (typeof recentExports === "number" && recentExports >= EXPORT_RATE_LIMIT_PER_HOUR) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Export rate limit reached (${EXPORT_RATE_LIMIT_PER_HOUR} per hour). Try again later.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Parse filters from request ───────────────────────────────
  const url = new URL(request.url);
  const filters = parseFilters(url);
  const isFiltered =
    Boolean(filters.pattern_types?.length) ||
    Boolean(filters.source_apps?.length) ||
    Boolean(filters.status_in?.length);
  const exportType: PatternExportPayload["export_type"] = isFiltered ? "filtered" : "full";

  // ── Pull patterns ───────────────────────────────────────────
  let query = admin
    .from("kinetiks_pattern_library")
    .select("*")
    .eq("account_id", account.id)
    .order("pattern_type", { ascending: true })
    .order("first_observed_at", { ascending: true });

  if (filters.pattern_types?.length) {
    query = query.in("pattern_type", filters.pattern_types);
  }
  if (filters.source_apps?.length) {
    query = query.in("source_app", filters.source_apps);
  }
  if (filters.status_in?.length) {
    query = query.in("status", filters.status_in);
  }

  const { data: rows, error } = await query;
  if (error) {
    await captureException(error, {
      tags: {
        route: "/api/cortex/patterns/export",
        action: "patterns.export.read",
        stage: "query",
        app: "id",
      },
      user: { id: account.id },
    });
    return apiError("Could not read patterns", 500);
  }

  const patterns = (rows ?? []) as unknown as Pattern[];

  const exportEntries: PatternExportEntry[] = patterns.map((p) => ({
    id: p.id,
    pattern_type: p.pattern_type,
    source_app: p.source_app,
    source_workflow_id: p.source_workflow_id,
    applies_to_icp: p.applies_to_icp,
    status: p.status,
    outcome_metric: p.outcome_metric,
    outcome_value: p.outcome_value,
    outcome_direction: p.outcome_direction as PatternOutcomeDirection,
    baseline_value: p.baseline_value,
    lift_ratio: p.lift_ratio,
    sample_size: p.sample_size,
    observation_count: p.observation_count,
    variance: p.variance,
    confidence_score: p.confidence_score,
    first_observed_at: p.first_observed_at,
    last_observed_at: p.last_observed_at,
    effective_decay_days: p.effective_decay_days,
    user_starred: p.user_starred,
    user_suppressed: p.user_suppressed,
    user_annotation: p.user_annotation,
    dimensions: p.dimensions,
  }));

  // Build registry snapshot for every pattern_type in the export.
  const uniqueTypes = Array.from(new Set(exportEntries.map((e) => e.pattern_type)));
  const registrySnapshot: PatternTypeDescriptorSnapshot[] = [];
  for (const t of uniqueTypes) {
    const snap = snapshotDescriptor(t);
    if (snap) registrySnapshot.push(snap);
    else {
      // Expected non-fatal degradation: the export still succeeds (200) with this
      // one registry snapshot omitted. Record as a message, not an exception, so a
      // green export of a deprecated pattern_type does not file a Sentry error.
      await captureMessage(
        "pattern export: pattern_type not in registry; descriptor snapshot omitted",
        {
          tags: {
            route: "/api/cortex/patterns/export",
            action: "patterns.export.snapshot_descriptor",
            stage: "execute",
            app: "id",
          },
          user: { id: account.id },
          extra: { pattern_type: t },
        },
      );
    }
  }

  const payload: PatternExportPayload = {
    schema_version: "1.0.0",
    exported_at: new Date().toISOString(),
    account_id: account.id,
    export_type: exportType,
    filters,
    patterns: exportEntries,
    pattern_type_registry_snapshot: registrySnapshot,
  };

  // ── Audit log ────────────────────────────────────────────────
  await admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "pattern_exported",
    source_app: "kinetiks_id",
    source_operator: "cortex_ui",
    target_layer: null,
    detail: {
      pattern_count: exportEntries.length,
      schema_version: "1.0.0",
      export_type: exportType,
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
