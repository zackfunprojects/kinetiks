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

// Authority resolution (Phase 4: real flow per Addendum §2.9)
export {
  configureAuthorityResolver,
  getAuthorityResolver,
  f2StubAuthorityResolver,
  defaultAuthorityResolver,
  validateActionAgainstConstraints,
  // Adapter configuration (apps wire these at boot)
  configureGrantReader,
  getGrantReader,
  configureRecentActionCounter,
  getRecentActionCounter,
  configureUsageSummaryReader,
  getUsageSummaryReader,
  configureLedgerHistoryReader,
  getLedgerHistoryReader,
  configureMetricCacheReader,
  getMetricCacheReader,
  configureLLMJudge,
  getLLMJudge,
  configureJudgmentBudgetAdapter,
  getJudgmentBudgetAdapter,
  configureLedgerAppender,
  getLedgerAppender,
  configureEscalationHandler,
  getEscalationHandler,
  configurePerActionApprovalHandler,
  getPerActionApprovalHandler,
  _resetAuthorityAdaptersForTests,
} from "./authority";
export type {
  AuthorityResolution,
  AuthorityResolver,
  ResolveAuthorityCtx,
  AuthorityReason,
  MatchedCapability,
  MatchedGrant,
  GrantReader,
  RecentActionCounter,
  UsageSummaryReader,
  LedgerHistoryReader,
  MetricCacheReader,
  LLMJudge,
  JudgmentBudgetAdapter,
  LedgerAppender,
  LedgerAppendInput,
  EscalationHandler,
  EscalationEnqueueInput,
  EscalationEnqueueResult,
  PerActionApprovalHandler,
  PerActionApprovalRequest,
  PerActionApprovalDecision,
  AuthorityOutcome,
} from "./authority";

// Phase 4 — escalation trigger evaluator
export {
  evaluateEscalationTriggers,
} from "./escalation-triggers";
export type {
  EvaluationContext,
  TriggerEvaluationResult,
} from "./escalation-triggers";

// Phase 4 — LLM judgment budget enforcer
export { checkLLMJudgmentBudget } from "./llm-judgment-budgets";
export type {
  JudgmentBudgetCheckInput,
  JudgmentBudgetCheckResult,
} from "./llm-judgment-budgets";

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
