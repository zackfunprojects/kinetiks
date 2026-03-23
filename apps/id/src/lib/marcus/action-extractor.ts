import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractedAction,
  ExtractedProposal,
  ExtractedBrief,
  ExtractedFollowUp,
  ContextLayer,
} from "@kinetiks/types";
import { askClaude } from "@kinetiks/ai";
import {
  MARCUS_EXTRACTION_PROMPT,
  buildExtractionPrompt,
} from "@/lib/ai/prompts/marcus-extract";
import { evaluateProposal } from "@/lib/cortex/evaluate";

const VALID_LAYERS: ContextLayer[] = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
];

const VALID_APPS = ["dark_madder", "harvest", "hypothesis", "litmus"];

interface RawExtraction {
  proposals?: Array<{
    target_layer?: string;
    action?: string;
    confidence?: string;
    payload?: Record<string, unknown>;
    evidence_summary?: string;
  }>;
  briefs?: Array<{
    target_app?: string;
    content?: string;
  }>;
  follow_ups?: Array<{
    message?: string;
    delay_hours?: number;
  }>;
}

/**
 * Extract actionable intelligence from a conversation turn.
 * Uses Haiku for speed - this runs after every response.
 */
export async function extractActions(
  userMessage: string,
  marcusResponse: string,
  contextSummary: string
): Promise<ExtractedAction[]> {
  const prompt = buildExtractionPrompt(userMessage, marcusResponse, contextSummary);

  let result: string;
  try {
    result = await askClaude(prompt, {
      system: MARCUS_EXTRACTION_PROMPT,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
    });
  } catch {
    return [];
  }

  // Parse JSON from response
  let raw: RawExtraction;
  try {
    // Strip any markdown code fences
    const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    raw = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const actions: ExtractedAction[] = [];

  // Validate proposals
  if (Array.isArray(raw.proposals)) {
    for (const p of raw.proposals) {
      if (
        p.target_layer &&
        VALID_LAYERS.includes(p.target_layer as ContextLayer) &&
        p.action &&
        ["add", "update", "escalate"].includes(p.action) &&
        p.confidence &&
        ["validated", "inferred", "speculative"].includes(p.confidence) &&
        p.payload &&
        Object.keys(p.payload).length > 0
      ) {
        actions.push({
          type: "proposal",
          target_layer: p.target_layer as ContextLayer,
          action: p.action as "add" | "update" | "escalate",
          confidence: p.confidence as "validated" | "inferred" | "speculative",
          payload: p.payload,
          evidence_summary: p.evidence_summary ?? "",
        } satisfies ExtractedProposal);
      }
    }
  }

  // Validate briefs
  if (Array.isArray(raw.briefs)) {
    for (const b of raw.briefs) {
      if (b.target_app && VALID_APPS.includes(b.target_app) && b.content) {
        actions.push({
          type: "brief",
          target_app: b.target_app,
          content: b.content,
        } satisfies ExtractedBrief);
      }
    }
  }

  // Validate follow-ups
  if (Array.isArray(raw.follow_ups)) {
    for (const f of raw.follow_ups) {
      if (f.message && typeof f.delay_hours === "number" && f.delay_hours > 0) {
        actions.push({
          type: "follow_up",
          message: f.message,
          delay_hours: Math.min(f.delay_hours, 720), // Cap at 30 days
        } satisfies ExtractedFollowUp);
      }
    }
  }

  return actions;
}

/**
 * Execute extracted actions:
 * - Proposals -> Cortex evaluation pipeline
 * - Briefs -> Routing events to app Synapses
 * - Follow-ups -> Scheduled in kinetiks_marcus_follow_ups
 *
 * Returns a disclosure string for the user.
 */
export async function executeActions(
  admin: SupabaseClient,
  accountId: string,
  actions: ExtractedAction[],
  threadId: string
): Promise<string> {
  if (actions.length === 0) return "";

  const disclosures: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "proposal": {
        // Insert proposal and evaluate
        const { data: proposal, error } = await admin
          .from("kinetiks_proposals")
          .insert({
            account_id: accountId,
            source_app: "kinetiks_id",
            source_operator: "marcus",
            target_layer: action.target_layer,
            action: action.action,
            confidence: action.confidence,
            payload: action.payload,
            evidence: [
              {
                type: "conversation",
                value: action.evidence_summary,
                context: `Extracted from Marcus conversation in thread ${threadId}`,
                date: new Date().toISOString(),
              },
            ],
          })
          .select("id")
          .single();

        if (!error && proposal) {
          // Evaluate through Cortex pipeline
          try {
            await evaluateProposal(admin, proposal.id);
          } catch {
            // Non-critical - proposal stays as submitted
          }
        }

        disclosures.push(
          `Updated ${action.target_layer} layer (${action.action}, ${action.confidence}): ${action.evidence_summary}`
        );
        break;
      }

      case "brief": {
        // Create routing event for the target app
        await admin.from("kinetiks_routing_events").insert({
          account_id: accountId,
          target_app: action.target_app,
          payload: {
            type: "marcus_brief",
            content: action.content,
            source: "marcus_conversation",
          },
          relevance_note: `Marcus brief: ${action.content.slice(0, 100)}`,
        });

        disclosures.push(
          `Queued brief for ${action.target_app}: ${action.content.slice(0, 80)}`
        );
        break;
      }

      case "follow_up": {
        const scheduledFor = new Date(
          Date.now() + action.delay_hours * 60 * 60 * 1000
        ).toISOString();

        await admin.from("kinetiks_marcus_follow_ups").insert({
          account_id: accountId,
          thread_id: threadId,
          message: action.message,
          scheduled_for: scheduledFor,
        });

        disclosures.push(
          `Scheduled follow-up in ${action.delay_hours}h: ${action.message.slice(0, 80)}`
        );
        break;
      }
    }
  }

  if (disclosures.length === 0) return "";

  // Update the latest Marcus message with extracted actions
  const { data: latestMsg } = await admin
    .from("kinetiks_marcus_messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("role", "marcus")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestMsg) {
    await admin
      .from("kinetiks_marcus_messages")
      .update({ extracted_actions: actions })
      .eq("id", latestMsg.id);
  }

  return `I noted ${disclosures.length} thing${disclosures.length > 1 ? "s" : ""} from that:\n${disclosures.map((d) => `- ${d}`).join("\n")}\nThese will update your Kinetiks ID. Anything I got wrong?`;
}
