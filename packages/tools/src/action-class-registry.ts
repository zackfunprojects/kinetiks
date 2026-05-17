/**
 * Action Class Registry — the canonical inventory of every action_class
 * a tool may reference and that an Authority Grant may delegate.
 *
 * Per the Kinetiks Contract Addendum §2.4. An unregistered action_class cannot be
 * referenced from a `GrantedCapability`, ever.
 *
 * Customer-facing language is enforced at the schema level: every
 * `ActionClassDescriptor.customer_template` is what the customer reads
 * in plain language ("Adjust bids up or down by up to {max_pct_change}%
 * at a time."), not raw constraint field names.
 */

import type { ActionClassDescriptor } from "@kinetiks/types";
import { ToolError } from "./types";

interface ActionClassEntry {
  descriptor: ActionClassDescriptor;
  registeredAt: number;
}

const registry = new Map<string, ActionClassEntry>();

export function registerActionClass(descriptor: ActionClassDescriptor): void {
  assertActionClassDescriptor(descriptor);
  const existing = registry.get(descriptor.action_class);
  if (existing) {
    if (descriptorsMatch(existing.descriptor, descriptor)) return;
    throw new ToolError(
      "configuration_error",
      `Action class "${descriptor.action_class}" is already registered with a conflicting descriptor`,
      { context: { action_class: descriptor.action_class } },
    );
  }
  registry.set(descriptor.action_class, { descriptor, registeredAt: Date.now() });
}

export function getActionClass(actionClass: string): ActionClassDescriptor | undefined {
  return registry.get(actionClass)?.descriptor;
}

export function assertActionClass(actionClass: string): ActionClassDescriptor {
  const d = registry.get(actionClass)?.descriptor;
  if (!d) {
    throw new ToolError(
      "missing_action_class",
      `Unknown action class: ${actionClass}`,
      { context: { action_class: actionClass } },
    );
  }
  return d;
}

export function listActionClasses(): ActionClassDescriptor[] {
  return Array.from(registry.values())
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((e) => e.descriptor);
}

export function listActionClassesForApp(sourceApp: string): ActionClassDescriptor[] {
  return listActionClasses().filter((d) => d.source_app === sourceApp);
}

// ============================================================
// Structural validation
// ============================================================

function assertActionClassDescriptor(d: ActionClassDescriptor): void {
  if (!d.action_class || typeof d.action_class !== "string") {
    throw new ToolError(
      "configuration_error",
      `ActionClassDescriptor.action_class must be a non-empty string`,
      {},
    );
  }
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(d.action_class)) {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" must match "<app>.<verb>_<noun>" (snake_case, single dot)`,
      { context: { action_class: d.action_class } },
    );
  }
  if (!d.source_app || typeof d.source_app !== "string") {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" must declare source_app`,
      { context: { action_class: d.action_class } },
    );
  }
  // Enforce: source_app prefix matches the action_class prefix
  const [prefix] = d.action_class.split(".");
  if (prefix !== d.source_app) {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" prefix must equal source_app "${d.source_app}"`,
      { context: { action_class: d.action_class, source_app: d.source_app } },
    );
  }
  if (!d.description || d.description.trim().length < 16) {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" must have a description of at least 16 chars`,
      { context: { action_class: d.action_class } },
    );
  }
  if (!d.constraint_schema || typeof d.constraint_schema.parse !== "function") {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" constraint_schema must be a Zod schema`,
      { context: { action_class: d.action_class } },
    );
  }
  if (!d.customer_template || typeof d.customer_template !== "string") {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" must declare a customer_template`,
      { context: { action_class: d.action_class } },
    );
  }
  // Customer-facing copy rule: the literal phrase "Authority Grant" must
  // not appear in customer_template. Internal name only.
  if (/authority\s+grant/i.test(d.customer_template)) {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" customer_template must not contain "Authority Grant"; use "authority" or "permission"`,
      { context: { action_class: d.action_class } },
    );
  }
  if (typeof d.available_in_default_standing_grants !== "boolean") {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" must declare available_in_default_standing_grants as boolean`,
      { context: { action_class: d.action_class } },
    );
  }
  if (typeof d.always_requires_budget_attachment !== "boolean") {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" must declare always_requires_budget_attachment as boolean`,
      { context: { action_class: d.action_class } },
    );
  }
  // Hard rule (addendum §2.6): default standing grants may not include
  // spending or external-state classes
  if (
    d.available_in_default_standing_grants &&
    d.always_requires_budget_attachment
  ) {
    throw new ToolError(
      "configuration_error",
      `Action class "${d.action_class}" is spend-bearing; available_in_default_standing_grants must be false`,
      { context: { action_class: d.action_class } },
    );
  }
  if (d.rate_limit_default) {
    const { count, window } = d.rate_limit_default;
    if (!Number.isInteger(count) || count <= 0) {
      throw new ToolError(
        "configuration_error",
        `Action class "${d.action_class}" rate_limit_default.count must be a positive integer`,
        { context: { action_class: d.action_class } },
      );
    }
    if (!["minute", "hour", "day", "week"].includes(window)) {
      throw new ToolError(
        "configuration_error",
        `Action class "${d.action_class}" rate_limit_default.window is invalid`,
        { context: { action_class: d.action_class, window } },
      );
    }
  }
  if (d.llm_judgment_budget) {
    const { daily_usd, monthly_usd, model, fallback_on_budget_exhausted } = d.llm_judgment_budget;
    if (typeof daily_usd !== "number" || daily_usd < 0) {
      throw new ToolError(
        "configuration_error",
        `Action class "${d.action_class}" llm_judgment_budget.daily_usd must be a non-negative number`,
        { context: { action_class: d.action_class } },
      );
    }
    if (typeof monthly_usd !== "number" || monthly_usd < daily_usd) {
      throw new ToolError(
        "configuration_error",
        `Action class "${d.action_class}" llm_judgment_budget.monthly_usd must be >= daily_usd`,
        { context: { action_class: d.action_class } },
      );
    }
    if (!["haiku", "sonnet"].includes(model)) {
      throw new ToolError(
        "configuration_error",
        `Action class "${d.action_class}" llm_judgment_budget.model is invalid`,
        { context: { action_class: d.action_class, model } },
      );
    }
    if (
      !["structured_only", "escalate_to_user"].includes(fallback_on_budget_exhausted)
    ) {
      throw new ToolError(
        "configuration_error",
        `Action class "${d.action_class}" llm_judgment_budget.fallback_on_budget_exhausted is invalid`,
        { context: { action_class: d.action_class, fallback: fallback_on_budget_exhausted } },
      );
    }
  }
}

function descriptorsMatch(a: ActionClassDescriptor, b: ActionClassDescriptor): boolean {
  return (
    a.action_class === b.action_class &&
    a.source_app === b.source_app &&
    a.description === b.description &&
    a.customer_template === b.customer_template &&
    a.available_in_default_standing_grants === b.available_in_default_standing_grants &&
    a.always_requires_budget_attachment === b.always_requires_budget_attachment &&
    JSON.stringify(a.rate_limit_default) === JSON.stringify(b.rate_limit_default) &&
    JSON.stringify(a.llm_judgment_budget) === JSON.stringify(b.llm_judgment_budget) &&
    Boolean(a.llm_judgment_required) === Boolean(b.llm_judgment_required)
  );
}

export function _resetActionClassRegistryForTests(): void {
  registry.clear();
}
