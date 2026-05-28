import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

import { createAdminClient } from "@/lib/supabase/admin";
import { listGrants } from "@/lib/cortex/authority/list";

/**
 * "What authority do you have right now?" — Marcus's broad-summary
 * read tool over the customer's active Authority Grants per the
 * Kinetiks Contract Addendum §2.13.
 *
 * Returns the active (and optionally paused) grants for the customer,
 * each with its plain-language scope description, capability summaries
 * (which already render the action class's customer_template — these
 * are NOT raw constraint dumps), and a rolled-up usage summary so
 * Marcus can answer "what have you done with that today?" in the same
 * tool call.
 *
 * Customer-facing language: per CLAUDE.md and Addendum §2.14, NEVER
 * surfaces the literal phrase "Authority Grant" in any user-facing
 * field. Field names are descriptive and tied to the customer's
 * mental model ("permissions", not "grants").
 *
 * Phase 4 — Chunk 10.
 */
export const queryActiveAuthorityTool = defineTool({
  name: "query_active_authority",
  description:
    "Summarize the customer's active permissions: what the system can do on their behalf right now, the constraints, what would trigger a check-in, expiry, and how it's been used. Use this when the user asks 'what authority do you have?', 'what permissions are active?', or 'what have you been doing on my behalf?'. For 'does a permission cover X specifically?', use query_actions_authority instead.",
  inputSchema: z.object({
    /** Include paused grants in the summary. Default false (active only). */
    include_paused: z.boolean().optional(),
    /** Filter by scope_type. */
    scope_type: z
      .enum(["campaign", "workflow", "program", "standing"])
      .optional(),
    /** Filter to grants expiring within N days. */
    expiring_within_days: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  outputSchema: z.object({
    permissions: z.array(
      z.object({
        permission_id: z.string(),
        scope_type: z.enum(["campaign", "workflow", "program", "standing"]),
        scope_description: z.string(),
        status: z.enum(["active", "paused"]),
        granted_at: z.string().nullable(),
        expires_at: z.string().nullable(),
        capabilities: z.array(
          z.object({
            action_class: z.string(),
            description: z.string(),
            rate_limit: z
              .object({
                count: z.number().int(),
                window: z.enum(["minute", "hour", "day", "week"]),
              })
              .nullable(),
          }),
        ),
        triggers: z.array(
          z.object({
            type: z.enum([
              "anomaly",
              "novelty",
              "pacing",
              "threshold",
              "llm_judged",
            ]),
            description: z.string(),
          }),
        ),
        spending_envelope: z
          .object({
            per_day: z.number().nullable(),
            per_action: z.number().nullable(),
            currency: z.string(),
          })
          .nullable(),
        usage: z.object({
          total_actions_taken: z.number().int(),
          per_action_class: z.record(z.number().int()),
          escalations_triggered: z.number().int(),
        }),
      }),
    ),
    total: z.number().int().nonnegative(),
  }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input, ctx) => {
    const accountId = ctx.accountId;
    if (!accountId) {
      throw new Error(
        "query_active_authority: ToolExecutionContext.accountId missing",
      );
    }

    const admin = createAdminClient();
    const status_in = input.include_paused
      ? (["active", "paused"] as const)
      : (["active"] as const);
    // Wrap the listGrants call so a database error surfaces with tool
    // context (mirrors the query_actions_authority pattern). The agent
    // runtime catches and converts the thrown Error into a structured
    // tool_calls failure row; the context here helps Marcus phrase a
    // follow-up to the customer.
    let page;
    try {
      page = await listGrants(admin, {
        account_id: accountId,
        status_in,
        scope_type: input.scope_type,
        expiring_within_days: input.expiring_within_days,
        limit: input.limit ?? 20,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      throw new Error(
        `query_active_authority: failed to list grants — ${message}`,
      );
    }

    const permissions = page.items.map((g) => ({
      permission_id: g.id,
      scope_type: g.scope_type,
      scope_description: g.scope_description,
      status: g.status as "active" | "paused",
      granted_at: g.granted_at,
      expires_at: g.expires_at,
      capabilities: g.granted_capabilities.map((c) => ({
        action_class: c.action_class,
        description: c.description,
        rate_limit: c.rate_limit
          ? { count: c.rate_limit.count, window: c.rate_limit.window }
          : null,
      })),
      triggers: g.escalation_triggers.map((t) => ({
        type: t.type,
        description: t.description,
      })),
      spending_envelope:
        g.max_unapproved_spend_per_day !== null ||
        g.max_unapproved_spend_per_action !== null
          ? {
              per_day: g.max_unapproved_spend_per_day,
              per_action: g.max_unapproved_spend_per_action,
              currency: g.spending_currency,
            }
          : null,
      usage: {
        total_actions_taken: Object.values(g.usage_summary.action_counts).reduce(
          (sum, v) => sum + (typeof v === "number" ? v : 0),
          0,
        ),
        per_action_class: g.usage_summary.action_counts,
        escalations_triggered: g.usage_summary.escalations_triggered,
      },
    }));

    return {
      permissions,
      total: permissions.length,
    };
  },
});
