/**
 * F1 tool executor — the structural invocation path.
 *
 * What this does:
 *  1. Validate input against `tool.inputSchema`
 *  2. Check availability (predicate + custom resolver)
 *  3. Compute idempotency key (consequential tools only)
 *  4. If idempotency key matches a previous successful call, short-circuit
 *  5. Run `tool.execute(input, ctx)`
 *  6. Validate output against `tool.outputSchema`
 *  7. Write one `tool_calls` row via the registered ToolCallLogger
 *
 * What this DOES NOT do (yet):
 *  - Authority resolution: F2 wraps `executeTool` with the Agent Runtime
 *    that resolves any active Authority Grant, fills `authorityOutcome`,
 *    and skips/escalates as appropriate. F1 always writes
 *    `authorityOutcome: "auto_threshold"` for non-consequential tools
 *    and leaves it null for consequential ones (a stub the Runtime
 *    overrides).
 *  - Rate limiting: lives in the Authority Grant layer.
 *  - Retries: lives in the Agent Runtime; deterministic tools should
 *    not retry without authority approval.
 *
 * Per CLAUDE.md, every consequential action requires an approval or a
 * covering grant. F1's executor is permissive — it runs whatever the
 * caller invokes — but logs structurally so F2 can layer policy on top.
 *
 * Idempotency dedup: F1 checks the logger's `findSuccessfulCall` hook
 * (when available) for an existing successful row with the same
 * `(account_id, tool_name, idempotency_key)`. If found, returns its
 * cached output via the optional logger.recoverOutput hook. Most apps
 * will wire this to a Supabase query.
 */

import { z } from "zod";
import type {
  AgentTool,
  AuthorityOutcome,
  AvailabilityContext,
  ToolCallLogPayload,
  ToolErrorClass,
  ToolExecutionContext,
} from "./types";
import { ToolError } from "./types";
import { isAvailable, type AvailabilityResolvers } from "./tool-registry";
import { emitToolCallLog } from "./logger";

const defaultResolvers: AvailabilityResolvers = {
  connection_required: async () => false,
  plan_required: async () => false,
};

export interface ExecuteToolOptions {
  /** Per-account availability resolvers; defaults reject for safety. */
  availability?: AvailabilityResolvers;
  /**
   * Optional idempotency dedup hook. If provided AND a successful row
   * matches `(account_id, tool_name, idempotency_key)`, the cached
   * output is returned without running `execute`.
   */
  idempotency?: {
    findSuccessful: (input: {
      accountId: string;
      toolName: string;
      idempotencyKey: string;
    }) => Promise<{ output: unknown } | null>;
  };
  /** Override the recorded `authorityOutcome`. Defaults vary by isConsequential. */
  authorityOutcomeOverride?: AuthorityOutcome | null;
}

