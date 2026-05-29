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
 *   { account_id: string }
 *
 * Response:
 *   {
 *     account_id: string,
 *     proposals_created: number,
 *     cooldown_skipped: number,
 *     already_covered: number,
 *   }
 */

interface RefreshRequest {
  account_id: string;
}

export async function POST(request: Request): Promise<Response> {
  const { auth, error: authError } = await requireAuth(request, {
    allowInternal: true,
  });
  if (authError) return authError;
  if (auth.auth_method !== "internal") {
    return apiError("Forbidden — internal route", 403);
  }

  let body: RefreshRequest;
  try {
    body = (await request.json()) as RefreshRequest;
  } catch {
    return apiError("Invalid request body", 400);
  }
  const account_id = body.account_id;
  if (!account_id || typeof account_id !== "string") {
    return apiError("account_id is required", 400);
  }

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
    console.error(
      `[authority-defaults-diff/refresh] account fetch failed for ${account_id}: ${accountErr.message}`,
    );
    return apiError("Failed to load account", 500);
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
    console.error(
      `[authority-defaults-diff/refresh] account ${account_id} has no user_id`,
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[authority-defaults-diff/refresh] runDefaultsDiff failed for ${account_id}: ${msg}`,
    );
    return apiError("Diff run failed", 500);
  }
}
