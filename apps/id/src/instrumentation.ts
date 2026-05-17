/**
 * Next.js instrumentation: runs once on server boot in both Node and
 * Edge runtimes. We use it to wire up cross-cutting platform concerns
 * that every later request depends on.
 *
 * Node runtime wires:
 *  - `@kinetiks/ai` router → Supabase ai_calls logger + prompt-task registry
 *  - `@kinetiks/tools` registry → Supabase tool_calls logger, platform
 *    tools (noop_test, list_capabilities, query_patterns, query_actions_authority),
 *    cross-registry validation
 *
 * The boot path is intentionally fail-loud. A malformed descriptor or
 * an unregistered task surfaces here at startup, not at runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { configureAICallLogger } = await import("@kinetiks/ai");
  const { supabaseAICallLogger } = await import("./lib/ai/logger");
  configureAICallLogger(supabaseAICallLogger);

  const { registerKinetiksPromptTasks } = await import("./lib/ai/task-registry");
  registerKinetiksPromptTasks();

  const { registerKinetiksStateMachines } = await import("./lib/state-machines-init");
  registerKinetiksStateMachines();

  const { bootToolRegistry } = await import("./lib/tools/registry-boot");
  bootToolRegistry();
}
