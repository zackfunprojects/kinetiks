import { z } from "zod";
import { defineTool, getActionClass } from "@kinetiks/tools";

import { getGrantReader } from "@kinetiks/runtime";

/**
 * Authority resolution lookup tool per the Kinetiks Contract Addendum §2.9.
 *
 * Given an action_class (and optional scope context), this tool tells
 * Marcus whether an active Authority Grant currently covers it. The
 * answer is plain-language so Marcus can paraphrase without inventing
 * grant semantics — and it routes through the same `GrantReader`
 * adapter the runtime's `defaultAuthorityResolver` uses, so the
 * answer matches what the runtime would do on a real tool call.
 *
 * Phase 4 — Chunk 10. The F2 stub returned `auto_threshold` for every
 * input; this real implementation reads `kinetiks_authority_grants`
 * via the configured `GrantReader` (wired in apps/id at boot).
 *
 * Note on the resolver split: the constraint/rate-limit/escalation
 * checks in the full resolver depend on a concrete `action_input`. For
 * a hypothetical query ("could you do X?"), we only need to know if
 * a covering grant EXISTS. The detailed-outcome path runs at actual
 * tool invocation time.
 */
export const queryActionsAuthorityTool = defineTool({
  name: "query_actions_authority",
  description:
    "Resolve the current authority for a given action class. Returns whether an active permission covers it and the covering grant's id, scope, and matched capability when one exists. Use this when the user asks 'do you have permission to X?' or 'what would happen if you tried X right now?'. For a broader 'what permissions do you have at all?' summary, use query_active_authority instead.",
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
    /** The plain-language template the customer originally approved. */
    customer_template: z.string().nullable(),
    /** True when an active grant covers this action class at the requested scope. */
    covered: z.boolean(),
    grant_id: z.string().nullable(),
    scope_type: z
      .enum(["campaign", "workflow", "program", "standing"])
      .nullable(),
    scope_id: z.string().nullable(),
    expires_at: z.string().nullable(),
    explanation: z.string(),
  }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input, ctx) => {
    const accountId = ctx.accountId;
    if (!accountId) {
      throw new Error(
        "query_actions_authority: ToolExecutionContext.accountId missing",
      );
    }

    const descriptor = getActionClass(input.action_class);
    if (!descriptor) {
      return {
        action_class: input.action_class,
        action_class_registered: false,
        customer_template: null,
        covered: false,
        grant_id: null,
        scope_type: null,
        scope_id: null,
        expires_at: null,
        explanation: `"${input.action_class}" is not a registered action class — no tool advertises this capability, and no permission could cover it.`,
      };
    }

    const reader = getGrantReader();
    if (!reader) {
      // Adapter not wired — surface the failure rather than silently
      // returning a misleading "no permission" answer.
      throw new Error(
        "query_actions_authority: GrantReader adapter is not configured at runtime boot",
      );
    }

    // Wrap the GrantReader call in a try/catch so a database error
    // surfaces with tool context instead of bubbling a bare error up
    // to the agent runtime. The runtime catches and converts ToolError
    // / Error into a structured tool_calls failure row; wrapping here
    // attaches the lookup context Marcus needs for any follow-up.
    let grant;
    try {
      grant = await reader.findCoveringGrant({
        account_id: accountId,
        action_class: input.action_class,
        scope_type: input.scope_type ?? "standing",
        scope_id: input.scope_id ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      throw new Error(
        `query_actions_authority: failed to resolve grant for action_class="${input.action_class}" — ${message}`,
      );
    }

    if (!grant) {
      return {
        action_class: input.action_class,
        action_class_registered: true,
        customer_template: descriptor.customer_template,
        covered: false,
        grant_id: null,
        scope_type: null,
        scope_id: null,
        expires_at: null,
        explanation: `No active permission covers ${input.action_class}. The next call routes through the per-tool confidence threshold; the customer may see it in the Approvals queue.`,
      };
    }

    return {
      action_class: input.action_class,
      action_class_registered: true,
      customer_template: descriptor.customer_template,
      covered: true,
      grant_id: grant.id,
      scope_type: grant.scope_type,
      scope_id: grant.scope_id,
      expires_at: grant.expires_at,
      explanation: `An active permission covers ${input.action_class} at ${grant.scope_type} scope. Constraint: "${descriptor.customer_template}". The next call executes without checking with the customer, subject to the grant's escalation triggers.`,
    };
  },
});
