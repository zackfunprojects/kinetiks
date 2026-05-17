import { z } from "zod";
import { defineTool } from "@kinetiks/tools";

/**
 * The canary tool. Used to verify the F1 registry seam end-to-end:
 *
 *   - registers without descriptor violations
 *   - validates input via Zod
 *   - executes without side effects
 *   - validates output via Zod
 *   - emits a tool_calls row via the configured logger
 *
 * Available to every account. Never removed (the verification path
 * depends on it). When F2 ships the Agent Runtime, this tool remains
 * the canonical health-check probe.
 */
export const noopTestTool = defineTool({
  name: "noop_test",
  description:
    "A read-only canary that echoes the provided message and returns the current server timestamp. Used to verify the platform tool registry, executor, and tool_calls logging path end-to-end. Has no side effects and never charges.",
  inputSchema: z.object({
    message: z.string().min(1).max(2000),
  }),
  outputSchema: z.object({
    echoed: z.string(),
    server_time: z.string(),
  }),
  isConsequential: false,
  autoApproveThreshold: null,
  availability: { kind: "always" },
  execute: async (input) => ({
    echoed: input.message,
    server_time: new Date().toISOString(),
  }),
});
