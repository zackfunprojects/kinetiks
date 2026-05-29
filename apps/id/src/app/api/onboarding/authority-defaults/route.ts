import { randomUUID } from "node:crypto";

import { renderCustomerSentence } from "@kinetiks/tools";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { listManifestsWithDefaults } from "@/lib/manifest/registry";
import {
  assertNoAuthorityGrantPhrase,
  buildAcceptDefaultProposal,
  emitDefaultAcceptLedgerEntries,
  emitDefaultRejectedLedgerEntries,
  emitDefaultSkippedLedgerEntries,
} from "@/lib/cortex/authority/defaults";

/**
 * POST /api/onboarding/authority-defaults
 *
 * Phase 5 — Kinetiks Contract Addendum §2.6.
 *
 * Records the customer's decision on the manifest-declared default
 * standing grants surfaced in the onboarding Permissions step. Three
 * paths:
 *
 *   1. `mode: "accept"` with `accepted_keys: [...]`
 *      For each key in `accepted_keys`, calls the
 *      `accept_default_standing_grants` RPC (migration 00058) which
 *      inserts the grant directly at status='active'. Emits matching
 *      `authority_grant_proposed` + `authority_grant_approved`
 *      Ledger entries per accepted grant.
 *
 *      For each manifest key NOT in `accepted_keys`, emits one
 *      `authority_default_rejected` Ledger entry. No grant is
 *      created.
 *
 *   2. `mode: "skip"`
 *      No grants are created. One `authority_default_skipped` Ledger
 *      entry per manifest key. The diff cron honors a 30-day cooldown
 *      before re-proposing.
 *
 * In all three paths, `kinetiks_accounts.authority_defaults_reviewed_at`
 * is set to now() so the OnboardingFlow resume logic advances past
 * the Permissions step and the diff cron starts considering this
 * account.
 *
 * The route is idempotent at the RPC layer: the unique partial index
 * `idx_authority_grants_default_origin_active` from migration 00055
 * rejects a duplicate (account, app, key) tuple if the customer
 * somehow submits twice. The customer-facing response surfaces a
 * generic message; the structured error goes to logs.
 */

const GENERIC_ACCEPT_DEFAULTS_ERROR =
  "We couldn't save your permission choices. Try again.";

interface AcceptOnboardingDefaultsRequest {
  mode: "accept" | "skip";
  /** Required when mode="accept"; ignored when mode="skip". */
  accepted_keys?: string[];
}

/**
 * Shape returned by GET. The signup UI uses this to render the
 * Permissions step. All customer-rendered strings come from the
 * server so the client never touches the renderer (which depends on
 * server-only Zod schemas in @kinetiks/tools).
 */
interface OnboardingDefaultsListResponse {
  /** True once the customer has decided at signup; UI skips the step. */
  already_reviewed: boolean;
  reviewed_at: string | null;
  /** One section per manifest with defaults. v1: a single section for kinetiks_id. */
  sections: ReadonlyArray<{
    app: string;
    display_name: string;
    defaults: ReadonlyArray<{
      key: string;
      description: string;
      capabilities: ReadonlyArray<{
        action_class: string;
        description: string;
        rendered_sentence: string;
        rate_limit: { count: number; window: "minute" | "hour" | "day" | "week" } | null;
      }>;
    }>;
  }>;
}

/**
 * GET /api/onboarding/authority-defaults
 *
 * Returns the manifest-declared defaults with rendered plain-language
 * sentences. The UI does not import server-only modules; the response
 * is the contract for what the Permissions step shows.
 */