export async function executeTool<TInput, TOutput>(
  tool: AgentTool<TInput, TOutput>,
  rawInput: unknown,
  ctx: ToolExecutionContext,
  options: ExecuteToolOptions = {},
): Promise<TOutput> {
  const startedAt = new Date();
  const t0 = performance.now();
  const baseRecord = (): Omit<
    ToolCallLogPayload,
    "status" | "latencyMs" | "completedAt"
  > => ({
    toolName: tool.name,
    toolVersion: tool.version ?? null,
    isConsequential: tool.isConsequential,
    actionClass: tool.actionClass ?? null,
    invokedByAgent: ctx.invokedByAgent,
    parentAiCallId: ctx.parentAiCallId ?? null,
    idempotencyKey: null, // filled below for consequential
    accountId: ctx.accountId,
    userId: ctx.userId ?? null,
    teamScopeId: ctx.teamScopeId ?? null,
    correlationId: ctx.correlationId ?? null,
    threadId: ctx.threadId ?? null,
    agentRunId: ctx.agentRunId ?? null,
    proposalId: ctx.proposalId ?? null,
    approvalId: ctx.approvalId ?? null,
    grantId: ctx.grantId ?? null,
    patternId: ctx.patternId ?? null,
    errorClass: null,
    errorMessage: null,
    authorityOutcome: defaultAuthorityOutcome(tool, options),
    startedAt: startedAt.toISOString(),
    metadata: ctx.metadata ?? {},
  });

  // 1. Validate input
  const inputParse = tool.inputSchema.safeParse(rawInput);
  if (!inputParse.success) {
    await emitFailure(baseRecord(), startedAt, t0, "invalid_input", inputParse.error);
    throw new ToolError(
      "invalid_input",
      `Input failed validation for tool "${tool.name}"`,
      {
        cause: inputParse.error,
        context: {
          tool: tool.name,
          issues: inputParse.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
      },
    );
  }
  const input = inputParse.data as TInput;

  // 2. Availability
  const availContext: AvailabilityContext = {
    accountId: ctx.accountId,
    userId: ctx.userId ?? null,
  };
  const resolvers = options.availability ?? defaultResolvers;
  const available = await isAvailable(tool, availContext, resolvers);
  if (!available) {
    await emitFailure(baseRecord(), startedAt, t0, "unavailable");
    throw new ToolError(
      "unavailable",
      `Tool "${tool.name}" is not available for this account`,
      { context: { tool: tool.name } },
    );
  }

  // 3. Idempotency key (consequential tools)
  let idempotencyKey: string | null = null;
  if (tool.isConsequential) {
    if (!tool.idempotencyKeyFrom) {
      // Should have been caught at registration; defensive double-check.
      await emitFailure(baseRecord(), startedAt, t0, "configuration_error");
      throw new ToolError(
        "configuration_error",
        `Consequential tool "${tool.name}" missing idempotencyKeyFrom`,
        { context: { tool: tool.name } },
      );
    }
    idempotencyKey = tool.idempotencyKeyFrom(input);
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      await emitFailure(baseRecord(), startedAt, t0, "configuration_error");
      throw new ToolError(
        "configuration_error",
        `Tool "${tool.name}" idempotencyKeyFrom must return a non-empty string`,
        { context: { tool: tool.name } },
      );
    }
  }

  // 4. Idempotency dedup
  if (idempotencyKey && options.idempotency) {
    const cached = await options.idempotency.findSuccessful({
      accountId: ctx.accountId,
      toolName: tool.name,
      idempotencyKey,
    });
    if (cached) {
      const outputParse = tool.outputSchema.safeParse(cached.output);
      if (outputParse.success) {
        // Log the dedup with metadata; status remains success
        const record = baseRecord();
        record.idempotencyKey = idempotencyKey;
        record.metadata = { ...record.metadata, idempotent_dedup: true };
        await emitSuccess(record, startedAt, t0);
        return outputParse.data as TOutput;
      }
      // Cached output failed validation; continue with a fresh execute
    }
  }

  // 5. Execute
  let output: TOutput;
  try {
    output = await tool.execute(input, ctx);
  } catch (e) {
    const errorClass = classifyExecutionError(e);
    await emitFailure(baseRecord(), startedAt, t0, errorClass, e, idempotencyKey);
    if (e instanceof ToolError) throw e;
    throw new ToolError(errorClass, errorMessageOf(e), {
      cause: e,
      context: { tool: tool.name },
    });
  }

  // 6. Validate output
  const outputParse = tool.outputSchema.safeParse(output);
  if (!outputParse.success) {
    await emitFailure(
      baseRecord(),
      startedAt,
      t0,
      "invalid_output",
      outputParse.error,
      idempotencyKey,
    );
    throw new ToolError(
      "invalid_output",
      `Tool "${tool.name}" returned data that failed outputSchema`,
      {
        cause: outputParse.error,
        context: {
          tool: tool.name,
          issues: outputParse.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
      },
    );
  }

  // 7. Success log
  const record = baseRecord();
  record.idempotencyKey = idempotencyKey;
  await emitSuccess(record, startedAt, t0);
  return outputParse.data as TOutput;
}

function defaultAuthorityOutcome(
  tool: AgentTool<any, any>,
  options: ExecuteToolOptions,
): AuthorityOutcome | null {
  if (options.authorityOutcomeOverride !== undefined) {
    return options.authorityOutcomeOverride;
  }
  // F1 default: non-consequential tools are auto_threshold; consequential
  // ones leave it null so F2's Agent Runtime can fill it in.
  return tool.isConsequential ? null : "auto_threshold";
}

function classifyExecutionError(e: unknown): ToolErrorClass {
  if (e instanceof ToolError) return e.errorClass;
  if (e instanceof z.ZodError) return "invalid_output";
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  if (msg.includes("aborted")) return "aborted";
  if (msg.includes("timeout") || msg.includes("etimedout")) return "timeout";
  if (msg.includes("rate") && msg.includes("limit")) return "rate_limited";
  return "internal_error";
}

function errorMessageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function emitSuccess(
  record: Omit<ToolCallLogPayload, "status" | "latencyMs" | "completedAt">,
  startedAt: Date,
  t0: number,
): Promise<void> {
  const completedAt = new Date();
  await emitToolCallLog({
    ...record,
    status: "success",
    latencyMs: Math.round(performance.now() - t0),
    completedAt: completedAt.toISOString(),
  });
}

async function emitFailure(
  record: Omit<ToolCallLogPayload, "status" | "latencyMs" | "completedAt">,
  startedAt: Date,
  t0: number,
  errorClass: ToolErrorClass,
  cause?: unknown,
  idempotencyKey?: string | null,
): Promise<void> {
  const completedAt = new Date();
  await emitToolCallLog({
    ...record,
    idempotencyKey: idempotencyKey ?? record.idempotencyKey ?? null,
    status: mapStatus(errorClass),
    errorClass,
    errorMessage: genericMessage(errorClass),
    latencyMs: Math.round(performance.now() - t0),
    completedAt: completedAt.toISOString(),
  });
  void cause; // intentionally discarded; raw cause does not enter the log
}

function mapStatus(c: ToolErrorClass): ToolCallLogPayload["status"] {
  switch (c) {
    case "denied_by_authority":
    case "unavailable":
      return "denied";
    case "queued_for_approval":
      return "queued_for_approval";
    default:
      return "error";
  }
}

function genericMessage(c: ToolErrorClass): string {
  return c; // categorical only; never raw upstream content
}
