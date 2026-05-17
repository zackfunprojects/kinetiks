import { z } from "zod";
import { defineTool } from "@kinetiks/tools";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPatterns } from "@/lib/cortex/patterns/list";

/**
 * Pattern Library read tool per the Kinetiks Contract Addendum §1.5.
 *
 * Replaces the F2 stub: now backed by `apps/id/src/lib/cortex/patterns/list.ts`,
 * which reads from `kinetiks_pattern_library` with the descriptor-defined
 * `read_apps` allowlist enforced server-side.
 *
 * The same shared helper powers the Cortex Patterns Server Action so
 * there is exactly one read path for the Pattern Library. The caller_app
 * value is derived from the agent runtime context (passed via
 * `ToolExecutionContext.metadata?.caller_app` when invoked from an
 * agent, or set explicitly when invoked from a direct admin/test path).
 *
 * Marcus's evidence brief consumes this tool as one option; Phase 1
 * also pre-fetches the Library passively into the manifest (commit 22).
 */
export const queryPatternsTool = defineTool({
  name: "query_patterns",
  description:
    "Query the Pattern Library: empirically validated multi-dimensional signatures of what is working for this customer's business, emitted by suite apps and arbitrated by the Archivist. Use this to ground recommendations in evidence before suggesting actions. Returns patterns matching the requested filters, enforcing the read_apps allowlist on the calling app context.",
  inputSchema: z.object({
    pattern_types: z.array(z.string()).optional(),
    source_apps: z.array(z.string()).optional(),
    applies_to_icp: z.string().nullable().optional(),
    minimum_confidence: z.number().min(0).max(1).optional(),
    status_in: z
      .array(z.enum(["emerging", "validated", "declining"]))
      .optional(),
    exclude_user_suppressed: z.boolean().optional(),
    only_starred: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: z.object({
    patterns: z.array(
      z.object({
        id: z.string(),
        pattern_type: z.string(),
        emitting_app: z.string(),
        applies_to_icp: z.string().nullable(),
        status: z.enum(["emerging", "validated", "declining", "archived"]),
        confidence_score: z.number(),
        observation_count: z.number().int(),
        first_observed_at: z.string(),
        last_observed_at: z.string(),
        decay_at: z.string(),
        dimensions: z.record(z.unknown()),
        outcome_metrics: z.array(
          z.object({
            metric_name: z.string(),
            value: z.number(),
            sample_count: z.number().int(),
            confidence: z.number(),
            unit: z.string(),
          }),
        ),
        user_starred: z.boolean(),
        user_suppressed: z.boolean(),
        user_annotation: z.string().nullable(),
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
      throw new Error("query_patterns: ToolExecutionContext.accountId missing");
    }
    const callerApp =
      (ctx.metadata?.caller_app as string | undefined) ?? "marcus";
    const admin = createAdminClient();
    const { patterns, total } = await listPatterns(admin, {
      account_id: accountId,
      caller_app: callerApp,
      pattern_types: input.pattern_types,
      source_apps: input.source_apps,
      applies_to_icp: input.applies_to_icp ?? undefined,
      minimum_confidence: input.minimum_confidence,
      status_in: input.status_in,
      exclude_user_suppressed: input.exclude_user_suppressed,
      only_starred: input.only_starred,
      limit: input.limit,
    });
    return {
      patterns: patterns.map((p) => ({
        id: p.id,
        pattern_type: p.pattern_type,
        emitting_app: p.emitting_app,
        applies_to_icp: p.applies_to_icp,
        status: p.status,
        confidence_score: p.confidence_score,
        observation_count: p.observation_count,
        first_observed_at: p.first_observed_at,
        last_observed_at: p.last_observed_at,
        decay_at: p.decay_at,
        dimensions: p.dimensions,
        outcome_metrics: p.outcome_metrics,
        user_starred: p.user_starred,
        user_suppressed: p.user_suppressed,
        user_annotation: p.user_annotation,
      })),
      total,
    };
  },
});
