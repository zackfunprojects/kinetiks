/**
 * Command types for Synapse-Cortex bidirectional communication.
 * Apps register capabilities and receive commands from Marcus.
 */

export type CommandType = "query" | "action" | "config";

export interface CapabilityDefinition {
  name: string;
  type: CommandType;
  description: string;
  parameters: ParameterSchema[];
  examples: string[];
  requires_approval: boolean;
  timeout_ms: number;
}

export interface ParameterSchema {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  enum_values?: string[];
  default_value?: unknown;
}

export interface SynapseCapabilities {
  app_name: string;
  version: string;
  capabilities: CapabilityDefinition[];
  registered_at: string;
}

export interface SynapseCommand {
  id: string;
  source: "marcus";
  target_app: string;
  capability: string;
  type: CommandType;
  parameters: Record<string, unknown>;
  context: CommandContext;
  timeout_ms: number;
  created_at: string;
}

export interface CommandContext {
  account_id: string;
  thread_id: string;
  conversation_summary?: string;
  relevant_goals?: string[];
  cortex_layers?: Record<string, unknown>;
}

export interface CommandResponse {
  command_id: string;
  app_name: string;
  status: "success" | "error" | "timeout" | "partial";
  data: Record<string, unknown> | null;
  error?: string;
  approval_id?: string;
  duration_ms: number;
}

export interface CommandProgress {
  command_id: string;
  app_name: string;
  step: string;
  progress: number; // 0-100
  message: string;
}
