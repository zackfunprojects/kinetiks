import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

/**
 * F2 stub for the Pattern Library read path. Returns an empty list
 * until L1a lands the real `kinetiks_pattern_library` table + Archivist
 * write path + Pattern Type Registry.
 *
 * The shape matches the addendum's §1.5 `QueryPatternsInput` so callers
 * built against the stub will continue working without code changes
 * once L1a populates the underlying registry.
 *
 * Per the addendum the read allowlist is enforced at this tool layer.
 * The F2 stub is permissive — it returns empty regardless of pattern
 * type — because no patterns exist yet to filter. L1a enforces the
 * allowlist via the Pattern Type Registry.
 */
export const queryPatternsTool = defineTool({
  name: "query_patterns",
  description:
    "Query the Pattern Library: empirically-validated multi-dimensional signatures of what works for this customer's business, emitted by suite apps and arbitrated by the Archivist. Use this before recommending actions so reasoning is grounded in evidence. Returns an empty array until the Pattern Library is populated (L1a).",
  inputSchema: z.object({
    pattern_types: z.array(z.string()).optional(),
    source_apps: z.array(z.string()).optional(),
    applies_to_icp: z.string().nullable().optional(),
    minimum_confidence: z.number().min(0).max(1).optional(),
    status_in: z
      .array(z.enum(["emerging", "validated", "declining"]))
      .optional(),
    exclude_user_suppressed: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: z.object({
    patterns: z.array(z.unknown()),
    total: z.number().int().nonnegative(),
    /** True until L1a wires the real registry. */
    stub: z.boolean(),
  }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async () => ({
    patterns: [],
    total: 0,
    stub: true,
  }),
});
