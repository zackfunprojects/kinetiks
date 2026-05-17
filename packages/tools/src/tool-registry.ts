/**
 * Tool Registry — the canonical inventory of every tool the Agent
 * Runtime can invoke.
 *
 * Apps and integrations call `registerTool` at boot. Marcus and other
 * agents discover tools through `listTools` / `listAvailableTools`
 * filtered by per-account `availability`.
 *
 * Registration validates structural invariants:
 *  - Unique name
 *  - Consequential tools must declare `actionClass` AND `idempotencyKeyFrom`
 *  - Non-consequential tools should NOT declare `actionClass`
 *  - `availability.kind === "custom"` must come with a `customAvailability`
 *    predicate
 *  - `autoApproveThreshold` is null or within 0..1
 *
 * The registry is process-global. Tests should call
 * `_resetToolRegistryForTests` between cases.
 */

import { z, type ZodType } from "zod";
import type { AgentTool, AvailabilityContext } from "./types";
import { ToolError } from "./types";

// The registry stores tools after structural validation. The static input/
// output generics are erased at the registry boundary; runtime validates
// against the Zod schemas, not the TS type.
type AnyTool = AgentTool<any, any>;

interface ToolRegistryEntry {
  tool: AnyTool;
  registeredAt: number;
}

const registry = new Map<string, ToolRegistryEntry>();

/**
 * Helper for building a typed tool with input/output inference.
 * Inferences happen at the call site:
 *
 *   const t = defineTool({
 *     name: "ga4_query",
 *     description: "...",
 *     inputSchema: z.object({ metric: z.string() }),
 *     outputSchema: z.object({ value: z.number() }),
 *     ...,
 *     execute: async (input, ctx) => { ... },  // input is { metric: string }
 *   });
 */
export function defineTool<TIn extends ZodType, TOut extends ZodType>(
  config: Omit<AgentTool<z.infer<TIn>, z.infer<TOut>>, "inputSchema" | "outputSchema"> & {
    inputSchema: TIn;
    outputSchema: TOut;
  },
): AgentTool<z.infer<TIn>, z.infer<TOut>> {
  return config as AgentTool<z.infer<TIn>, z.infer<TOut>>;
}

/** Register a tool. Throws on structural violations. Idempotent for the same descriptor. */
export function registerTool(tool: AnyTool): void {
  assertToolDescriptor(tool);
  const existing = registry.get(tool.name);
  if (existing) {
    if (descriptorsMatch(existing.tool, tool)) {
      // Idempotent re-registration (hot reload, test setup). No-op.
      return;
    }
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" is already registered with a conflicting descriptor`,
      { context: { tool: tool.name } },
    );
  }
  registry.set(tool.name, { tool, registeredAt: Date.now() });
}

/** Get a tool by name. Returns undefined if unregistered. */
export function getTool(name: string): AnyTool | undefined {
  return registry.get(name)?.tool;
}

/** Strict variant: throws if missing. */
export function assertTool(name: string): AnyTool {
  const t = registry.get(name)?.tool;
  if (!t) {
    throw new ToolError("configuration_error", `Unknown tool: ${name}`, {
      context: { tool: name },
    });
  }
  return t;
}

/** All registered tools, in registration order. */
export function listTools(): AnyTool[] {
  return Array.from(registry.values())
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((e) => e.tool);
}

/**
 * Tools available to a given account based on their `availability`
 * predicate. The caller provides predicate resolvers for the kinds the
 * platform knows about (connection_required, plan_required); tools
 * declaring `availability.kind === "custom"` use their `customAvailability`
 * function.
 */
export interface AvailabilityResolvers {
  connection_required: (ctx: AvailabilityContext, provider: string) => Promise<boolean>;
  plan_required: (
    ctx: AvailabilityContext,
    minPlan: "free" | "standard" | "hero",
  ) => Promise<boolean>;
}

export async function listAvailableTools(
  ctx: AvailabilityContext,
  resolvers: AvailabilityResolvers,
): Promise<AnyTool[]> {
  const all = listTools();
  const results = await Promise.all(
    all.map(async (t) => ({ tool: t, available: await isAvailable(t, ctx, resolvers) })),
  );
  return results.filter((r) => r.available).map((r) => r.tool);
}

