/**
 * POST /api/synapse/patterns
 *
 * Emission endpoint for the Pattern Library per the 2027 addendum §1.4.
 * Suite apps' Synapse clients call this with a `PatternEmissionPayload`;
 * the Archivist write path runs synchronously and returns a discriminated
 * `PatternEmissionResult`.
 *
 * Auth: user session, API key, or internal service secret (`requireAuth`
 * with allowInternal). Suite apps in production hold a service secret
 * and post on behalf of an account; an authenticated user posting via
 * the dev tool must own the account.
 *
 * Validation chain (matches §1.4):
 *   1. Auth + JSON parse
 *   2. account ownership (if not internal)
 *   3. Synapse row exists and status === 'active' for the emitting app
 *   4. Pattern Type Registry lookup (rejected_unregistered_type)
 *   5. emitting_app is in descriptor.emitting_apps (rejected_emitting_app)
 *   6. dimensions validated against descriptor.dimensions_schema
 *      (rejected_schema)
 *   7. descriptor.bucketize(dimensions) applied (no-op if absent)
 *   8. outcome_metrics names + units validated against descriptor
 *      (rejected_metric_unit)
 *   9. Fingerprint computed server-side
 *  10. writePatternEmission() runs the arbitration pipeline
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import {
  assertPatternType,
  getPatternType,
} from "@kinetiks/tools";
import type {
  PatternEmissionPayload,
  PatternEmissionResult,
  PatternOutcomeMetric,
} from "@kinetiks/types";
import { computeFingerprint, FingerprintError } from "@/lib/patterns/fingerprint";
import { writePatternEmission } from "@/lib/patterns/pattern-write";
import { createPatternWriteDb } from "@/lib/patterns/db-adapter";

interface PatternsRequestBody {
  account_id?: unknown;
  emitting_app?: unknown;
  pattern_type?: unknown;
  dimensions?: unknown;
  outcome_metrics?: unknown;
  applies_to_icp?: unknown;
  evidence_refs?: unknown;
}

function isOutcomeMetric(m: unknown): m is PatternOutcomeMetric {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  return (
    typeof x.metric_name === "string" &&
    typeof x.value === "number" &&
    Number.isFinite(x.value) &&
    typeof x.sample_count === "number" &&
    Number.isInteger(x.sample_count) &&
    x.sample_count >= 0 &&
    typeof x.confidence === "number" &&
    x.confidence >= 0 &&
    x.confidence <= 1 &&
    typeof x.unit === "string"
  );
}

export async function POST(request: Request) {
  const { auth, error: authError } = await requireAuth(request, {
    allowInternal: true,
  });
  if (authError) return authError;

  let body: PatternsRequestBody;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as PatternsRequestBody;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  // ── 1. Required fields ───────────────────────────────────────
  const accountId = body.account_id;
  const emittingApp = body.emitting_app;
  const patternType = body.pattern_type;
  const dimensions = body.dimensions;
  const outcomeMetrics = body.outcome_metrics;
  const evidenceRefs = body.evidence_refs;
  const appliesToIcp = body.applies_to_icp;

  if (typeof accountId !== "string" || accountId.length === 0) {
    return apiError("Missing or invalid account_id", 400);
  }
  if (typeof emittingApp !== "string" || emittingApp.length === 0) {
    return apiError("Missing or invalid emitting_app", 400);
  }
  if (typeof patternType !== "string" || patternType.length === 0) {
    return apiError("Missing or invalid pattern_type", 400);
  }
  if (
    !dimensions ||
    typeof dimensions !== "object" ||
    Array.isArray(dimensions)
  ) {
    return apiError("dimensions must be a non-null object", 400);
  }
  if (!Array.isArray(outcomeMetrics) || outcomeMetrics.length === 0) {
    return apiError("outcome_metrics must be a non-empty array", 400);
  }
  if (!outcomeMetrics.every(isOutcomeMetric)) {
    return apiError(
      "outcome_metrics[i] must be { metric_name, value, sample_count, confidence, unit }",
      400,
    );
  }
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.every((r) => typeof r === "string" && r.length > 0)) {
    return apiError("evidence_refs must be an array of non-empty strings", 400);
  }
  if (
    appliesToIcp !== undefined &&
    appliesToIcp !== null &&
    typeof appliesToIcp !== "string"
  ) {
    return apiError("applies_to_icp must be a string, null, or omitted", 400);
  }

  const admin = createAdminClient();

  // ── 2. Account ownership (non-internal callers) ──────────────
  if (auth.auth_method !== "internal") {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", auth.user_id)
      .single();
    if (!account) {
      return apiError("Forbidden: account does not belong to you", 403);
    }
  }

  // ── 3. Synapse active for the emitting app ───────────────────
  const { data: synapse, error: synapseError } = await admin
    .from("kinetiks_synapses")
    .select("status")
    .eq("account_id", accountId)
    .eq("app_name", emittingApp)
    .maybeSingle();
  if (synapseError) {
    console.error(
      `pattern emission synapse lookup failed account=${accountId} app=${emittingApp}: ${synapseError.message}`,
    );
    return apiError("Failed to verify synapse", 500);
  }
  if (!synapse) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_inactive_synapse",
      reason: `No Synapse found for app '${String(emittingApp)}' on this account`,
    });
  }
  if (synapse.status !== "active") {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_inactive_synapse",
      reason: `Synapse for '${String(emittingApp)}' is not active (status: ${String(synapse.status)})`,
    });
  }

  // ── 4. Pattern Type Registry lookup ──────────────────────────
  const descriptor = getPatternType(patternType);
  if (!descriptor) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_unregistered_type",
      reason: `Pattern type '${patternType}' is not registered`,
    });
  }

  // ── 5. emitting_app gate ─────────────────────────────────────
  if (!descriptor.emitting_apps.includes(emittingApp)) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_emitting_app",
      reason: `App '${emittingApp}' is not in emitting_apps for ${descriptor.pattern_type}`,
    });
  }

  // ── 6. Apply bucketize then validate dimensions ──────────────
  let bucketized: Record<string, unknown>;
  try {
    bucketized = descriptor.bucketize
      ? (descriptor.bucketize(dimensions as never) as Record<string, unknown>)
      : (dimensions as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bucketize threw";
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_schema",
      reason: `bucketize failed: ${message}`,
    });
  }

  const parsed = descriptor.dimensions_schema.safeParse(bucketized);
  if (!parsed.success) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_schema",
      reason: "dimensions failed schema validation",
      zod_issues: parsed.error.issues,
    });
  }

  // ── 7. outcome metric name + unit validation ─────────────────
  for (const m of outcomeMetrics as PatternOutcomeMetric[]) {
    const known = descriptor.valid_outcome_metrics.find(
      (v) => v.name === m.metric_name,
    );
    if (!known) {
      return apiSuccess<PatternEmissionResult>({
        outcome: "rejected_metric_unit",
        reason: `metric '${m.metric_name}' is not in valid_outcome_metrics for ${descriptor.pattern_type}`,
        metric_name: m.metric_name,
      });
    }
    if (known.unit !== m.unit) {
      return apiSuccess<PatternEmissionResult>({
        outcome: "rejected_metric_unit",
        reason: `metric '${m.metric_name}' expects unit '${known.unit}', got '${m.unit}'`,
        metric_name: m.metric_name,
      });
    }
  }

  // ── 8. Fingerprint (server-side only) ────────────────────────
  let fingerprint: string;
  try {
    // Re-use the bucketized dimensions we already computed and validated.
    ({ fingerprint } = computeFingerprint(descriptor, parsed.data as Record<string, unknown>));
  } catch (err) {
    if (err instanceof FingerprintError) {
      return apiSuccess<PatternEmissionResult>({
        outcome: "rejected_schema",
        reason: `fingerprint computation failed: ${err.message}`,
      });
    }
    throw err;
  }

  // ── 9. writePatternEmission via the production DB adapter ────
  // We bind to a non-strict admin client here because the seam shape
  // does not need the Database generic to function. Use the production
  // adapter; pattern-write knows nothing about Supabase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createPatternWriteDb(admin as any);
  const emissionPayload: PatternEmissionPayload = {
    pattern_type: patternType,
    dimensions: dimensions as Record<string, unknown>,
    outcome_metrics: outcomeMetrics as PatternOutcomeMetric[],
    applies_to_icp: (appliesToIcp as string | null | undefined) ?? null,
    evidence_refs: evidenceRefs as string[],
  };

  try {
    // assertPatternType not used directly; the getPatternType lookup
    // above suffices and produces a typed rejection. Calling it again
    // would throw on missing; we want the structured rejection instead.
    void assertPatternType;
    const result = await writePatternEmission(
      {
        account_id: accountId,
        emitting_app: emittingApp,
        descriptor,
        bucketized_dimensions: parsed.data as Record<string, unknown>,
        fingerprint,
        payload: emissionPayload,
      },
      db,
    );
    return apiSuccess<PatternEmissionResult>(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(
      `pattern emission failed account=${accountId} app=${emittingApp} type=${patternType}: ${message}`,
    );
    return apiError("Failed to record pattern emission", 500);
  }
}
