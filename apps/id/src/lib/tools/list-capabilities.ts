import { z } from "zod";
import {
  buildCapabilityManifest,
  defineTool,
  type AvailabilityResolvers,
} from "@kinetiks/tools";
import { platformAvailabilityResolvers } from "./availability";

/**
 * Marcus-callable meta-tool. Returns the per-account capability
 * manifest: tools available to this account, plus all registered
 * action classes and operators (account-agnostic).
 *
 * This is the LLM-discoverable answer to "what can you do?" and the
 * planning input for any agent that needs to choose which tool to call.
 */
export const listCapabilitiesTool = defineTool({
  name: "list_capabilities",
  description:
    "Returns the current account's capability manifest: which tools are available, what action classes the platform supports, and which operators exist per app. Use this when the user asks what the system can do, or when you need to choose between alternative tools.",
  inputSchema: z.object({}).strict(),
  outputSchema: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        description: z.string(),
        isConsequential: z.boolean(),
        actionClass: z.string().nullable(),
        autoApproveThreshold: z.number().nullable(),
      }),
    ),
    action_classes: z.array(
      z.object({
        action_class: z.string(),
        source_app: z.string(),
        description: z.string(),
        customer_template: z.string(),
        available_in_default_standing_grants: z.boolean(),
        always_requires_budget_attachment: z.boolean(),
      }),
    ),
    operators: z.array(
      z.object({
        app: z.string(),
        key: z.string(),
        description: z.string(),
        required_tools: z.array(z.string()),
        action_classes: z.array(z.string()),
      }),
    ),
  }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (_input, ctx) => {
    const resolvers: AvailabilityResolvers = platformAvailabilityResolvers;
    return buildCapabilityManifest(
      { accountId: ctx.accountId, userId: ctx.userId ?? null },
      resolvers,
    );
  },
});
