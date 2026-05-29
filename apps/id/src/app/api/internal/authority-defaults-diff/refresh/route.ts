import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { listManifestsWithDefaults } from "@/lib/manifest/registry";
import { runDefaultsDiff } from "@/lib/cortex/authority/defaults-diff";

/**
 * POST /api/internal/authority-defaults-diff/refresh
 *
 * Phase 5 — Kinetiks Contract Addendum §2.6.
 *
 * Per-account diff routine called by the Edge Function
 * `supabase/functions/authority-defaults-diff-cron/index.ts`. The
 * actual diff logic lives in
 * `apps/id/src/lib/cortex/authority/defaults-diff.ts` (extracted so
 * it can be unit-tested without the HTTP layer); this handler is
 * the thin auth + parameter resolution wrapper.
 *
 * Authentication: INTERNAL_SERVICE_SECRET Bearer token only. User
 * tokens and API keys are rejected — the diff job is platform
 * machinery, not a customer-facing surface.
 *
 * Request body:
 *   { account_id: string (uuid) }
 *
 * Response:
 *   {
 *     account_id: string,
 *     proposals_created: number,
 *     cooldown_skipped: number,
 *     already_covered: number,
 *   }
 */

// Phase 7 CR: replace manual validation with Zod per the project
// CLAUDE.md rule "API routes and Server Actions must validate inputs
// with Zod before touching the database."
const RefreshRequestSchema = z.object({
  account_id: z.string().uuid({
    message: "account_id must be a UUID",
  }),
});

const GENERIC_LOAD_ACCOUNT_ERROR = "Failed to load account";
const GENERIC_RUN_ERROR = "Diff run failed";
const ROUTE_TAG = "authority-defaults-diff/refresh";

export async function POST(request: Request): Promise<Response> {
  const { auth, error: authError } = await requireAuth(request, {
    allowInternal: true,
  });
  if (authError) return authError;
  if (auth.auth_method !== "internal") {
    return apiError("Forbidden — internal route", 403);
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }
  const parsedBody = RefreshRequestSchema.safeParse(bodyRaw);
  if (!parsedBody.success) {
    return apiError(
      `Invalid request: ${parsedBody.error.issues.map((i) => i.message).join("; ")}`,
      400,
    );
  }
  const { account_id } = parsedBody.data;

  const admin = createAdminClient();

  // Defensive: confirm the account has actually passed the signup
  // Permissions step. The cron filters on this column, but a stale
  // account (e.g. paused mid-deploy) could slip through.
  const { data: account, error: accountErr } = await admin
    .from("kinetiks_accounts")
    .select("id, user_id, authority_defaults_reviewed_at")
    .eq("id", account_id)
    .maybeSingle();
  if (accountErr) {
    Sentry.captureException(accountErr, {
      tags: { route: ROUTE_TAG, action: "account_fetch", stage: "select", app: "id" },
      user: { id: account_id },
      extra: { postgrest_code: accountErr.code },
    });
    return apiError(GENERIC_LOAD_ACCOUNT_ERROR, 500);
  }
  if (!account) {
    return apiError("Account not found", 404);
  }
  if (account.authority_defaults_reviewed_at == null) {
    return apiSuccess({
      account_id,
      proposals_created: 0,
      cooldown_skipped: 0,
      already_covered: 0,
      reason: "authority_defaults_reviewed_at is null; skipping",
    });
  }
  if (!account.user_id) {
    Sentry.captureMessage(
      `[${ROUTE_TAG}] account has no user_id`,
      {
        level: "error",
        tags: {
          route: ROUTE_TAG,
          action: "owner_lookup",
          stage: "guard",
          app: "id",
        },
        user: { id: account_id },
      },
    );
    return apiError("Account has no owner", 500);
  }

  const manifests = listManifestsWithDefaults();
  if (manifests.length === 0) {
    return apiSuccess({
      account_id,
      proposals_created: 0,
      cooldown_skipped: 0,
      already_covered: 0,
    });
  }

  try {
    const outcome = await runDefaultsDiff({
      admin,
      account_id,
      granted_by: account.user_id as string,
      manifests,
    });
    return apiSuccess({ account_id, ...outcome });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: ROUTE_TAG, action: "run_diff", stage: "execute", app: "id" },
      user: { id: account_id },
      extra: { manifests_count: manifests.length },
    });
    return apiError(GENERIC_RUN_ERROR, 500);
  }
}
