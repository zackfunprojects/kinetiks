/**
 * POST /api/cortex/patterns/import
 *
 * Per addendum §1.10. Conservative re-emerging import of a Pattern
 * Library export. Cross-account is allowed (the customer's own data,
 * e.g. trial→production migration); the destination account's audit
 * trail records a hash of the source account_id.
 *
 * Auth: user session (customer-owned data).
 *
 * Per-pattern behavior:
 *   - Look up the PatternTypeDescriptor; unregistered → skip with
 *     "errors" entry
 *   - Validate dimensions against descriptor.dimensions_schema; on
 *     failure → skip
 *   - Compute fresh fingerprint via the descriptor's
 *     fingerprint_dimensions ordering
 *   - If a pattern already exists at (account_id, pattern_type,
 *     fingerprint), skip (the import does not overwrite live data;
 *     customer must explicitly archive)
 *   - Insert with: account_id rewritten, status='emerging',
 *     confidence_score / 2, effective_decay_days = descriptor.initial,
 *     decay_at = now + initial, observation_count preserved,
 *     dimensions/outcome_metrics/applies_to_icp/user_annotation
 *     preserved, user_starred = false, user_suppressed = false,
 *     evidence_summary reset (the source Ledger ids are not portable)
 *   - Write a pattern_imported Ledger entry with hashed source
 *     attribution
 */

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { getPatternType } from "@kinetiks/tools";
import { computeFingerprint } from "@/lib/patterns/fingerprint";
import type {
  PatternExportEntry,
  PatternExportPayload,
  PatternImportResult,
} from "@kinetiks/types";

const SUPPORTED_SCHEMA_VERSIONS = ["2027-1"] as const;

export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) return apiError("Not authenticated", 401);

  let body: PatternExportPayload;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as PatternExportPayload;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(body.schema_version as (typeof SUPPORTED_SCHEMA_VERSIONS)[number])) {
    return apiError(
      `Unsupported schema_version '${String(body.schema_version)}'. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
      400,
    );
  }
  if (!Array.isArray(body.patterns)) {
    return apiError("patterns must be an array", 400);
  }

  const admin = createAdminClient();

  // Resolve the destination account.
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!account) return apiError("No Kinetiks account for this user", 404);

  // Hash source account id (preserve attribution without leaking the
  // raw id into the destination Ledger).
  const sourceAccountHash =
    typeof body.account_id === "string" && body.account_id.length > 0
      ? createHash("sha256").update(body.account_id).digest("hex").slice(0, 16)
      : null;

  const result: PatternImportResult = { imported: 0, skipped: 0, errors: [] };
  const now = new Date();

  for (const entry of body.patterns as PatternExportEntry[]) {
    if (!entry || typeof entry !== "object" || !entry.pattern_type) {
      result.skipped += 1;
      result.errors.push({
        pattern_type: String(entry?.pattern_type ?? "unknown"),
        reason: "malformed entry",
      });
      continue;
    }

    const descriptor = getPatternType(entry.pattern_type);
    if (!descriptor) {
      result.skipped += 1;
      result.errors.push({
        pattern_type: entry.pattern_type,
        reason: `pattern_type '${entry.pattern_type}' is not registered`,
      });
      continue;
    }

    // Validate dimensions against the descriptor.
    const parsedDims = descriptor.dimensions_schema.safeParse(entry.dimensions ?? {});
    if (!parsedDims.success) {
      result.skipped += 1;
      result.errors.push({
        pattern_type: entry.pattern_type,
        reason: `dimensions failed schema validation: ${parsedDims.error.issues
          .map((i) => i.message)
          .join("; ")}`,
      });
      continue;
    }

    let fingerprint: string;
    try {
      ({ fingerprint } = computeFingerprint(descriptor, parsedDims.data as Record<string, unknown>));
    } catch (err) {
      const message = err instanceof Error ? err.message : "fingerprint failed";
      result.skipped += 1;
      result.errors.push({
        pattern_type: entry.pattern_type,
        reason: `fingerprint computation failed: ${message}`,
      });
      continue;
    }

    // Skip if a pattern already exists; do not overwrite live data.
    const { data: existing } = await admin
      .from("kinetiks_pattern_library")
      .select("id")
      .eq("account_id", account.id)
      .eq("pattern_type", entry.pattern_type)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    if (existing) {
      result.skipped += 1;
      result.errors.push({
        pattern_type: entry.pattern_type,
        fingerprint,
        reason: "pattern already exists at this fingerprint; archive existing first to import again",
      });
      continue;
    }

    // Conservative re-emerging insert.
    const initialDecayDays = descriptor.decay_bounds.initial_decay_days;
    const halvedConfidence = Math.max(0, Math.min(1, (entry.confidence_score ?? 0) / 2));
    const nowIso = now.toISOString();
    const decayAt = new Date(now.getTime() + initialDecayDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: inserted, error: insertError } = await admin
      .from("kinetiks_pattern_library")
      .insert({
        account_id: account.id,
        team_scope_id: null,
        pattern_type: entry.pattern_type,
        emitting_app: entry.emitting_app,
        applies_to_icp: entry.applies_to_icp ?? null,
        fingerprint,
        status: "emerging",
        confidence_score: halvedConfidence,
        observation_count: Math.max(0, entry.observation_count ?? 0),
        first_observed_at: nowIso,
        last_observed_at: nowIso,
        effective_decay_days: initialDecayDays,
        decay_at: decayAt,
        validated_at: null,
        declining_at: null,
        archived_at: null,
        user_starred: false,
        user_suppressed: false,
        user_annotation: entry.user_annotation ?? null,
        dimensions: parsedDims.data,
        outcome_metrics: entry.outcome_metrics ?? [],
        evidence_summary: {
          last_n_ledger_ids: [],
          summary: {
            total_evidence_count: Math.max(0, entry.observation_count ?? 0),
            period_days: 0,
            primary_metric: descriptor.valid_outcome_metrics[0]?.name ?? "",
            primary_metric_value:
              (entry.outcome_metrics?.find(
                (m) => m.metric_name === descriptor.valid_outcome_metrics[0]?.name,
              )?.value ?? 0),
          },
        },
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      result.skipped += 1;
      result.errors.push({
        pattern_type: entry.pattern_type,
        fingerprint,
        reason: `insert failed: ${insertError?.message ?? "unknown"}`,
      });
      continue;
    }

    await admin.from("kinetiks_ledger").insert({
      account_id: account.id,
      event_type: "pattern_imported",
      source_app: "kinetiks_id",
      source_operator: "cortex_ui",
      target_layer: null,
      detail: {
        pattern_id: inserted.id,
        pattern_type: entry.pattern_type,
        imported_from_account_id_hash: sourceAccountHash,
        original_confidence_score: entry.confidence_score,
        schema_version: body.schema_version,
      },
    });

    result.imported += 1;
  }

  return apiSuccess<PatternImportResult>(result);
}
