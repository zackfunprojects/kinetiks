import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { routeAskClaude } from "@kinetiks/ai";
import { registerKinetiksPromptTasks } from "@/lib/ai/task-registry";
import { LAYER_DISPLAY_NAMES } from "@/lib/utils/layer-display";
import type { ContextLayer } from "@kinetiks/types";

const VALID_LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

/**
 * GET /api/context/[layer]/reflection
 * Returns one plain-language sentence reflecting what the system understands
 * about the business from this Context layer ("KIT KNOWS THIS"). On-demand
 * (the UI calls this on a button press) so there's no auto-cost per page view.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ layer: string }> }) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const { layer } = await params;
  if (!VALID_LAYERS.includes(layer as ContextLayer)) {
    return apiError("Unknown layer", 400);
  }
  const typedLayer = layer as ContextLayer;

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from(`kinetiks_context_${typedLayer}`)
    .select("data")
    .eq("account_id", auth.account_id)
    .maybeSingle();

  if (readError) return apiError("We couldn't read that layer.", 500);

  const data = (row?.data ?? null) as Record<string, unknown> | null;
  if (!data || Object.keys(data).length === 0) {
    return apiSuccess({ reflection: null });
  }

  registerKinetiksPromptTasks();

  // The Context layers hold the customer's own business identity (not
  // third-party contact PII). Cap the payload so the prompt stays bounded.
  // It's prompt context (never parsed), so mark truncation rather than
  // emit a silently-malformed JSON fragment.
  const fullJson = JSON.stringify(data);
  const summary = fullJson.length > 1800 ? `${fullJson.slice(0, 1800)} …(truncated)` : fullJson;
  const layerName = LAYER_DISPLAY_NAMES[typedLayer];
  const system =
    `You are the user's GTM system reflecting on what you know about their business. ` +
    `Read the ${layerName} layer and reply with ONE plain, declarative sentence summarizing ` +
    `what you understand from it. Begin with "You". No preamble, no lists, no quotation marks, ` +
    `no em dashes. If the data is thin, say what little you can infer. Maximum 40 words.`;
  const prompt = `${layerName} layer data:\n${summary}`;

  try {
    const reflection = await routeAskClaude("cortex.layer_reflection", prompt, system, {
      context: { accountId: auth.account_id },
      maxTokens: 120,
    });
    return apiSuccess({ reflection: reflection.trim() });
  } catch {
    return apiError("We couldn't generate a reflection right now.", 503);
  }
}
