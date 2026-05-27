// Runtime API
export { AgentRun, startAgentRun } from "./run";
export type {
  InvokeToolOptions,
  RetryPolicy,
  RunOptions,
  RunSummary,
  TraceEntry,
  TypedTool,
} from "./types";

// Authority resolution stub + override hook (L2a replaces the default)
export {
  configureAuthorityResolver,
  getAuthorityResolver,
  f2StubAuthorityResolver,
} from "./authority";
export type { AuthorityResolution, AuthorityResolver, ResolveAuthorityCtx } from "./authority";

// Retry helpers (exported for tests + L2a's resolver to compose)
export { AbortError, backoffMs, isRetryable, resolveRetryPolicy } from "./retry";

// Phase 3 — Operator Workflows dispatcher (Kinetiks Contract Addendum §3)
export { dispatchWorkflowTask, runWorkflow } from "./workflow-dispatch";
export type {
  DispatchDeps,
  LedgerWrite,
  OperatorExecuteContext,
  OperatorExecutor,
  OperatorExecutorResolver,
  RoutingEventInsert,
} from "./workflow-dispatch";
