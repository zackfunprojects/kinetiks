import { createAdminClient } from "@/lib/supabase/admin";
import type { SynapseCapabilities, CapabilityDefinition } from "@kinetiks/synapse";

/**
 * Find matching capabilities for a parsed intent.
 * Scores each registered Synapse's capabilities against the intent.
 */
export async function findMatchingCapabilities(
  accountId: string,
  intent: ParsedCommandIntent
): Promise<CapabilityMatch[]> {
  const admin = createAdminClient();

  const { data: synapses } = await admin
    .from("kinetiks_synapses")
    .select("app_name, capabilities")
    .eq("account_id", accountId)
    .not("capabilities", "is", null);

  if (!synapses?.length) return [];

  const matches: CapabilityMatch[] = [];

  for (const synapse of synapses) {
    const capabilities = synapse.capabilities as SynapseCapabilities | null;
    if (!capabilities?.capabilities) continue;

    for (const cap of capabilities.capabilities) {
      const score = scoreCapability(cap, intent);
      if (score > 0.3) {
        matches.push({
          app_name: synapse.app_name,
          capability: cap,
          score,
        });
      }
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Score how well a capability matches an intent.
 */
function scoreCapability(
  cap: CapabilityDefinition,
  intent: ParsedCommandIntent
): number {
  let score = 0;

  // Type match (query/action/config)
  if (cap.type === intent.type) score += 0.4;

  // Name match - check if subject is in capability name
  if (intent.subject && cap.name.toLowerCase().includes(intent.subject.toLowerCase())) {
    score += 0.4;
  }

  // Description keyword match
  if (intent.keywords?.some((kw) => cap.description.toLowerCase().includes(kw.toLowerCase()))) {
    score += 0.2;
  }

  // Example match
  if (intent.raw_text && cap.examples.some((ex) =>
    ex.toLowerCase().includes(intent.subject?.toLowerCase() ?? "") ||
    intent.raw_text!.toLowerCase().includes(ex.toLowerCase().slice(0, 20))
  )) {
    score += 0.1;
  }

  return Math.min(score, 1);
}

export interface ParsedCommandIntent {
  type: "query" | "action" | "config";
  subject: string | null;
  keywords: string[];
  parameters: Record<string, unknown>;
  raw_text: string;
  confidence: number;
}

export interface CapabilityMatch {
  app_name: string;
  capability: CapabilityDefinition;
  score: number;
}