export async function GET(request: Request): Promise<Response> {
  const { auth, error: authError } = await requireAuth(request, {
    permissions: "read-only",
  });
  if (authError) return authError;

  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("kinetiks_accounts")
    .select("authority_defaults_reviewed_at")
    .eq("id", auth.account_id)
    .maybeSingle();
  if (accountError) {
    console.error(
      `[authority-defaults] account fetch failed for ${auth.account_id}: ${accountError.message}`,
    );
    return apiError("Failed to load defaults", 500);
  }
  const reviewedAt = (account?.authority_defaults_reviewed_at as string | null) ?? null;

  const manifests = listManifestsWithDefaults();
  const sections: OnboardingDefaultsListResponse["sections"] = manifests.map((m) => ({
    app: m.app,
    display_name: m.display.name,
    defaults: (m.default_standing_grants ?? []).map((d) => {
      // Per-default defense-in-depth phrase check. The validator runs
      // at boot but the API response is the literal copy the customer
      // sees; assert again here so a future code change that
      // bypasses the validator (e.g. a hot-reload) cannot leak.
      assertNoAuthorityGrantPhrase(d.description, `default "${d.key}".description`);
      return {
        key: d.key,
        description: d.description,
        capabilities: d.granted_capabilities.map((c) => {
          assertNoAuthorityGrantPhrase(
            c.description,
            `default "${d.key}".capability.description`,
          );
          const rendered = renderCustomerSentence(c.action_class, c.constraints);
          assertNoAuthorityGrantPhrase(
            rendered,
            `rendered sentence for "${c.action_class}"`,
          );
          return {
            action_class: c.action_class,
            description: c.description,
            rendered_sentence: rendered,
            rate_limit: c.rate_limit,
          };
        }),
      };
    }),
  }));

  const response: OnboardingDefaultsListResponse = {
    already_reviewed: reviewedAt !== null,
    reviewed_at: reviewedAt,
    sections,
  };
  return apiSuccess(response);
}

