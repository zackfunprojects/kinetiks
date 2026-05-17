/**
 * Prompt task registry.
 *
 * Per CLAUDE.md: every task that the router can be called with must be
 * registered at boot. Unknown tasks surface AITaskError('missing_prompt')
 * BEFORE the call hits Anthropic. Required-placeholder validation also
 * lives here.
 *
 * Apps register their tasks via `registerPromptTask(...)` at module load
 * (typically in a barrel file that the router imports transitively).
 */

import { AITaskError } from "./errors";

export interface PromptTaskDescriptor {
  /** Globally unique task identifier, e.g. "marcus.pre_analysis". */
  task: string;
  /** Pinned prompt version string committed alongside the prompt code. */
  version: string;
  /** Default model for this task. Callers may still override. */
  defaultModel: "claude-sonnet-4-20250514" | "claude-haiku-4-5-20251001";
  /** Optional list of required template placeholders. */
  required?: readonly string[];
  /** Whitelist of allowed placeholders (superset of required). */
  allowed?: readonly string[];
}

const registry = new Map<string, PromptTaskDescriptor>();

export function registerPromptTask(d: PromptTaskDescriptor): void {
  if (registry.has(d.task)) {
    // Re-registration is allowed only with identical descriptor (hot reload).
    const prev = registry.get(d.task);
    if (prev && prev.version === d.version && prev.defaultModel === d.defaultModel) return;
    throw new Error(`[prompts-registry] duplicate task with conflicting descriptor: ${d.task}`);
  }
  registry.set(d.task, d);
}

export function getPromptTask(task: string): PromptTaskDescriptor | undefined {
  return registry.get(task);
}

export function assertPromptTask(task: string): PromptTaskDescriptor {
  const d = registry.get(task);
  if (!d) {
    throw new AITaskError("missing_prompt", `Unknown prompt task: ${task}`, {
      context: { task },
    });
  }
  return d;
}

export function listPromptTasks(): PromptTaskDescriptor[] {
  return Array.from(registry.values());
}

/** Test-only escape hatch. */
export function _resetPromptRegistryForTests(): void {
  registry.clear();
}
