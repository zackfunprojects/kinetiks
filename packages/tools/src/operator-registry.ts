/**
 * Operator Registry — per-app inventory of every Operator that may be
 * addressed by a `WorkflowTask` with `target_type: "internal_operator"`.
 *
 * Per the Kinetiks Contract Addendum §3.3. Apps without internal Workflows omit the
 * `operator_registry` field on their manifest entirely; they make no
 * call to `registerOperators` and pay no cost.
 *
 * Registration validates structural invariants AND (when cross-validate
 * runs at boot) checks that every `required_tools` entry exists in the
 * Tool Registry and every `action_classes` entry exists in the Action
 * Class Registry. `required_patterns` cross-validation lands in L1a.
 */

import type { OperatorDescriptor } from "@kinetiks/types";
import { ToolError } from "./types";

interface OperatorEntry {
  app: string;
  descriptor: OperatorDescriptor;
  registeredAt: number;
}

const registry = new Map<string, OperatorEntry>(); // key: `${app}.${operator_key}`

function key(app: string, operatorKey: string): string {
  return `${app}.${operatorKey}`;
}

export function registerOperators(app: string, operators: readonly OperatorDescriptor[]): void {
  if (!app || typeof app !== "string") {
    throw new ToolError(
      "configuration_error",
      `registerOperators requires a non-empty app key`,
      {},
    );
  }
  if (!/^[a-z][a-z0-9_]*$/.test(app)) {
    throw new ToolError(
      "configuration_error",
      `App key "${app}" must be lowercase snake_case`,
      { context: { app } },
    );
  }
  for (const op of operators) {
    assertOperatorDescriptor(op);
    const k = key(app, op.key);
    const existing = registry.get(k);
    if (existing) {
      if (descriptorsMatch(existing.descriptor, op) && existing.app === app) continue;
      throw new ToolError(
        "configuration_error",
        `Operator "${app}.${op.key}" is already registered with a conflicting descriptor`,
        { context: { app, operator: op.key } },
      );
    }
    registry.set(k, { app, descriptor: op, registeredAt: Date.now() });
  }
}

export function getOperator(app: string, operatorKey: string): OperatorDescriptor | undefined {
  return registry.get(key(app, operatorKey))?.descriptor;
}

export function assertOperator(app: string, operatorKey: string): OperatorDescriptor {
  const d = registry.get(key(app, operatorKey))?.descriptor;
  if (!d) {
    throw new ToolError(
      "configuration_error",
      `Unknown operator: ${app}.${operatorKey}`,
      { context: { app, operator: operatorKey } },
    );
  }
  return d;
}

export function listOperatorsForApp(app: string): OperatorDescriptor[] {
  return Array.from(registry.values())
    .filter((e) => e.app === app)
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((e) => e.descriptor);
}

export function listAllOperators(): Array<{ app: string; descriptor: OperatorDescriptor }> {
  return Array.from(registry.values())
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((e) => ({ app: e.app, descriptor: e.descriptor }));
}

// ============================================================
// Structural validation
// ============================================================

function assertOperatorDescriptor(d: OperatorDescriptor): void {
  if (!d.key || !/^[a-z][a-z0-9_]*$/.test(d.key)) {
    throw new ToolError(
      "configuration_error",
      `Operator key must be lowercase snake_case (received "${d.key}")`,
      { context: { operator: d.key } },
    );
  }
  if (!d.description || d.description.trim().length < 16) {
    throw new ToolError(
      "configuration_error",
      `Operator "${d.key}" must have a description of at least 16 chars`,
      { context: { operator: d.key } },
    );
  }
  if (!d.inputs_schema || typeof d.inputs_schema.parse !== "function") {
    throw new ToolError(
      "configuration_error",
      `Operator "${d.key}" inputs_schema must be a Zod schema`,
      { context: { operator: d.key } },
    );
  }
  if (!d.outputs_schema || typeof d.outputs_schema.parse !== "function") {
    throw new ToolError(
      "configuration_error",
      `Operator "${d.key}" outputs_schema must be a Zod schema`,
      { context: { operator: d.key } },
    );
  }
  if (!Array.isArray(d.required_tools)) {
    throw new ToolError(
      "configuration_error",
      `Operator "${d.key}" required_tools must be an array of tool names`,
      { context: { operator: d.key } },
    );
  }
  if (!Array.isArray(d.required_patterns)) {
    throw new ToolError(
      "configuration_error",
      `Operator "${d.key}" required_patterns must be an array of pattern_type keys`,
      { context: { operator: d.key } },
    );
  }
  if (!Array.isArray(d.action_classes)) {
    throw new ToolError(
      "configuration_error",
      `Operator "${d.key}" action_classes must be an array of action_class keys`,
      { context: { operator: d.key } },
    );
  }
}

function descriptorsMatch(a: OperatorDescriptor, b: OperatorDescriptor): boolean {
  return (
    a.key === b.key &&
    a.description === b.description &&
    JSON.stringify([...a.required_tools].sort()) ===
      JSON.stringify([...b.required_tools].sort()) &&
    JSON.stringify([...a.required_patterns].sort()) ===
      JSON.stringify([...b.required_patterns].sort()) &&
    JSON.stringify([...a.action_classes].sort()) ===
      JSON.stringify([...b.action_classes].sort())
  );
}

export function _resetOperatorRegistryForTests(): void {
  registry.clear();
}
