import "server-only";

import type { OperatorExecutor } from "@kinetiks/runtime";

/**
 * Marcus executor — Phase 3 stub.
 *
 * The descriptor registers Marcus's tool whitelist so the Tool
 * Registry's cross-validator can verify every tool Marcus is allowed
 * to invoke is actually present. The real chat/orchestration paths
 * remain in `apps/id/src/lib/marcus/` and are invoked through the
 * existing chat route, not through the Workflow dispatcher.
 *
 * A later phase will wire this executor up to specific Marcus
 * sub-routines that Workflows can call.
 */
export const marcusExecute: OperatorExecutor = async () => {
  throw new Error(
    "[operator] kinetiks_id.marcus is registered but not implemented in Phase 3. Invoke Marcus through its existing chat path (`/api/marcus/chat`) until a later phase wires Workflow-addressable sub-routines.",
  );
};
