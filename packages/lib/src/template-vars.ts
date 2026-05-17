/**
 * Whitelist-validated template variable substitution.
 *
 * Per CLAUDE.md: never `.replace()` jsonb directly when interpolating
 * `{{variable}}` placeholders into agent prompts. Variables go through
 * this validator, which:
 *
 *  1. Declares allowed variable names per template
 *  2. Fails if an unknown placeholder appears in the template
 *  3. Fails if a required placeholder is missing from the values
 *  4. Coerces values to strings via a safe-stringify (no raw objects leak)
 *
 * The validator does not protect against semantic prompt injection from
 * inside a legitimate value — that's a content-scrub concern (see PII
 * helpers). It protects against accidental leakage of unintended fields
 * (e.g. jsonb with PII) and silent typos.
 */

import { Result, err, ok } from "./result";

export interface TemplateSpec {
  /** Whitelist of placeholder names the template is permitted to reference. */
  allowed: readonly string[];
  /** Subset of `allowed` that must be supplied at render time. */
  required?: readonly string[];
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;

/** Returns the set of placeholder names found in the template string. */
export function extractPlaceholders(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) out.add(m[1]);
  return Array.from(out);
}

export function validateTemplate(template: string, spec: TemplateSpec): Result<true, string> {
  const found = extractPlaceholders(template);
  for (const name of found) {
    if (!spec.allowed.includes(name)) {
      return err(`template references unknown placeholder: "${name}"`);
    }
  }
  return ok(true);
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  // Objects/arrays: stringify deterministically; refuse functions/symbols
  if (typeof value === "function" || typeof value === "symbol") {
    throw new Error("[template-vars] non-stringifiable value (function/symbol)");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
  spec: TemplateSpec,
): Result<string, string> {
  const validation = validateTemplate(template, spec);
  if (!validation.ok) return validation;

  const required = spec.required ?? [];
  for (const name of required) {
    if (!(name in values)) {
      return err(`missing required placeholder: "${name}"`);
    }
  }

  // Replace; any placeholder without a value resolves to empty string after passing validation
  const out = template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    if (!(name in values)) return "";
    try {
      return safeStringify(values[name]);
    } catch {
      return "";
    }
  });

  return ok(out);
}
