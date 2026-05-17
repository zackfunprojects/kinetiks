import "server-only";

import { z } from "zod";
import {
  buildCapabilityManifest,
  type AgentTool,
  type AvailabilityContext,
  getTool,
} from "@kinetiks/tools";
import type { AgentRun } from "@kinetiks/runtime";
import { platformAvailabilityResolvers } from "@/lib/tools/availability";
import type { PreAnalysisBrief } from "./types";
import type { ToolObservation } from "./pre-analysis";

/**
 * Marcus's tool-use turn — step 7.5 of the v2 pipeline.
 *
 *   Pre-analysis (step 7) -> THIS PASS -> Sonnet response (step 8)
 *
 * A Haiku call ranks the user question against the available tools
 * (with full descriptions, not just one-liners) and decides whether any
 * single tool would answer it. If yes, the tool runs through the
 * Runtime (which writes a tool_calls row + handles authority resolution),
 * and the result is fed back to Sonnet via the brief's
 * [TOOL OBSERVATIONS] section.
 *
 * Why a pre-decided pattern, not a multi-turn Claude tool_use loop:
 *   - One Haiku decides + one Sonnet writes. Token budget bounded.
 *   - No risk of Sonnet hallucinating a tool name post-generation.
 *   - Consistent with v2's architecture: pre-analysis dictates downstream.
 *
 * D3 will add multi-tool fanout when GSC + Stripe land and Marcus needs
 * to compose answers from multiple data sources.
 */

// ─── Zod schemas ──────────────────────────────────────────

const ToolDecisionRaw = z.object({
  tool_name: z.string().nullable(),
  input: z.unknown().nullable(),
  reason: z.string().min(1).max(500),
});

export type ToolDecisionRaw = z.infer<typeof ToolDecisionRaw>;

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
  /** The tool result (whatever shape the tool returned). Null when no tool was used. */
  observation: ToolObservation | null;
  /** Raw decision the Haiku made; useful for telemetry. */
  decision: ToolDecisionRaw;
}

/**
 * Run the tool-decision pass and (if a tool was selected) invoke it via
 * the AgentRun. Returns a ToolObservation suitable for re-rendering the
 * brief for Sonnet. Never throws on tool-side failures — those surface
 * as a discriminated output that Sonnet can hedge over.
 */
export async function decideAndInvokeTool(
  input: DecideAndInvokeToolInput
): Promise<DecideAndInvokeToolResult> {
  const availabilityCtx: AvailabilityContext = { accountId: input.accountId };
  const manifest = await buildCapabilityManifest(
    availabilityCtx,
    platformAvailabilityResolvers
  );

  if (manifest.tools.length === 0) {
    return {
      observation: null,
      decision: {
        tool_name: null,
        input: null,
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

  let decision: ToolDecisionRaw;
  try {
    const haiku = await input.haikuCaller(prompt);
    const raw = haiku.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json\s*|```/g, "").trim());
    decision = ToolDecisionRaw.parse(parsed);
  } catch (err) {
    console.error(
      `[tool-decision] parse failed; skipping tool turn: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return {
      observation: null,
      decision: {
        tool_name: null,
        input: null,
        reason: "tool-decision parse failed",
      },
    };
  }

  if (!decision.tool_name) {
    return { observation: null, decision };
  }

  // Resolve the tool from the platform registry. Not via the manifest's
  // descriptor — we need the AgentTool with .execute + schemas.
  let tool: AgentTool<unknown, unknown>;
  try {
    tool = getTool(decision.tool_name) as AgentTool<unknown, unknown>;
  } catch {
    console.error(
      `[tool-decision] Haiku named an unknown tool '${decision.tool_name}'`
    );
    return {
      observation: null,
      decision: { ...decision, tool_name: null, input: null },
    };
  }

  // Validate the proposed input against the tool's Zod schema. Reject on
  // failure rather than risk the Runtime throwing a less-explainable error.
  const inputParse = tool.inputSchema.safeParse(decision.input);
  if (!inputParse.success) {
    console.error(
      `[tool-decision] Haiku produced invalid input for ${decision.tool_name}: ${inputParse.error.message}`
    );
    return {
      observation: null,
      decision: { ...decision, tool_name: null, input: null },
    };
  }

  let output: unknown;
  try {
    output = await input.agentRun.invokeTool(tool, inputParse.data);
  } catch (err) {
    // Runtime threw — tool execution failed beyond what its discriminated
    // output covers (e.g. authority denial, timeout). Surface as an
    // observation Sonnet can hedge over.
    output = {
      status: "error",
      error_class: "runtime_failure",
      message:
        err instanceof Error ? err.message : "Unknown runtime failure.",
    };
  }

  return {
    observation: {
      tool_name: decision.tool_name,
      reason: decision.reason,
      output,
    },
    decision,
  };
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

Decide whether any of the registered tools would directly answer the user's question. If yes, output the tool name and a JSON input that matches its declared schema. If no tool fits, return tool_name: null.

Rules:
- Only call a tool when its description clearly matches what the user asked.
- Never invent tools or input fields the tool's description does not mention.
- For consequential tools, do not invoke unless the user explicitly requested action.
- If you are unsure, return tool_name: null. False positives are worse than false negatives.
- One tool call max. Pick the single best match.

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
  "tool_name": "<tool name or null>",
  "input": <valid input matching the tool's schema, or null>,
  "reason": "<one short sentence explaining the choice>"
}`;
}
