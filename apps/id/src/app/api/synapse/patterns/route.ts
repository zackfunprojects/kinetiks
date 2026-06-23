/**
 * POST /api/synapse/patterns
 *
 * Emission endpoint for the Pattern Library per the Kinetiks Contract
 * Addendum §1.4. Suite apps' Synapse clients call this with a
 * `PatternEmissionPayload` (canonical single-primary outcome shape);
 * the Archivist write path runs synchronously and returns a
 * discriminated `PatternEmissionResult`.
 *
 * Auth: user session, API key, or internal service secret (`requireAuth`
 * with allowInternal). Suite apps hold a service secret; an
 * authenticated user posting via a dev tool must own the account.
 *
 * Validation chain:
 *   1. Auth + JSON parse
 *   2. account ownership (if not internal)
 *   3. Synapse row exists and status === 'active'
 *   4. Pattern Type Registry lookup → rejected_unregistered_type
 *   5. source_app matches descriptor.source_app → rejected_source_app
 *   6. dimensions validated against descriptor.dimensions_schema
 *      (after descriptor.bucketize) → rejected_schema
 *   7. outcome_metric matches descriptor.outcome_metric →
 *      rejected_outcome_mismatch
 *   8. Fingerprint computed server-side
 *   9. writePatternEmission() runs the arbitration pipeline
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { getPatternType } from "@kinetiks/tools";
import type {
  PatternEmissionPayload,
  PatternEmissionResult,
  PatternOutcomeDirection,
} from "@kinetiks/types";
import { computeFingerprint, FingerprintError } from "@/lib/patterns/fingerprint";
import { writePatternEmission } from "@/lib/patterns/pattern-write";
import { createPatternWriteDb } from "@/lib/patterns/db-adapter";

interface PatternsRequestBody {
  account_id?: unknown;
  source_app?: unknown;
  pattern_type?: unknown;
  dimensions?: unknown;
  outcome_metric?: unknown;
  outcome_value?: unknown;
  outcome_direction?: unknown;
  baseline_value?: unknown;
  sample_size?: unknown;
  variance?: unknown;
  source_workflow_id?: unknown;
  applies_to_icp?: unknown;
  evidence_refs?: unknown;
}

function isOutcomeDirection(v: unknown): v is PatternOutcomeDirection {
  return v === "higher_is_better" || v === "lower_is_better";
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
  const sourceApp = body.source_app;
  const patternType = body.pattern_type;
  const dimensions = body.dimensions;
  const outcomeMetric = body.outcome_metric;
  const outcomeValue = body.outcome_value;
  const outcomeDirection = body.outcome_direction;
  const baselineValue = body.baseline_value;
  const sampleSize = body.sample_size;
  const variance = body.variance;
  const sourceWorkflowId = body.source_workflow_id;
  const evidenceRefs = body.evidence_refs;
  const appliesToIcp = body.applies_to_icp;

  if (typeof accountId !== "string" || accountId.length === 0) {
    return apiError("Missing or invalid account_id", 400);
  }
  if (typeof sourceApp !== "string" || sourceApp.length === 0) {
    return apiError("Missing or invalid source_app", 400);
  }
  if (typeof patternType !== "string" || patternType.length === 0) {
    return apiError("Missing or invalid pattern_type", 400);
  }
  if (!dimensions || typeof dimensions !== "object" || Array.isArray(dimensions)) {
    return apiError("dimensions must be a non-null object", 400);
  }
  if (typeof outcomeMetric !== "string" || outcomeMetric.length === 0) {
    return apiError("Missing or invalid outcome_metric", 400);
  }
  if (typeof outcomeValue !== "number" || !Number.isFinite(outcomeValue)) {
    return apiError("Missing or invalid outcome_value (must be finite number)", 400);
  }
  if (!isOutcomeDirection(outcomeDirection)) {
    return apiError(
      "outcome_direction must be 'higher_is_better' or 'lower_is_better'",
      400,
    );
  }
  if (
    baselineValue !== undefined &&
    baselineValue !== null &&
    (typeof baselineValue !== "number" || !Number.isFinite(baselineValue))
  ) {
    return apiError("baseline_value must be a finite number, null, or omitted", 400);
  }
  if (typeof sampleSize !== "number" || !Number.isInteger(sampleSize) || sampleSize < 0) {
    return apiError("sample_size must be a non-negative integer", 400);
  }
  if (
    variance !== undefined &&
    variance !== null &&
    (typeof variance !== "number" || !Number.isFinite(variance) || variance < 0)
  ) {
    return apiError("variance must be a non-negative finite number, null, or omitted", 400);
  }
  if (
    sourceWorkflowId !== undefined &&
    sourceWorkflowId !== null &&
    typeof sourceWorkflowId !== "string"
  ) {
    return apiError("source_workflow_id must be a string, null, or omitted", 400);
  }
  if (
    !Array.isArray(evidenceRefs) ||
    !evidenceRefs.every((r) => typeof r === "string" && r.length > 0)
  ) {
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

  // ── 3. Synapse active for the source app ─────────────────────
  // Real suite apps must have an active Synapse row. The
  // "kinetiks_fixtures" sentinel bypasses this gate because it is
  // substrate, not an app — no realistic customer ever activates a
  // fixtures synapse. The Phase 1.5 fixture emitter relies on this
  // exemption alongside the source_app relaxation below.
  const FIXTURE_SOURCE_APP_CHECK = "kinetiks_fixtures";
  if (sourceApp !== FIXTURE_SOURCE_APP_CHECK) {
    const { data: synapse, error: synapseError } = await admin
      .from("kinetiks_synapses")
      .select("status")
      .eq("account_id", accountId)
      .eq("app_name", sourceApp)
      .maybeSingle();
    if (synapseError) {
      await captureException(synapseError, {
        tags: {
          route: "/api/synapse/patterns",
          action: "patterns.synapse_lookup",
          stage: "query",
          app: "id",
        },
        user: { id: accountId },
        extra: { authMethod: auth.auth_method },
      });
      return apiError("Failed to verify synapse", 500);
    }
    if (!synapse) {
      return apiSuccess<PatternEmissionResult>({
        outcome: "rejected_inactive_synapse",
        reason: `No Synapse found for app '${String(sourceApp)}' on this account`,
      });
    }
    if (synapse.status !== "active") {
      return apiSuccess<PatternEmissionResult>({
        outcome: "rejected_inactive_synapse",
        reason: `Synapse for '${String(sourceApp)}' is not active (status: ${String(synapse.status)})`,
      });
    }
  }

  // ── 4. Pattern Type Registry lookup ──────────────────────────
  const descriptor = getPatternType(patternType);
  if (!descriptor) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_unregistered_type",
      reason: `Pattern type '${patternType}' is not registered`,
    });
  }

  // ── 5. source_app gate ───────────────────────────────────────
  // Real suite apps must match the descriptor's source_app exactly. The
  // "kinetiks_fixtures" sentinel is the one admitted alternate, used by
  // the Phase 1.5 fixture emitter to seed substrate without any
  // suite-app implementation. Downstream arbitration / read paths still
  // treat every row identically — only the admission gate recognizes
  // the fixture label.
  const FIXTURE_SOURCE_APP = "kinetiks_fixtures";
  if (descriptor.source_app !== sourceApp && sourceApp !== FIXTURE_SOURCE_APP) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_source_app",
      reason: `App '${sourceApp}' is not the source_app for ${descriptor.pattern_type} (expected '${descriptor.source_app}')`,
    });
  }

  // ── 6. Apply bucketize then validate dimensions ──────────────
  let bucketized: Record<string, unknown>;
  try {
    bucketized = descriptor.bucketize
      ? (descriptor.bucketize(dimensions as Record<string, unknown>) as Record<string, unknown>)
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

  // ── 7. outcome_metric must equal descriptor.outcome_metric ──
  if (outcomeMetric !== descriptor.outcome_metric) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_outcome_mismatch",
      reason: `Pattern type ${descriptor.pattern_type} expects outcome_metric '${descriptor.outcome_metric}', received '${outcomeMetric}'`,
      expected_metric: descriptor.outcome_metric,
      received_metric: outcomeMetric,
    });
  }
  // Direction must also match the descriptor's declared direction.
  if (outcomeDirection !== descriptor.outcome_direction) {
    return apiSuccess<PatternEmissionResult>({
      outcome: "rejected_outcome_mismatch",
      reason: `Pattern type ${descriptor.pattern_type} expects outcome_direction '${descriptor.outcome_direction}', received '${outcomeDirection}'`,
      expected_metric: descriptor.outcome_metric,
      received_metric: outcomeMetric,
    });
  }

  // ── 8. Fingerprint ───────────────────────────────────────────
  let fingerprint: string;
  try {
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

  // ── 9. writePatternEmission ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createPatternWriteDb(admin as any);
  const emissionPayload: PatternEmissionPayload = {
    pattern_type: patternType,
    dimensions: dimensions as Record<string, unknown>,
    outcome_metric: outcomeMetric,
    outcome_value: outcomeValue,
    outcome_direction: outcomeDirection,
    baseline_value: (baselineValue as number | null | undefined) ?? null,
    sample_size: sampleSize,
    variance: (variance as number | null | undefined) ?? null,
    source_workflow_id: (sourceWorkflowId as string | null | undefined) ?? null,
    applies_to_icp: (appliesToIcp as string | null | undefined) ?? null,
    evidence_refs: evidenceRefs as string[],
  };

  try {
    const result = await writePatternEmission(
      {
        account_id: accountId,
        source_app: sourceApp,
        descriptor,
        bucketized_dimensions: parsed.data as Record<string, unknown>,
        fingerprint,
        payload: emissionPayload,
      },
      db,
    );
    return apiSuccess<PatternEmissionResult>(result);
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/synapse/patterns",
        action: "patterns.emit",
        stage: "persist",
        app: "id",
      },
      user: { id: accountId },
      extra: { patternType, sampleSize },
    });
    return apiError("Failed to record pattern emission", 500);
  }
}
