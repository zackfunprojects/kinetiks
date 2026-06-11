// Types and errors
export { ToolError } from "./types";
export type {
  AgentTool,
  AuthorityOutcome,
  AvailabilityContext,
  AvailabilityPredicate,
  ToolCallLogPayload,
  ToolCallLogger,
  ToolCallStatus,
  ToolErrorClass,
  ToolExecutionContext,
  ToolMetadata,
} from "./types";

// Tool registry
export {
  registerTool,
  defineTool,
  getTool,
  assertTool,
  listTools,
  listAvailableTools,
  isAvailable,
  _resetToolRegistryForTests,
} from "./tool-registry";
export type { AvailabilityResolvers } from "./tool-registry";

// Action class registry
export {
  registerActionClass,
  getActionClass,
  assertActionClass,
  listActionClasses,
  listActionClassesForApp,
  _resetActionClassRegistryForTests,
} from "./action-class-registry";

// Operator registry
export {
  registerOperators,
  getOperator,
  assertOperator,
  listOperatorsForApp,
  listAllOperators,
  _resetOperatorRegistryForTests,
} from "./operator-registry";

// Pattern Type Registry (Kinetiks Contract Addendum §1.3)
export {
  definePatternType,
  registerPatternType,
  getPatternType,
  assertPatternType,
  listPatternTypes,
  listPatternTypesForSourceApp,
  /** @deprecated alias for listPatternTypesForSourceApp; will be removed */
  listPatternTypesForEmittingApp,
  listPatternTypesForReadingApp,
  listCustomerVisiblePatternTypes,
  _resetPatternTypeRegistryForTests,
} from "./pattern-type-registry";

// Customer template renderer
export {
  renderCustomerSentence,
  renderFromDescriptor,
  extractTemplatePlaceholders,
  exampleSentencesForAllRegistered,
} from "./customer-template";

// Logger seam
export {
  configureToolCallLogger,
  getToolCallLogger,
  emitToolCallLog,
} from "./logger";

// Executor
export { executeTool } from "./executor";
export type { ExecuteToolOptions } from "./executor";

// Cross-registry validation
export {
  validateRegistries,
  assertRegistriesValid,
} from "./validate";
export type { ValidationReport } from "./validate";

// Capability manifest
export { buildCapabilityManifest } from "./capabilities";
export type {
  CapabilityManifest,
  ToolCapability,
  ActionClassCapability,
  OperatorCapability,
} from "./capabilities";

export {
  fetchWithTimeout,
  parseJsonOrToolError,
  classifyHttpStatus,
} from "./fetch-with-timeout";
export type { FetchWithTimeoutInput } from "./fetch-with-timeout";
