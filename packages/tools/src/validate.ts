/**
 * Cross-registry boot validation.
 *
 * Called once at app startup, after every `registerTool`,
 * `registerActionClass`, `registerOperators`, and `registerPatternType`
 * has run. Catches the kind of inconsistency that is costly to discover
 * at runtime:
 *
 *  - A consequential tool references an unregistered action_class
 *  - An operator's required_tools contain an unregistered tool
 *  - An operator's action_classes contain an unregistered class
 *  - An operator's required_patterns contain an unregistered pattern type
 *
 * Returns a structured report. Throws on failure so apps fail at boot
 * rather than at runtime.
 */

import { listActionClasses, getActionClass } from "./action-class-registry";
import { listAllOperators } from "./operator-registry";
import { getPatternType, listPatternTypes } from "./pattern-type-registry";
import { listTools, getTool } from "./tool-registry";
import { ToolError } from "./types";

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: {
    tools: number;
    actionClasses: number;
    operators: number;
    patternTypes: number;
  };
}

export function validateRegistries(): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const tools = listTools();
  const actionClasses = listActionClasses();
  const operators = listAllOperators();
  const patternTypes = listPatternTypes();

  // 1. Every consequential tool that declares an actionClass must reference a registered class.
  for (const tool of tools) {
    if (tool.isConsequential && tool.actionClass) {
      if (!getActionClass(tool.actionClass)) {
        errors.push(
          `Tool "${tool.name}" references unregistered action_class "${tool.actionClass}"`,
        );
      }
    }
  }

  // 2. Every operator's required_tools must be registered.
  // 3. Every operator's action_classes must be registered.
  // 4. Every operator's required_patterns must be in the Pattern Type Registry (L1a).
  for (const { app, descriptor } of operators) {
    for (const t of descriptor.required_tools) {
      if (!getTool(t)) {
        errors.push(
          `Operator "${app}.${descriptor.key}" requires unregistered tool "${t}"`,
        );
      }
    }
    for (const ac of descriptor.action_classes) {
      if (!getActionClass(ac)) {
        errors.push(
          `Operator "${app}.${descriptor.key}" references unregistered action_class "${ac}"`,
        );
      }
    }
    for (const pt of descriptor.required_patterns) {
      if (!getPatternType(pt)) {
        errors.push(
          `Operator "${app}.${descriptor.key}" references unregistered pattern_type "${pt}"`,
        );
      }
    }
  }

  // 5. Action class `source_app` must match the app prefix of at least one tool
  //    that references the class — i.e., we don't have orphan classes.
  for (const ac of actionClasses) {
    const referenced = tools.some((t) => t.actionClass === ac.action_class);
    if (!referenced) {
      warnings.push(
        `Action class "${ac.action_class}" is registered but not referenced by any tool`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: {
      tools: tools.length,
      actionClasses: actionClasses.length,
      operators: operators.length,
      patternTypes: patternTypes.length,
    },
  };
}

/** Throws on failure; logs warnings to stderr. */
export function assertRegistriesValid(): ValidationReport {
  const report = validateRegistries();
  for (const w of report.warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[tools/validate] ${w}`);
  }
  if (!report.ok) {
    throw new ToolError(
      "configuration_error",
      `Registry validation failed:\n  - ${report.errors.join("\n  - ")}`,
      { context: { errors: report.errors } },
    );
  }
  return report;
}
