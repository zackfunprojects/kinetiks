import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deduplicateAllLayers } from "@/lib/archivist/dedup";
import { normalizeAllLayers } from "@/lib/archivist/normalize";
import { detectGaps } from "@/lib/archivist/gap-detect";
import { scoreAllQuality } from "@/lib/archivist/quality-score";
import { recalculateConfidence } from "@/lib/cortex/confidence";
import type { CleanPassResult } from "@/lib/archivist/types";
import { NextResponse } from "next/server";

/**
 * POST /api/archivist/clean
 *
 * Triggers a full clean pass for one or more accounts.
 * Called by users (cleans their own account) or by the archivist-cron
 * Edge Function via INTERNAL_SERVICE_SECRET (batch mode).
 *
 * Body (user call): {} (account resolved from session)
 * Body (service call): { account_id: string } or { account_ids: string[] }
 */
export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  // Resolve account IDs
  let accountIds: string[];

  if (isServiceCall) {
    if (Array.isArray(body.account_ids)) {
      accountIds = body.account_ids as string[];
    } else if (typeof body.account_id === "string") {
      accountIds = [body.account_id];
    } else {
      return NextResponse.json(
        { error: "Missing account_id or account_ids for service call" },
        { status: 400 }
      );
    }
  } else {
    // User call - resolve from session
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("user_id", user!.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }
    accountIds = [account.id as string];
  }

  // Process each account
  const results: CleanPassResult[] = [];

  for (const accountId of accountIds) {
    try {
      const result = await runCleanPass(admin, accountId);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[archivist/clean] Failed to clean account ${accountId}:`,
        message
      );
      results.push({
        account_id: accountId,
        dedup: [],
        normalize: [],
        gaps: { account_id: accountId, findings: [], proposals_created: 0 },
        quality: { account_id: accountId, layer_scores: {}, aggregate_quality: 0 },
      });
    }
  }

  if (results.length === 1) {
    return NextResponse.json(results[0]);
  }

  return NextResponse.json({
    results,
    accounts_processed: results.length,
  });
}

/**
 * Run the full clean pass for a single account:
 * dedup -> normalize -> gap detect -> quality score -> recalculate confidence.
 */
async function runCleanPass(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<CleanPassResult> {
  // Run dedup and normalize (these mutate data)
  const dedup = await deduplicateAllLayers(admin, accountId);
  const normalize = await normalizeAllLayers(admin, accountId);

  // Run gap detection (may create escalate proposals)
  const gaps = await detectGaps(admin, accountId);

  // Run quality scoring (read-only)
  const quality = await scoreAllQuality(admin, accountId);

  // Recalculate confidence since data may have changed
  const dataChanged =
    dedup.some((d) => d.duplicates_removed > 0) ||
    normalize.some((n) => n.changes_made > 0);

  if (dataChanged) {
    try {
      await recalculateConfidence(admin, accountId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `[archivist/clean] Confidence recalculation failed for ${accountId}:`,
        message
      );
    }
  }

  return { account_id: accountId, dedup, normalize, gaps, quality };
}