export async function isAvailable(
  tool: AnyTool,
  ctx: AvailabilityContext,
  resolvers: AvailabilityResolvers,
): Promise<boolean> {
  const a = tool.availability;
  switch (a.kind) {
    case "always":
      return true;
    case "connection_required":
      return resolvers.connection_required(ctx, a.provider);
    case "plan_required":
      return resolvers.plan_required(ctx, a.min_plan);
    case "custom": {
      if (!tool.customAvailability) {
        // Misconfigured at registration; this should have been caught
        // by assertToolDescriptor. Treat as unavailable rather than throw
        // at resolution time.
        return false;
      }
      return tool.customAvailability(ctx);
    }
  }
}

// ============================================================
// Structural validation
// ============================================================

function assertToolDescriptor(tool: AnyTool): void {
  if (!tool.name || typeof tool.name !== "string") {
    throw new ToolError("configuration_error", `Tool name must be a non-empty string`, {
      context: { received: String(tool.name) },
    });
  }
  if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    throw new ToolError(
      "configuration_error",
      `Tool name "${tool.name}" must be lowercase snake_case starting with a letter`,
      { context: { tool: tool.name } },
    );
  }
  if (!tool.description || tool.description.trim().length < 16) {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" must have a description of at least 16 characters (LLM needs context)`,
      { context: { tool: tool.name } },
    );
  }
  if (!tool.inputSchema || typeof tool.inputSchema.parse !== "function") {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" inputSchema must be a Zod schema`,
      { context: { tool: tool.name } },
    );
  }
  if (!tool.outputSchema || typeof tool.outputSchema.parse !== "function") {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" outputSchema must be a Zod schema`,
      { context: { tool: tool.name } },
    );
  }
  if (typeof tool.isConsequential !== "boolean") {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" must declare isConsequential as a boolean`,
      { context: { tool: tool.name } },
    );
  }
  if (tool.isConsequential) {
    if (!tool.actionClass) {
      throw new ToolError(
        "configuration_error",
        `Tool "${tool.name}" is consequential and must declare an actionClass`,
        { context: { tool: tool.name } },
      );
    }
    if (typeof tool.idempotencyKeyFrom !== "function") {
      throw new ToolError(
        "configuration_error",
        `Tool "${tool.name}" is consequential and must declare idempotencyKeyFrom`,
        { context: { tool: tool.name } },
      );
    }
  } else if (tool.actionClass) {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" is not consequential; remove actionClass`,
      { context: { tool: tool.name, actionClass: tool.actionClass } },
    );
  }
  if (
    tool.autoApproveThreshold !== null &&
    (typeof tool.autoApproveThreshold !== "number" ||
      tool.autoApproveThreshold < 0 ||
      tool.autoApproveThreshold > 1)
  ) {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" autoApproveThreshold must be null or a number in [0, 1]`,
      { context: { tool: tool.name } },
    );
  }
  if (!tool.availability || typeof tool.availability !== "object") {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" must declare an availability predicate`,
      { context: { tool: tool.name } },
    );
  }
  if (tool.availability.kind === "custom" && typeof tool.customAvailability !== "function") {
    throw new ToolError(
      "configuration_error",
      `Tool "${tool.name}" availability is "custom" but customAvailability is not a function`,
      { context: { tool: tool.name } },
    );
  }
  if (typeof tool.execute !== "function") {
    throw new ToolError("configuration_error", `Tool "${tool.name}" must declare execute()`, {
      context: { tool: tool.name },
    });
  }
}

function descriptorsMatch(a: AnyTool, b: AnyTool): boolean {
  return (
    a.name === b.name &&
    a.version === b.version &&
    a.description === b.description &&
    a.isConsequential === b.isConsequential &&
    a.actionClass === b.actionClass &&
    a.autoApproveThreshold === b.autoApproveThreshold &&
    JSON.stringify(a.availability) === JSON.stringify(b.availability)
  );
}

// ============================================================
// Test-only escape hatch
// ============================================================

export function _resetToolRegistryForTests(): void {
  registry.clear();
}
