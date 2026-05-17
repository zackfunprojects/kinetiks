import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { executeTool, getTool, ToolError } from "@kinetiks/tools";
import { platformAvailabilityResolvers } from "@/lib/tools/availability";
import { captureException } from "@/lib/observability/sentry";

const RequestBodySchema = z.object({
  tool_name: z.string().min(1),
  input: z.unknown(),
  invoked_by_agent: z.string().min(1).default("api"),
  correlation_id: z.string().optional(),
  thread_id: z.string().uuid().optional(),
  agent_run_id: z.string().uuid().optional(),
  parent_ai_call_id: z.string().uuid().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
});

/**
 * POST /api/tools/execute
 *
 * The F1 invocation seam — runs a tool from the platform registry on
 * behalf of an authenticated caller and logs one tool_calls row.
 *
 * The Agent Runtime (F2) will be the primary invoker; this endpoint
 * provides the explicit HTTP surface for verifying the registry path
 * and for callers that prefer HTTP to the in-process runtime.
 *
 * Body: { tool_name, input, invoked_by_agent?, correlation_id?, ... }
 * Returns: { success: true, data: <tool output> } on success
 */
export async function POST(request: Request): Promise<Response> {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Request body must be valid JSON", 400);
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request body", 400, {
      issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }

  const tool = getTool(parsed.data.tool_name);
  if (!tool) {
    return apiError(`Unknown tool: ${parsed.data.tool_name}`, 404);
  }

  try {
    const output = await executeTool(tool, parsed.data.input, {
      accountId: auth.account_id,
      userId: auth.user_id,
      invokedByAgent: parsed.data.invoked_by_agent,
      correlationId: parsed.data.correlation_id,
      threadId: parsed.data.thread_id,
      agentRunId: parsed.data.agent_run_id,
      parentAiCallId: parsed.data.parent_ai_call_id,
      metadata: parsed.data.metadata,
    }, {
      availability: platformAvailabilityResolvers,
    });
    return apiSuccess(output);
  } catch (e) {
    if (e instanceof ToolError) {
      // Friendly user-safe message; structured context goes to Sentry
      // only for unexpected error classes.
      if (e.errorClass === "internal_error" || e.errorClass === "configuration_error") {
        await captureException(e, {
          tags: {
            route: "/api/tools/execute",
            action: "tool.execute",
            stage: "execute",
            app: "id",
          },
          user: { id: auth.account_id },
          extra: {
            tool: parsed.data.tool_name,
            errorClass: e.errorClass,
            invokedByAgent: parsed.data.invoked_by_agent,
          },
        });
      }
      return apiError(e.userMessage, e.status, { error_class: e.errorClass });
    }
    await captureException(e, {
      tags: {
        route: "/api/tools/execute",
        action: "tool.execute",
        stage: "execute",
        app: "id",
      },
      user: { id: auth.account_id },
      extra: { tool: parsed.data.tool_name },
    });
    return apiError("Tool execution failed", 500);
  }
}
