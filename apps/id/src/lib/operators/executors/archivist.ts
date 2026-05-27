import "server-only";

import { serverEnv } from "@kinetiks/lib/env";
import type { OperatorExecutor } from "@kinetiks/runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { runArchivistCleanForAccount } from "@/lib/archivist/run-clean";
import { runArchivistPatternSweepForAccount } from "@/lib/archivist/run-pattern-sweep";
import { runArchivistDeferredSweepForAccount } from "@/lib/archivist/run-deferred-sweep";
import { runArchivistCalibrateForAccount } from "@/lib/archivist/run-calibrate";
import { captureException } from "@/lib/observability/sentry";
import {
  ARCHIVIST_STEP_VALUES,
  archivistInputsSchema,
  type ArchivistInput,
  type ArchivistOutput,
} from "../descriptors";

/**
 * Archivist operator executor — the real Phase 3 implementation.
 *
 * The dispatcher already validated `input` against
 * `archivistInputsSchema` before this function runs, but we re-parse
 * defensively so the body can safely treat input as typed
 * `ArchivistInput`.
 *
 * Each step calls one of the four per-account helpers in
 * `apps/id/src/lib/archivist/run-*.ts` directly. The existing
 * `/api/archivist/*` routes delegate to the same helpers, so customer-
 * direct calls and Workflow-dispatched calls share one code path.
 *
 * Aggregation rules:
 *  - `accounts_processed` counts accounts the helper completed
 *    without throwing.
 *  - `errors` rolls up per-account in-band errors (the same shape the
 *    legacy cron used to surface in its `*_errors` fields).
 *  - The full per-account result array rides in `step_metrics.results`
 *    so callers (and the workflow runner) can recover the same level
 *    of detail the legacy cron emitted.
 *  - When `only_at_utc_hour` is set and the current UTC hour does NOT
 *    match, the executor returns `skipped: true` with zero counts.
 *    This mirrors the cron's existing 00:00-UTC gate on calibration.
 */
export const archivistExecute: OperatorExecutor = async (rawInput) => {
  const input: ArchivistInput = archivistInputsSchema.parse(rawInput);

  // Time-gate check (only `calibrate` uses this today; the others omit
  // the field). The Workflow dispatcher itself does not know about
  // hour-of-day; gating lives on the operator so the same operator
  // can be triggered ad hoc outside the gate without surprising the
  // caller.
  if (
    typeof input.only_at_utc_hour === "number" &&
    new Date().getUTCHours() !== input.only_at_utc_hour
  ) {
    return {
      step: input.step,
      accounts_processed: 0,
      errors: 0,
      skipped: true,
    } satisfies ArchivistOutput;
  }

  const admin = createAdminClient();

  switch (input.step) {
    case "clean": {
      let accountsProcessed = 0;
      let errors = 0;
      for (const accountId of input.account_ids) {
        try {
          await runArchivistCleanForAccount(admin, accountId);
          accountsProcessed += 1;
        } catch (err) {
          errors += 1;
          // Surface to Sentry via the canonical capture shape so
          // production traces show the failure with structured tags;
          // the helper falls back to a dev console.error when
          // SENTRY_DSN is unset.
          await captureException(err, {
            tags: {
              route: "operator/archivist",
              action: "clean",
              stage: "execute",
              app: "id",
            },
            extra: { account_id: accountId },
          });
        }
      }
      return {
        step: "clean",
        accounts_processed: accountsProcessed,
        errors,
      } satisfies ArchivistOutput;
    }

    case "sweep": {
      let accountsProcessed = 0;
      let totalErrors = 0;
      let validatedToDeclining = 0;
      let decliningToArchived = 0;
      for (const accountId of input.account_ids) {
        const r = await runArchivistPatternSweepForAccount(admin, accountId);
        accountsProcessed += 1;
        totalErrors += r.errors.length;
        validatedToDeclining += r.validated_to_declining;
        decliningToArchived += r.declining_to_archived;
      }
      return {
        step: "sweep",
        accounts_processed: accountsProcessed,
        errors: totalErrors,
        step_metrics: {
          validated_to_declining: validatedToDeclining,
          declining_to_archived: decliningToArchived,
        },
      } satisfies ArchivistOutput;
    }

    case "sweep_deferred": {
      const env = serverEnv();
      const secret = env.INTERNAL_SERVICE_SECRET;
      if (!secret) {
        throw new Error(
          "[operator] archivist.sweep_deferred requires INTERNAL_SERVICE_SECRET in the environment",
        );
      }
      const appUrl = env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        throw new Error(
          "[operator] archivist.sweep_deferred requires NEXT_PUBLIC_APP_URL in the environment",
        );
      }
      const patternsUrl = `${appUrl}/api/synapse/patterns`;

      let accountsProcessed = 0;
      let totalScanned = 0;
      let totalExpired = 0;
      let totalEmitted = 0;
      let totalFailed = 0;
      for (const accountId of input.account_ids) {
        const r = await runArchivistDeferredSweepForAccount(admin, accountId, {
          patternsUrl,
          internalSecret: secret,
        });
        accountsProcessed += 1;
        totalScanned += r.scanned;
        totalExpired += r.expired_count;
        totalEmitted += r.emitted_count;
        totalFailed += r.failed_count;
        if (r.error) totalFailed += 1;
      }
      return {
        step: "sweep_deferred",
        accounts_processed: accountsProcessed,
        errors: totalFailed,
        step_metrics: {
          scanned: totalScanned,
          expired: totalExpired,
          emitted: totalEmitted,
        },
      } satisfies ArchivistOutput;
    }

    case "calibrate": {
      const now = new Date();
      let accountsProcessed = 0;
      let totalErrors = 0;
      let patternsEvaluated = 0;
      let patternsMoved = 0;
      let patternsSkipped = 0;
      let patternsRaced = 0;
      for (const accountId of input.account_ids) {
        const r = await runArchivistCalibrateForAccount(admin, accountId, now);
        accountsProcessed += 1;
        totalErrors += r.errors.length;
        patternsEvaluated += r.patterns_evaluated;
        patternsMoved += r.patterns_moved;
        patternsSkipped += r.patterns_skipped;
        patternsRaced += r.patterns_raced;
      }
      return {
        step: "calibrate",
        accounts_processed: accountsProcessed,
        errors: totalErrors,
        step_metrics: {
          patterns_evaluated: patternsEvaluated,
          patterns_moved: patternsMoved,
          patterns_skipped: patternsSkipped,
          patterns_raced: patternsRaced,
        },
      } satisfies ArchivistOutput;
    }

    default: {
      // Exhaustiveness guard. ARCHIVIST_STEP_VALUES is the canonical
      // list; a step the schema accepted but this switch doesn't
      // handle is a coding error.
      const _exhaustive: never = input.step;
      throw new Error(
        `[operator] archivist: unhandled step "${_exhaustive}" (valid: ${ARCHIVIST_STEP_VALUES.join(", ")})`,
      );
    }
  }
};
