import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { deduplicateAllLayers } from "@/lib/archivist/dedup";
import { normalizeAllLayers } from "@/lib/archivist/normalize";
import { detectGaps } from "@/lib/archivist/gap-detect";
import { scoreAllQuality } from "@/lib/archivist/quality-score";
import { recalculateConfidence } from "@/lib/cortex";
import type { CleanPassResult } from "@/lib/archivist/types";
import { captureException } from "@/lib/observability/sentry";

/**
 * Per-account clean pass: dedup → normalize → gap detect →
 * quality score → confidence recalc (when data changed).
 *
 * Extracted from `apps/id/src/app/api/archivist/clean/route.ts` so
 * the Phase 3 Workflow dispatcher can invoke this directly via the
 * Archivist operator (no self-HTTP round-trip). The route file still
 * exists and now delegates here; the response shape is unchanged for
 * existing callers.
 */
export async function runArchivistCleanForAccount(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
): Promise<CleanPassResult> {
  const dedup = await deduplicateAllLayers(admin, accountId);
  const normalize = await normalizeAllLayers(admin, accountId);
  const gaps = await detectGaps(admin, accountId);
  const quality = await scoreAllQuality(admin, accountId);

  const dataChanged =
    dedup.some((d) => d.duplicates_removed > 0) ||
    normalize.some((n) => n.changes_made > 0);

  if (dataChanged) {
    try {
      await recalculateConfidence(admin, accountId);
    } catch (err) {
      // Route through the canonical Sentry capture so production sees
      // the failure with structured tags; the helper falls back to a
      // dev-only console.error when SENTRY_DSN is unset (no
      // unconditional console.error noise in prod).
      await captureException(err, {
        tags: {
          route: "archivist/clean",
          action: "recalculate_confidence",
          stage: "execute",
          app: "id",
        },
        extra: { account_id: accountId },
      });
    }
  }

  return { account_id: accountId, dedup, normalize, gaps, quality };
}
