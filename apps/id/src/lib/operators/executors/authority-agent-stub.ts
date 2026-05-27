import "server-only";

import type { OperatorExecutor } from "@kinetiks/runtime";

/**
 * Authority Agent executor — Phase 4 stub registered in Phase 3.
 *
 * Per the Kinetiks Contract Addendum §2.5, the Authority Agent
 * proposes Authority Grants from Pattern Library + Learning Ledger
 * evidence. It never approves and never executes; the customer always
 * approves. Phase 4 lands the real proposal engine; Phase 3 simply
 * reserves the operator key in the registry.
 */
export const authorityAgentStubExecute: OperatorExecutor = async () => {
  throw new Error(
    "[operator] kinetiks_id.authority_agent is registered but not implemented in Phase 3. Phase 4 ships the real Authority Grant proposal engine.",
  );
};