export async function POST(request: Request): Promise<Response> {
  const { auth, error: authError } = await requireAuth(request, {
    permissions: "read-write",
  });
  if (authError) return authError;

  let body: AcceptOnboardingDefaultsRequest;
  try {
    body = (await request.json()) as AcceptOnboardingDefaultsRequest;
  } catch {
    return apiError("Invalid request body", 400);
  }

  if (body.mode !== "accept" && body.mode !== "skip") {
    return apiError(
      'mode must be "accept" or "skip"',
      400,
    );
  }
  const acceptedKeysInput = Array.isArray(body.accepted_keys)
    ? body.accepted_keys.filter((k): k is string => typeof k === "string")
    : [];

  const manifestsWithDefaults = listManifestsWithDefaults();
  if (manifestsWithDefaults.length === 0) {
    // Nothing to decide — still mark the marker so resume logic and
    // the cron can move forward. No Ledger entries because there is
    // nothing to attribute them to.
    const reviewedAt = await markReviewed(auth.account_id);
    if (!reviewedAt) return apiError(GENERIC_ACCEPT_DEFAULTS_ERROR, 500);
    return apiSuccess({ mode: body.mode, grants_created: 0, reviewed_at: reviewedAt });
  }

  // v1: defaults exist only on kinetiks_id. Defensive guard for the
  // future when multiple manifests declare defaults — every accepted
  // key must match exactly one manifest's exactly one default. Cross-
  // manifest key collisions would surface here as "unknown key".
  const keyToManifest = new Map<
    string,
    { app: string; default: (typeof manifestsWithDefaults)[number]["default_standing_grants"] extends readonly (infer T)[] ? T : never }
  >();
  for (const m of manifestsWithDefaults) {
    for (const d of m.default_standing_grants ?? []) {
      // No cross-manifest key collisions in v1; surface as a 500 if
      // it ever happens because the manifest validator missed it.
      if (keyToManifest.has(d.key)) {
        console.error(
          `[authority-defaults] duplicate key "${d.key}" across manifests (validator gap)`,
        );
        return apiError(GENERIC_ACCEPT_DEFAULTS_ERROR, 500);
      }
      keyToManifest.set(d.key, {
        app: m.app,
        default: d as never,
      });
    }
  }

  // Validate every accepted_key references a known default.
  for (const k of acceptedKeysInput) {
    if (!keyToManifest.has(k)) {
      return apiError(`Unknown default key: ${k}`, 400);
    }
  }

  // Compute rejected/skipped sets per app from the manifest's full
  // default key list.
  const allKeysByApp = new Map<string, string[]>();
  for (const [key, { app }] of keyToManifest.entries()) {
    const arr = allKeysByApp.get(app) ?? [];
    arr.push(key);
    allKeysByApp.set(app, arr);
  }
  const acceptedSet = new Set(body.mode === "accept" ? acceptedKeysInput : []);

  const admin = createAdminClient();

  // ── Path 1 + 2: accept mode ──
  if (body.mode === "accept") {
    // Group accepted keys by app, build per-app proposal arrays for
    // the RPC. v1 only has kinetiks_id with two defaults so this is
    // a single call; the shape is general so a future Harvest /
    // Implosion manifest call site works the same way.
    const grantsCreated: Array<{
      grant_id: string;
      default_origin_app: string;
      default_origin_key: string;
      action_classes: string[];
    }> = [];

    for (const [app, allKeys] of allKeysByApp.entries()) {
      const acceptedForApp = allKeys.filter((k) => acceptedSet.has(k));
      if (acceptedForApp.length === 0) continue;

      const proposals = acceptedForApp.map((key) => {
        const entry = keyToManifest.get(key);
        if (!entry) throw new Error(`unreachable: missing manifest entry for key ${key}`);
        return buildAcceptDefaultProposal({
          default: entry.default as Parameters<typeof buildAcceptDefaultProposal>[0]["default"],
          app,
        });
      });

      const { data, error } = await admin.rpc("accept_default_standing_grants", {
        p_account_id: auth.account_id,
        p_granted_by: auth.user_id,
        p_proposed_by_agent: "onboarding_signup",
        p_proposals: proposals,
      });
      if (error) {
        console.error(
          `[authority-defaults] RPC failed for app=${app}: ${error.message}`,
        );
        return apiError(GENERIC_ACCEPT_DEFAULTS_ERROR, 500);
      }
      const rows = (data ?? []) as Array<{
        grant_id: string;
        default_origin_app: string;
        default_origin_key: string;
      }>;
      // Action class list for each grant — sourced from the manifest
      // so the Ledger detail mirrors the persistence shape.
      const invocation_id = randomUUID();
      for (const r of rows) {
        const entry = keyToManifest.get(r.default_origin_key);
        const action_classes = entry
          ? (entry.default as Parameters<typeof buildAcceptDefaultProposal>[0]["default"]).granted_capabilities.map(
              (c) => c.action_class,
            )
          : [];
        grantsCreated.push({
          grant_id: r.grant_id,
          default_origin_app: r.default_origin_app,
          default_origin_key: r.default_origin_key,
          action_classes,
        });
      }
      try {
        await emitDefaultAcceptLedgerEntries({
          admin,
          account_id: auth.account_id,
          invocation_id,
          grants: grantsCreated.filter((g) => g.default_origin_app === app),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[authority-defaults] ledger emit (accept) failed: ${msg}`);
        // Grants are persisted; Ledger emission failed. v1 acceptance:
        // grant rows carry default_origin_*, which is the durable
        // provenance. We continue and try to set the marker so the
        // customer can move forward.
      }
    }

    // Reject any manifest key not in accepted_keys.
    for (const [app, allKeys] of allKeysByApp.entries()) {
      const rejected = allKeys.filter((k) => !acceptedSet.has(k));
      if (rejected.length === 0) continue;
      try {
        await emitDefaultRejectedLedgerEntries({
          admin,
          account_id: auth.account_id,
          app,
          rejected_keys: rejected,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[authority-defaults] ledger emit (rejected) failed: ${msg}`);
      }
    }

    const reviewedAt = await markReviewed(auth.account_id);
    if (!reviewedAt) return apiError(GENERIC_ACCEPT_DEFAULTS_ERROR, 500);

    return apiSuccess({
      mode: "accept" as const,
      grants_created: grantsCreated.length,
      grant_ids: grantsCreated.map((g) => g.grant_id),
      reviewed_at: reviewedAt,
    });
  }

  // ── Path 3: skip mode ──
  for (const [app, allKeys] of allKeysByApp.entries()) {
    try {
      await emitDefaultSkippedLedgerEntries({
        admin,
        account_id: auth.account_id,
        app,
        skipped_keys: allKeys,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[authority-defaults] ledger emit (skipped) failed: ${msg}`);
    }
  }
  const reviewedAt = await markReviewed(auth.account_id);
  if (!reviewedAt) return apiError(GENERIC_ACCEPT_DEFAULTS_ERROR, 500);

  return apiSuccess({
    mode: "skip" as const,
    grants_created: 0,
    reviewed_at: reviewedAt,
  });
}

/**
 * Set kinetiks_accounts.authority_defaults_reviewed_at = now(). Returns
 * the stamped ISO timestamp on success, null on error. Idempotent —
 * setting twice is harmless (later timestamp wins).
 */
async function markReviewed(account_id: string): Promise<string | null> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("kinetiks_accounts")
    .update({ authority_defaults_reviewed_at: nowIso })
    .eq("id", account_id);
  if (error) {
    console.error(
      `[authority-defaults] markReviewed failed for account ${account_id}: ${error.message}`,
    );
    return null;
  }
  return nowIso;
}
