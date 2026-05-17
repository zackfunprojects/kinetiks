/**
 * Customer-facing plain-language renderer for action class constraints.
 *
 * Per the 2027 addendum §2.14: constraints are rendered as sentences
 * via each Action Class's `customer_template`, never as raw field
 * labels. The literal phrase "Authority Grant" never appears in
 * customer-facing copy.
 *
 * Usage:
 *   renderCustomerSentence("implosion.adjust_bid", { max_pct_change: 25 })
 *   // → "Adjust bids up or down by up to 25% at a time."
 */

import type { ActionClassDescriptor } from "@kinetiks/types";
import { ToolError } from "./types";
import { assertActionClass, getActionClass } from "./action-class-registry";

/**
 * Customer templates use single-brace `{var}` placeholders for plain
 * readability (the 2027 addendum's chosen syntax). Prompts elsewhere
 * use double-brace `{{var}}` via `@kinetiks/lib/template-vars`. These
 * are deliberately different so customer sentences and agent prompts
 * never collide.
 */
const CUSTOMER_PLACEHOLDER_RE = /\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}/g;

/**
 * Render the plain-language sentence for an action class with the given
 * constraints. Throws if the action class is unregistered or the
 * constraints fail the action class's `constraint_schema`.
 */
export function renderCustomerSentence(
  actionClass: string,
  constraints: Record<string, unknown>,
): string {
  const descriptor = assertActionClass(actionClass);
  return renderFromDescriptor(descriptor, constraints);
}

/** Variant that takes an already-resolved descriptor. */
export function renderFromDescriptor(
  descriptor: ActionClassDescriptor,
  constraints: Record<string, unknown>,
): string {
  const parsed = descriptor.constraint_schema.safeParse(constraints);
  if (!parsed.success) {
    throw new ToolError(
      "invalid_input",
      `Constraints failed schema for action class "${descriptor.action_class}"`,
      {
        context: {
          action_class: descriptor.action_class,
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
      },
    );
  }
  const placeholders = extractTemplatePlaceholders(descriptor.customer_template);
  const values = parsed.data as Record<string, unknown>;
  for (const name of placeholders) {
    if (!(name in values)) {
      throw new ToolError(
        "configuration_error",
        `customer_template for "${descriptor.action_class}" references unknown placeholder "${name}"`,
        { context: { action_class: descriptor.action_class, placeholder: name } },
      );
    }
  }
  return descriptor.customer_template.replace(
    CUSTOMER_PLACEHOLDER_RE,
    (_match, name: string) => formatCustomerValue(values[name]),
  );
}

/**
 * Pull the set of placeholder names declared in a customer_template.
 * Single-brace `{var}` syntax; the renderer above uses the same regex.
 */
export function extractTemplatePlaceholders(template: string): string[] {
  const out = new Set<string>();
  for (const match of template.matchAll(CUSTOMER_PLACEHOLDER_RE)) out.add(match[1]);
  return Array.from(out);
}

function formatCustomerValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    // Integers render plainly; floats keep at most 2 decimals
    return Number.isInteger(value)
      ? String(value)
      : Number.parseFloat(value.toFixed(2)).toString();
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map((v) => formatCustomerValue(v)).join(", ");
  return String(value);
}

/**
 * For each registered action class, render a single example sentence
 * using the safest seed values. Useful for previewing all customer copy
 * in a Storybook-style surface (not used in production).
 */
export function exampleSentencesForAllRegistered(): Array<{
  action_class: string;
  sentence: string;
}> {
  const out: Array<{ action_class: string; sentence: string }> = [];
  // Lazily import to avoid circular module init
  const list = require("./action-class-registry").listActionClasses() as ActionClassDescriptor[];
  for (const d of list) {
    const placeholders = extractTemplatePlaceholders(d.customer_template);
    const fillers: Record<string, unknown> = {};
    for (const p of placeholders) fillers[p] = exampleValueFor(p);
    try {
      out.push({ action_class: d.action_class, sentence: renderFromDescriptor(d, fillers) });
    } catch {
      // Skip ones we can't render with naive fillers
    }
  }
  return out;
}

function exampleValueFor(_name: string): unknown {
  return 25;
}

// Re-export getActionClass for callers that want descriptor + render in one go.
export { getActionClass };
