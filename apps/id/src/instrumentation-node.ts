/**
 * Node-only side of Next.js instrumentation. Imported dynamically by
 * `instrumentation.ts` ONLY when NEXT_RUNTIME === "nodejs", so none of
 * the modules reached from here are ever analyzed by webpack's Edge
 * bundler (which cannot resolve node:crypto, node:fs, native gRPC, etc).
 *
 * Wires:
 *  - `@kinetiks/ai` router → Supabase ai_calls logger + prompt-task
 *    registry
 *  - `@kinetiks/tools` registry → Supabase tool_calls logger + platform
 *    tools (noop_test, list_capabilities, query_patterns,
 *    query_actions_authority, ga4_query)
 *  - `@kinetiks/cortex` state machines
 *  - connection extractors (registerExtractor side-effects)
 *
 * Fail-loud: a malformed descriptor or an unregistered task surfaces
 * here at startup, not at runtime.
 */

import { configureAICallLogger } from "@kinetiks/ai";
import { supabaseAICallLogger } from "./lib/ai/logger";
import { registerKinetiksPromptTasks } from "./lib/ai/task-registry";
import { registerKinetiksStateMachines } from "./lib/state-machines-init";
import { bootToolRegistry } from "./lib/tools/registry-boot";
import "./lib/connections/extractors";

export function bootNodeInstrumentation(): void {
  configureAICallLogger(supabaseAICallLogger);
  registerKinetiksPromptTasks();
  registerKinetiksStateMachines();
  bootToolRegistry();
}
