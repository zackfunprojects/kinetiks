/**
 * Command types for Synapse-Cortex bidirectional communication.
 * Apps register capabilities and receive commands from Marcus.
 */

import type { AppPanelOpen } from "@kinetiks/types";

export type CommandType = "query" | "action" | "config";

export interface CapabilityDefinition {
  name: string;
  type: CommandType;
  description: string;
  parameters: ParameterSchema[];
  examples: string[];
  requires_approval: boolean;
  timeout_ms: number;
  /**
   * Optional JSON Schema describing the shape of this capability's result
   * `data`. When present, the aggregator can validate and pick a structured
   * renderer (Phase 8.0). Absent → plain-text aggregation, as today.
   */
  result_schema?: Record<string, unknown>;
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
  /**
   * IDs of commands (within the same dispatch plan) that must complete before
   * this one runs. The dispatcher passes their results into this command's
   * context. Empty/absent → no dependency (parallel-eligible). Spec §3.4.
   */
  depends_on?: string[];
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
  /**
   * When set, instructs the shell to mount the collaborative app panel for this
   * result (spec §4.2). Set by action capabilities that produce a viewable
   * entity; consumed by the Chat SSE layer to emit a `panel_open` event.
   */
  app_panel_open?: AppPanelOpen;
}

export interface CommandProgress {
  command_id: string;
  app_name: string;
  step: string;
  progress: number; // 0-100
  message: string;
}
