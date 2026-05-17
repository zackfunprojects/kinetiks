import { z } from "zod";
import { defineTool, getActionClass } from "@kinetiks/tools";

/**
 * F2 stub for the Authority Grants read path. Returns the resolution
 * outcome the Agent Runtime would apply for a given action class right
 * now. Until L2a ships the real `kinetiks_authority_grants` table and
 * the Authority Agent, every action class resolves to `auto_threshold`
 * (i.e. no covering grant; fall back to the per-tool
 * `autoApproveThreshold`).
 *
 * Marcus uses this so it can plainly answer "what authority do you have
 * for X right now?" without inventing a grant that doesn't exist.
 */
export const queryActionsAuthorityTool = defineTool({
  name: "query_actions_authority",
  description:
    "Resolve the current Authority Grant status for a given action class. Returns the resolution outcome (grant_covers / auto_threshold / queued / escalated / fallback / denied) and the covering grant_id when one exists. Until L2a, every action class resolves to 'auto_threshold' with no covering grant. Use this when the user asks about permissions, authority, or what the system can do without asking.",
  inputSchema: z.object({
    action_class: z.string().min(1),
    scope_id: z.string().optional(),
    scope_type: z
      .enum(["campaign", "workflow", "program", "standing"])
      .optional(),
  }),
  outputSchema: z.object({
    action_class: z.string(),
    action_class_registered: z.boolean(),
    customer_template: z.string().nullable(),
    outcome: z.enum([
      "grant_covers",
      "auto_threshold",
      "queued",
      "escalated",
      "fallback",
      "denied",
      "unknown_action_class",
    ]),
    grant_id: z.string().nullable(),
    /** True until L2a wires the real Authority Grants table. */
    stub: z.boolean(),
  }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input) => {
    const descriptor = getActionClass(input.action_class);
    if (!descriptor) {
      return {
        action_class: input.action_class,
        action_class_registered: false,
        customer_template: null,
        outcome: "unknown_action_class" as const,
        grant_id: null,
        stub: true,
      };
    }
    return {
      action_class: input.action_class,
      action_class_registered: true,
      customer_template: descriptor.customer_template,
      outcome: "auto_threshold" as const,
      grant_id: null,
      stub: true,
    };
  },
});
