import "server-only";

import type { OperatorExecutor } from "@kinetiks/runtime";

/**
 * Cartographer executor — Phase 3 stub.
 *
 * The descriptor registers so the registry is complete and so future
 * Workflows can reference `kinetiks_id.cartographer`. The actual
 * onboarding/crawl orchestration remains in
 * `apps/id/src/lib/cartographer/` and is invoked by its existing
 * callers, not by the Workflow dispatcher.
 *
 * A later phase will wire this executor up to the real Cartographer
 * code paths.
 */
export const cartographerExecute: OperatorExecutor = async () => {
  throw new Error(
    "[operator] kinetiks_id.cartographer is registered but not implemented in Phase 3. A later phase wires the real executor; for now, invoke Cartographer through its existing callers.",
  );
};
