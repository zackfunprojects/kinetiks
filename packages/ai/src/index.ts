// Low-level Claude client (legacy direct callers). Prefer the router below.
export {
  createClaudeClient,
  askClaude,
  askClaudeMultiTurn,
  streamClaude,
} from "./claude";
export type { ConversationMessage, StreamClaudeOptions } from "./claude";

// Router — the only sanctioned entry point. Every call writes an ai_calls row.
export {
  routeAskClaude,
  routeAskClaudeMultiTurn,
  routeStreamClaude,
  configureAICallLogger,
  getAICallLogger,
} from "./router";
export type {
  AICallContext,
  AICallLogger,
  AICallLogPayload,
  AICallMetadata,
  AIModel,
  ConversationMessage as RouterConversationMessage,
} from "./router";

// Error taxonomy
export { AITaskError, classifyError } from "./errors";
export type { AIErrorClass, AIErrorOptions } from "./errors";

// Prompt task registry
export {
  registerPromptTask,
  getPromptTask,
  assertPromptTask,
  listPromptTasks,
  _resetPromptRegistryForTests,
} from "./prompts-registry";
export type { PromptTaskDescriptor } from "./prompts-registry";

// Model roles + resolution — tasks declare a role; the resolver maps it
// to the current model id (live-discovery-backed in apps/id, seed fallback).
export {
  MODEL_ROLES,
  ROLE_FAMILY,
  SEED_MODELS,
  resolveModel,
  familyOf,
  configureModelAssignmentReader,
  getModelAssignmentReader,
  _resetModelAssignmentReaderForTests,
} from "./models";
export type {
  ModelRole,
  ModelId,
  ModelFamily,
  ModelAssignmentReader,
} from "./models";

// Knowledge module system — marketing methodology for agent operators.
//
// The loader uses Node-only `fs/promises` and `path`, so the runtime
// values (loadKnowledge, modules) are NOT re-exported from the main
// entry. Import them from the subpath instead, which keeps the main
// `@kinetiks/ai` module Edge-runtime-safe:
//
//   import { loadKnowledge, knowledgeModules } from "@kinetiks/ai/knowledge";
//
// Pure types ARE re-exported here — they're erased at runtime and
// safe everywhere.
export type {
  KnowledgeModule,
  KnowledgeIntent,
  LoadKnowledgeOptions,
  LoadKnowledgeResult,
  OperatorName,
} from "./knowledge/types";
