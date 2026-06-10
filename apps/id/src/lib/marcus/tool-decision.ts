import "server-only";

import { z } from "zod";
import {
  buildCapabilityManifest,
  type AgentTool,
  type AvailabilityContext,
  getTool,
  ToolError,
} from "@kinetiks/tools";
import type { AgentRun } from "@kinetiks/runtime";
import { platformAvailabilityResolvers } from "@/lib/tools/availability";
import { captureException, captureMessage } from "@/lib/observability/sentry";
import type { PreAnalysisBrief } from "./types";
import type { ToolObservation } from "./pre-analysis";

/**
 * Marcus's tool-use turn — step 7.5 of the v2 pipeline.
 *
 *   Pre-analysis (step 7) -> THIS PASS -> Sonnet response (step 8)
 *
 * A Haiku call ranks the user question against the available tools
 * (with full descriptions, not just one-liners) and selects the tools
 * that would answer it — up to MAX_TOOL_FANOUT non-consequential read
 * tools when the question genuinely spans multiple data sources
 * ("did the pricing change move revenue for my best segment" needs
 * Stripe AND GA4), or exactly one tool otherwise. Selected tools run
 * through the Runtime (which writes a tool_calls row per invocation +
 * handles authority resolution), concurrently when there is more than
 * one, and each result is fed back to Sonnet via its own
 * [TOOL OBSERVATIONS] block in the brief.
 *
 * Why a pre-decided pattern, not a multi-turn Claude tool_use loop:
 *   - One Haiku decides + one Sonnet writes. Token budget bounded.
 *   - No risk of Sonnet hallucinating a tool name post-generation.
 *   - Consistent with v2's architecture: pre-analysis dictates downstream.
 *
 * Consequential tools never fan out. The rules are structural, enforced
 * here regardless of what the Haiku outputs:
 *   - A consequential tool is invoked only when it is the SOLE selection.
 *   - In a multi-selection, consequential entries are dropped (logged);
 *     only non-consequential reads run, capped at MAX_TOOL_FANOUT.
 *   - A multi-selection that is all-consequential collapses to its first
 *     entry, which then routes through authority resolution + the
 *     per-action approval gate like any single consequential call.
 */

/** Hard cap on concurrent read-tool invocations per Marcus turn. */
export const MAX_TOOL_FANOUT = 3;

/**
 * Prompt-facing message for a tool that failed at runtime. The raw
 * exception goes to Sentry only — never into the synthesis brief,
 * where Sonnet could echo internal or upstream error text to the
 * customer.
 */
export const GENERIC_TOOL_RUNTIME_ERROR =
  "This tool failed to run. Treat this source as unavailable for this turn.";

// ─── Zod schemas ──────────────────────────────────────────

const ToolSelectionSchema = z.object({
  tool_name: z.string().min(1),
  input: z.unknown().nullable(),
  reason: z.string().min(1).max(500),
});

export type ToolSelection = z.infer<typeof ToolSelectionSchema>;

const MultiToolDecisionSchema = z.object({
  selections: z.array(ToolSelectionSchema).max(12),
  reason: z.string().min(1).max(500).optional(),
});

/**
 * The legacy single-tool shape ({ tool_name, input, reason }) the D1
 * router emitted. Haiku occasionally regresses to familiar shapes, so
 * the parser accepts it and normalizes rather than dropping the turn.
 */
const LegacyToolDecisionSchema = z.object({
  tool_name: z.string().nullable(),
  input: z.unknown().nullable(),
  reason: z.string().min(1).max(500),
});

/** Normalized decision: what the router chose, for telemetry + tests. */
export interface ToolDecision {
  selections: ToolSelection[];
  reason: string;
}

// ─── Public API ───────────────────────────────────────────

export interface DecideAndInvokeToolInput {
  /** The user's original message. */
  userMessage: string;
  /** Intent classifier output ('question' | 'action' | ... etc). */
  intent: string;
  /** Pre-analysis brief — supplies hints about what's known/missing. */
  brief: PreAnalysisBrief;
  /** Account scope; used for per-account availability resolution. */
  accountId: string;
  /** The Marcus turn's AgentRun — provides the invokeTool seam. */
  agentRun: AgentRun;
  /** Caller-supplied Haiku invoker, already tagged with task=marcus.tool_decision. */
  haikuCaller: (prompt: string) => Promise<{ content: Array<{ text: string }> }>;
}

