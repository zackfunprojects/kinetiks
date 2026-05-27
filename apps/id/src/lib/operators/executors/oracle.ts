import "server-only";

import type { OperatorExecutor } from "@kinetiks/runtime";

/**
 * Oracle executor — Phase 3 stub.
 *
 * The descriptor registers so the registry is complete. The actual
 * analytics synthesis lives in `apps/id/src/lib/oracle/` and runs
 * via the existing `oracle-analysis-cron` → `/api/internal/oracle/analyze`
 * path, not through the Workflow dispatcher.
 *
 * A later phase will wire this executor up to the real Oracle
 * code paths.
 */
export const oracleExecute: OperatorExecutor = async () => {
  throw new Error(
    "[operator] kinetiks_id.oracle is registered but not implemented in Phase 3. A later phase wires the real executor; for now, the oracle-analysis cron continues to drive Oracle directly.",
  );
};
