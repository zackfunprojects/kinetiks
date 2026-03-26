export {
  createClaudeClient,
  askClaude,
  askClaudeMultiTurn,
  streamClaude,
} from "./claude";
export type { ConversationMessage, StreamClaudeOptions } from "./claude";

// Knowledge module system — marketing methodology for agent operators
export { loadKnowledge, modules as knowledgeModules } from "./knowledge";
export type {
  KnowledgeModule,
  KnowledgeIntent,
  LoadKnowledgeOptions,
  LoadKnowledgeResult,
  OperatorName,
} from "./knowledge";