export interface DecideAndInvokeToolResult {
  /**
   * One observation per invoked tool, in selection order. Empty when no
   * tool was used. Each failed invocation surfaces as a discriminated
   * error/queued/denied output inside its observation — a single tool's
   * failure never drops the other tools' evidence.
   */
  observations: ToolObservation[];
  /** Normalized decision the Haiku made; useful for telemetry. */
  decision: ToolDecision;
}

interface ResolvedSelection {
  selection: ToolSelection;
  tool: AgentTool<unknown, unknown>;
  input: unknown;
}

/**
 * Run the tool-decision pass and (if tools were selected) invoke them via
 * the AgentRun — concurrently when more than one read tool was selected.
 * Returns ToolObservations suitable for re-rendering the brief for
 * Sonnet. Never throws on tool-side failures — those surface as
 * discriminated outputs that Sonnet can hedge over.
 */
export async function decideAndInvokeTool(
  input: DecideAndInvokeToolInput
): Promise<DecideAndInvokeToolResult> {
  const availabilityCtx: AvailabilityContext = { accountId: input.accountId };

  // An availability-resolver failure degrades to a skipped tool turn —
  // the same graceful path as a parse failure — never an aborted
  // Marcus turn.
  let manifest;
  try {
    manifest = await buildCapabilityManifest(
      availabilityCtx,
      platformAvailabilityResolvers
    );
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "marcus_tool_decision",
        action: "tool_decision.manifest",
        stage: "resolve",
        app: "id",
      },
      user: { id: input.accountId },
      extra: {},
    });
    return {
      observations: [],
      decision: {
        selections: [],
        reason: "capability manifest unavailable",
      },
    };
  }

  if (manifest.tools.length === 0) {
    return {
      observations: [],
      decision: {
        selections: [],
        reason: "no tools registered for this account",
      },
    };
  }

  const prompt = buildToolDecisionPrompt(
    input.userMessage,
    input.intent,
    input.brief,
    manifest.tools.map((t) => ({
      name: t.name,
      description: t.description,
      isConsequential: t.isConsequential,
    }))
  );

  let decision: ToolDecision;
  try {
    const haiku = await input.haikuCaller(prompt);
    const raw = haiku.content?.[0]?.text ?? "{}";
    const parsed: unknown = JSON.parse(raw.replace(/```json\s*|```/g, "").trim());
    decision = normalizeDecision(parsed);
  } catch (err) {
    // Parse failure skips the tool turn; Sonnet answers from the brief.
    await captureException(err, {
      tags: {
        route: "marcus_tool_decision",
        action: "tool_decision.parse",
        stage: "parse",
        app: "id",
      },
      user: { id: input.accountId },
      extra: {},
    });
    return {
      observations: [],
      decision: {
        selections: [],
        reason: "tool-decision parse failed",
      },
    };
  }

  if (decision.selections.length === 0) {
    return { observations: [], decision };
  }

  // Resolve each selection against the platform registry and validate
  // its proposed input. Invalid selections are dropped individually — a
  // Haiku-hallucinated tool name or malformed input must skip cleanly
  // without taking the rest of the fan-out down with it.
  const resolved: ResolvedSelection[] = [];
  const seen = new Set<string>();
  for (const selection of decision.selections) {
    // getTool returns undefined (it does not throw) for an unknown name.
    const tool = getTool(selection.tool_name) as
      | AgentTool<unknown, unknown>
      | undefined;
    if (!tool) {
      void captureMessage("tool-decision: Haiku selected an unregistered tool", {
        tags: {
          route: "marcus_tool_decision",
          action: "tool_decision.resolve",
          stage: "validate",
          app: "id",
        },
        user: { id: input.accountId },
        extra: { tool_name: selection.tool_name },
      });
      continue;
    }

    const inputParse = tool.inputSchema.safeParse(selection.input);
    if (!inputParse.success) {
      void captureMessage("tool-decision: Haiku produced schema-invalid tool input", {
        tags: {
          route: "marcus_tool_decision",
          action: "tool_decision.resolve",
          stage: "validate",
          app: "id",
        },
        user: { id: input.accountId },
        extra: { tool_name: selection.tool_name },
      });
      continue;
    }

    // Dedupe exact repeats. The same tool MAY appear twice with different
    // inputs (two GA4 metrics is legitimate fan-out); an identical
    // (tool, input) pair is a wasted invocation.
    const key = `${selection.tool_name}::${JSON.stringify(inputParse.data) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    resolved.push({ selection, tool, input: inputParse.data });
  }

  if (resolved.length === 0) {
    return { observations: [], decision };
  }

  const toInvoke = applyFanoutRules(resolved, input.accountId);

  // Invoke concurrently. Each invocation maps its own failure to a
  // discriminated observation, so Promise.all never rejects and one
  // tool's failure cannot drop another tool's evidence.
  const observations = await Promise.all(
    toInvoke.map((r) => invokeSelection(input.agentRun, r, input.accountId))
  );

  return { observations, decision };
}

/**
 * Structural fan-out rules (see module doc). Applied AFTER resolution
 * and validation so the rules operate on tools we can actually invoke.
 * Rule enforcement is expected behavior, not an error — it reports via
 * captureMessage as a prompt-compliance signal.
 */
function applyFanoutRules(
  resolved: ResolvedSelection[],
  accountId: string
): ResolvedSelection[] {
  const ruleNotice = (message: string, droppedTools: string[]) => {
    void captureMessage(message, {
      tags: {
        route: "marcus_tool_decision",
        action: "tool_decision.fanout_rules",
        stage: "validate",
        app: "id",
      },
      user: { id: accountId },
      extra: { tool_names: droppedTools },
    });
  };

  if (resolved.length === 1) {
    // Single selection — read or consequential — invokes as-is. A
    // consequential tool here still routes through authority resolution
    // and the per-action approval gate inside the Runtime.
    return resolved;
  }

  const reads = resolved.filter((r) => !r.tool.isConsequential);
  const consequential = resolved.filter((r) => r.tool.isConsequential);

  if (reads.length > 0) {
    if (consequential.length > 0) {
      ruleNotice(
        "tool-decision: dropped consequential tool(s) from multi-selection (consequential tools never fan out)",
        consequential.map((r) => r.tool.name)
      );
    }
    if (reads.length > MAX_TOOL_FANOUT) {
      ruleNotice(
        "tool-decision: capped read fan-out at MAX_TOOL_FANOUT",
        reads.slice(MAX_TOOL_FANOUT).map((r) => r.tool.name)
      );
    }
    return reads.slice(0, MAX_TOOL_FANOUT);
  }

  // All-consequential multi-selection: collapse to the first. It runs
  // single + gated like any consequential call.
  ruleNotice(
    "tool-decision: all-consequential multi-selection collapsed to its first entry",
    consequential.slice(1).map((r) => r.tool.name)
  );
  return consequential.slice(0, 1);
}

/**
 * Invoke one resolved selection through the AgentRun, mapping every
 * failure class to a truthful observation Sonnet can hedge over.
 */
async function invokeSelection(
  agentRun: AgentRun,
  { selection, tool, input }: ResolvedSelection,
  accountId: string
): Promise<ToolObservation> {
  let output: unknown;
  try {
    output = await agentRun.invokeTool(tool, input);
  } catch (err) {
    if (err instanceof ToolError && err.errorClass === "queued_for_approval") {
      // A consequential action with no covering grant was queued for the
      // customer's approval. Surface a truthful observation — Sonnet must
      // say it is queued and has NOT run, never imply it happened.
      output = {
        status: "queued_for_approval",
        message:
          "This action was queued for the customer's approval and has not run yet.",
      };
    } else if (
      err instanceof ToolError &&
      err.errorClass === "denied_by_authority"
    ) {
      output = {
        status: "denied",
        message:
          "This action was denied by the customer's authority settings and did not run.",
      };
    } else {
      // Runtime threw for another reason (timeout, internal error).
      // The raw exception goes to Sentry; the prompt-facing observation
      // carries only the generic constant so internal/upstream error
      // text can never surface through Sonnet's response.
      await captureException(err, {
        tags: {
          route: "marcus_tool_decision",
          action: "tool_decision.invoke",
          stage: "execute",
          app: "id",
        },
        user: { id: accountId },
        extra: { tool_name: tool.name },
      });
      output = {
        status: "error",
        error_class: "runtime_failure",
        message: GENERIC_TOOL_RUNTIME_ERROR,
      };
    }
  }

  return {
    tool_name: selection.tool_name,
    reason: selection.reason,
    output,
  };
}

/**
 * Accept both the fan-out shape ({ selections: [...] }) and the legacy
 * single-tool shape ({ tool_name, input, reason }), normalizing to
 * ToolDecision. Throws when neither parses — caller maps that to a
 * skipped tool turn.
 */
function normalizeDecision(parsed: unknown): ToolDecision {
  if (parsed && typeof parsed === "object" && "selections" in parsed) {
    const multi = MultiToolDecisionSchema.parse(parsed);
    return {
      selections: multi.selections,
      reason: multi.reason ?? summarizeSelections(multi.selections),
    };
  }

  const legacy = LegacyToolDecisionSchema.parse(parsed);
  if (!legacy.tool_name) {
    return { selections: [], reason: legacy.reason };
  }
  return {
    selections: [
      {
        tool_name: legacy.tool_name,
        input: legacy.input,
        reason: legacy.reason,
      },
    ],
    reason: legacy.reason,
  };
}

function summarizeSelections(selections: ToolSelection[]): string {
  if (selections.length === 0) return "no tool selected";
  return `selected ${selections.map((s) => s.tool_name).join(", ")}`;
}

// ─── Prompt construction ──────────────────────────────────

interface ToolForPrompt {
  name: string;
  description: string;
  isConsequential: boolean;
}

function buildToolDecisionPrompt(
  userMessage: string,
  intent: string,
  brief: PreAnalysisBrief,
  tools: ToolForPrompt[]
): string {
  const toolList = tools
    .map((t) => {
      const flag = t.isConsequential ? " [consequential]" : "";
      return `- ${t.name}${flag}\n  ${t.description}`;
    })
    .join("\n");

  const evidenceSummary =
    brief.available_evidence.length > 0
      ? brief.available_evidence
          .slice(0, 5)
          .map((e) => `${e.label}=${e.value}`)
          .join(", ")
      : "none";

  return `You are the tool router for Marcus, a GTM operations assistant.

Decide which of the registered tools, if any, would directly answer the user's question. Most questions need zero or one tool. When the question genuinely spans multiple data sources (for example revenue AND traffic, or search AND ads), select up to ${MAX_TOOL_FANOUT} read tools - their results will be combined into one answer.

Rules:
- Only select a tool when its description clearly matches what the user asked.
- Never invent tools or input fields the tool's description does not mention.
- Select more than one tool ONLY when no single source can answer the question. Each selected tool must contribute evidence the others cannot.
- The same tool may appear twice only with clearly different inputs (for example two different metrics).
- Tools marked [consequential] change external state. Select a consequential tool ONLY when the user explicitly requested that action, and always ALONE - never alongside any other selection.
- If you are unsure, select nothing. False positives are worse than false negatives.

Available tools:
${toolList}

User intent: ${intent}
Evidence already available: ${evidenceSummary}

User message:
"""
${userMessage}
"""

Respond with JSON only (no commentary, no code fences):
{
  "selections": [
    { "tool_name": "<tool name>", "input": <valid input matching that tool's schema>, "reason": "<one short sentence explaining the choice>" }
  ],
  "reason": "<one short sentence summarizing the routing decision>"
}

If no tool fits, respond with: { "selections": [], "reason": "<one short sentence explaining why>" }`;
}
