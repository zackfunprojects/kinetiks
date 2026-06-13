/**
 * Kinetiks Core's first internal Operator Workflow (Phase 3 demo +
 * production path). Per the Kinetiks Contract Addendum §3.
 *
 * Replaces the four sequential `/api/archivist/*` HTTP calls the
 * 6-hour `archivist-cron` Edge Function used to make. The cron now
 * POSTs once per account batch to
 * `/api/internal/workflows/archivist-maintenance/run`, which runs
 * this workflow against the batch.
 *
 * Five steps, all `target_type: "internal_operator"` against the
 * Archivist operator. Each step's input is derived from the
 * dispatch-context metadata (`account_ids`); the operator's executor
 * branches on `step`. Calibration is hour-gated inside the executor
 * (no_op when current UTC hour ≠ `only_at_utc_hour`), matching the
 * legacy cron's 00:00-UTC tick behaviour.
 *
 * First-failure-stops semantics is intentional for this workflow: if
 * `clean` fails for a batch, running the subsequent steps against the
 * same batch is unsafe (e.g. patterns may have stale fingerprints).
 * The cron's batch loop continues with the next batch regardless.
 */

import type { WorkflowDefinition, WorkflowDispatchContext } from "@kinetiks/types";
import { KINETIKS_ID_APP_KEY } from "@/lib/operators/registry-boot";
import type { ArchivistInput } from "@/lib/operators/descriptors";

/**
 * Read the account batch off the dispatch-context metadata that the
 * runner stamps in. Surfaced here so each task's input fn can use the
 * same accessor with the same guarantee.
 */
function readAccountIds(metadata: Readonly<Record<string, unknown>> | undefined): string[] {
  const raw = metadata?.["account_ids"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export const archivistMaintenance: WorkflowDefinition = {
  key: "kinetiks_id.archivist_maintenance",
  description:
    "Six-hour Cortex / Pattern Library maintenance run. Steps: clean Cortex layers → Pattern Library time-decay sweep → deferred-emission close → empirical decay calibration (00:00 UTC tick only) → authority usage_summary rollup.",
  tasks: [
    {
      key: "clean",
      label: "Cortex layer dedup, normalize, gap-detect, quality score",
      target_type: "internal_operator",
      target_app: KINETIKS_ID_APP_KEY,
      target_capability: "archivist",
      input: (
        _upstream: Record<string, unknown>,
        ctx: WorkflowDispatchContext,
      ): ArchivistInput => ({
        step: "clean",
        account_ids: readAccountIds(ctx.metadata),
      }),
    },
    {
      key: "sweep",
      label: "Pattern Library validated→declining / declining→archived time-decay sweep",
      target_type: "internal_operator",
      target_app: KINETIKS_ID_APP_KEY,
      target_capability: "archivist",
      input: (
        _upstream: Record<string, unknown>,
        ctx: WorkflowDispatchContext,
      ): ArchivistInput => ({
        step: "sweep",
        account_ids: readAccountIds(ctx.metadata),
      }),
    },
    {
      key: "sweep_deferred",
      label: "Close deferred pending observations whose outcome window expired",
      target_type: "internal_operator",
      target_app: KINETIKS_ID_APP_KEY,
      target_capability: "archivist",
      input: (
        _upstream: Record<string, unknown>,
        ctx: WorkflowDispatchContext,
      ): ArchivistInput => ({
        step: "sweep_deferred",
        account_ids: readAccountIds(ctx.metadata),
      }),
    },
    {
      key: "calibrate",
      label: "Empirical decay calibration (00:00 UTC tick only)",
      target_type: "internal_operator",
      target_app: KINETIKS_ID_APP_KEY,
      target_capability: "archivist",
      input: (
        _upstream: Record<string, unknown>,
        ctx: WorkflowDispatchContext,
      ): ArchivistInput => ({
        step: "calibrate",
        account_ids: readAccountIds(ctx.metadata),
        only_at_utc_hour: 0,
      }),
    },
    {
      key: "usage_rollup",
      label: "Authority grant usage_summary rollup (action counts, spend, escalations)",
      target_type: "internal_operator",
      target_app: KINETIKS_ID_APP_KEY,
      target_capability: "archivist",
      input: (
        _upstream: Record<string, unknown>,
        ctx: WorkflowDispatchContext,
      ): ArchivistInput => ({
        step: "usage_rollup",
        account_ids: readAccountIds(ctx.metadata),
      }),
    },
  ],
};
