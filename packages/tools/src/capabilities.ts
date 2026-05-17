/**
 * Capability manifest — what Marcus calls when the user asks
 * "what can you do?" or when an LLM needs to know which tools to
 * choose from.
 *
 * The output is intentionally serializable (Zod schemas are not
 * included; only describable fields). Consumers that need the schemas
 * call the registry directly.
 */

import { listActionClasses } from "./action-class-registry";
import { listAllOperators } from "./operator-registry";
import { listAvailableTools, type AvailabilityResolvers } from "./tool-registry";
import type { AvailabilityContext } from "./types";

export interface ToolCapability {
  name: string;
  version?: string;
  description: string;
  isConsequential: boolean;
  actionClass: string | null;
  autoApproveThreshold: number | null;
}

export interface ActionClassCapability {
  action_class: string;
  source_app: string;
  description: string;
  customer_template: string;
  available_in_default_standing_grants: boolean;
  always_requires_budget_attachment: boolean;
}

export interface OperatorCapability {
  app: string;
  key: string;
  description: string;
  required_tools: string[];
  action_classes: string[];
}

export interface CapabilityManifest {
  /** Tools available to the account asking. */
  tools: ToolCapability[];
  /** All registered action classes (account-agnostic). */
  action_classes: ActionClassCapability[];
  /** All registered operators (account-agnostic). */
  operators: OperatorCapability[];
}

/**
 * Build the per-account capability manifest. Tools are filtered by
 * availability; action classes and operators are global.
 */
export async function buildCapabilityManifest(
  ctx: AvailabilityContext,
  resolvers: AvailabilityResolvers,
): Promise<CapabilityManifest> {
  const tools = await listAvailableTools(ctx, resolvers);
  return {
    tools: tools.map((t) => ({
      name: t.name,
      version: t.version,
      description: t.description,
      isConsequential: t.isConsequential,
      actionClass: t.actionClass ?? null,
      autoApproveThreshold: t.autoApproveThreshold,
    })),
    action_classes: listActionClasses().map((d) => ({
      action_class: d.action_class,
      source_app: d.source_app,
      description: d.description,
      customer_template: d.customer_template,
      available_in_default_standing_grants: d.available_in_default_standing_grants,
      always_requires_budget_attachment: d.always_requires_budget_attachment,
    })),
    operators: listAllOperators().map(({ app, descriptor }) => ({
      app,
      key: descriptor.key,
      description: descriptor.description,
      required_tools: [...descriptor.required_tools],
      action_classes: [...descriptor.action_classes],
    })),
  };
}
