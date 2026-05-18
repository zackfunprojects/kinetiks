import type { DataAvailabilityManifest, PreAnalysisBrief, ThreadMemory } from './types';
import { buildPreAnalysisPrompt } from './prompts/marcus-brief';
import { formatMemoriesForContext } from './memory';

/**
 * Result of step 7.5's tool invocation, to be rendered into the brief
 * adjacent to the user's question. The renderer truncates and structures
 * the payload so Sonnet can cite values verbatim without seeing raw API
 * shapes.
 */
export interface ToolObservation {
  tool_name: string;
  /** The reason the tool was selected (from the tool-decision Haiku). */
  reason: string;
  /** The structured tool output. Stringified for the prompt; never PII. */
  output: unknown;
}

function formatToolObservations(obs: ToolObservation): string {
  const json = JSON.stringify(obs.output, null, 2);
  // Cap injected size so a runaway tool output cannot blow the context.
  const TRUNCATE = 1800;
  const truncated =
    json.length > TRUNCATE ? `${json.slice(0, TRUNCATE)}\n... [output truncated]` : json;
  return `Reason for selecting this tool: ${obs.reason}\n\n${truncated}`;
}

/**
 * Run Haiku pre-analysis to produce a structured brief.
 * This brief constrains what Sonnet can say in its response.
 *
 * Returns the brief as structured data AND as a formatted string
 * ready to inject into the Sonnet user message.
 */
export async function buildPreAnalysisBrief(
  userMessage: string,
  manifest: DataAvailabilityManifest,
  memories: ThreadMemory[],
  intentType: string,
  recentMessages: string,
  claudeHaiku: (prompt: string) => Promise<any>,
  toolInventory?: string,
  recentInsights?: import('./types').InsightForBrief[],
  recentPatterns?: import('./types').PatternForBrief[],
): Promise<{ brief: PreAnalysisBrief; formatted: string }> {
  const memoryFacts = formatMemoriesForContext(memories);

  const prompt = buildPreAnalysisPrompt(
    userMessage,
    manifest,
    memoryFacts,
    intentType,
    recentMessages,
  );

  console.log('[BRIEF] data density:', manifest.cortex_coverage.overall_confidence < 30 ? 'SPARSE' : 'SUFFICIENT');

  try {
    const result = await claudeHaiku(prompt);
    const responseText = result.content?.[0]?.text ?? '{}';
    console.log('[BRIEF] raw Haiku response:', responseText.slice(0, 500));
    const brief: PreAnalysisBrief = JSON.parse(
      responseText.replace(/```json\s*|```/g, '').trim()
    );

    // Validate the brief has required fields
    if (!brief.available_evidence) brief.available_evidence = [];
    if (!brief.not_available) brief.not_available = [];
    if (!brief.memory_facts) brief.memory_facts = [];
    if (!brief.response_shape) {
      brief.response_shape = {
        max_sentences: 6,
        lead_with: 'Answer the question directly',
        must_flag: [],
        must_not: [],
      };
    }
    if (!brief.action_availability) brief.action_availability = [];
    if (recentInsights && recentInsights.length > 0) {
      brief.recent_insights = recentInsights;
    }
    if (recentPatterns && recentPatterns.length > 0) {
      brief.recent_patterns = recentPatterns;
    }

    const formatted = formatBriefForSonnet(brief, toolInventory);
    return { brief, formatted };
  } catch (error) {
    console.error('Pre-analysis brief generation failed', error);
    // Return a minimal brief that forces honest, constrained responses
    const fallbackBrief: PreAnalysisBrief = {
      available_evidence: manifest.cortex_coverage.layers
        .filter((l) => l.has_data && l.confidence > 30)
        .map((l) => ({
          label: `${l.layer_name}_confidence`,
          value: `${l.confidence}%`,
          citation: `${l.layer_name} layer at ${l.confidence}% confidence`,
        })),
      not_available: manifest.known_gaps.map((g) => g.what_is_missing),
      memory_facts: memories.map((m) => m.content),
      response_shape: {
        max_sentences: 6,
        lead_with: 'Answer directly with available data',
        must_flag: manifest.known_gaps.slice(0, 3).map((g) => g.what_is_missing),
        must_not: manifest.connections
          .filter((c) => !c.connected)
          .map((c) => `Promise actions through ${c.app_name} (not connected)`),
      },
      action_availability: manifest.connections.map((c) => ({
        app_name: c.app_name,
        available: c.connected && c.synapse_healthy,
        reason: c.connected && c.synapse_healthy
          ? 'Connected and healthy'
          : c.connected ? 'Connected but unhealthy' : 'Not connected',
      })),
    };
    return { brief: fallbackBrief, formatted: formatBriefForSonnet(fallbackBrief, toolInventory) };
  }
}

/**
 * Format the brief as a string to inject into the Sonnet user message.
 * This sits DIRECTLY ADJACENT to the user's question in the prompt.
 *
 * Exported so engine.ts can re-render the brief AFTER the tool-decision
 * pass (step 7.5), injecting [TOOL OBSERVATIONS] when a tool was invoked.
 */
export function formatBriefForSonnet(
  brief: PreAnalysisBrief,
  toolInventory?: string,
  toolObservations?: ToolObservation | null,
): string {
  const evidence = brief.available_evidence.length > 0
    ? brief.available_evidence.map((e) => `- ${e.citation}`).join('\n')
    : '- No specific data points available. Flag this in your response.';

  const notAvailable = brief.not_available.length > 0
    ? brief.not_available.map((n) => `- ${n}`).join('\n')
    : '- No significant gaps identified.';

  const memory = brief.memory_facts.length > 0
    ? brief.memory_facts.map((m) => `- ${m}`).join('\n')
    : '- No prior corrections or decisions.';

  const mustNot = brief.response_shape.must_not.length > 0
    ? brief.response_shape.must_not.map((m) => `- ${m}`).join('\n')
    : '- No specific prohibitions.';

  const mustFlag = brief.response_shape.must_flag.length > 0
    ? brief.response_shape.must_flag.map((m) => `- ${m}`).join('\n')
    : '';

  const platformBlock = toolInventory
    ? `\n\n[PLATFORM CAPABILITIES - the canonical inventory; reference these by name, do not invent tools that are not listed]\n${toolInventory}`
    : '';

  const observationsBlock = toolObservations
    ? `\n\n[TOOL OBSERVATIONS - returned by ${toolObservations.tool_name}; cite ONLY the values below verbatim; do not extrapolate]\n${formatToolObservations(toolObservations)}`
    : '';

  // D2 Slice 11 — recent Oracle insights. Sonnet may cite by insight_id
  // (UUID); the engine post-processes the response to stamp delivered.
  const insightsBlock =
    brief.recent_insights && brief.recent_insights.length > 0
      ? `\n\n[RECENT INSIGHTS - undelivered, last 72h, severity ≥ notable; cite by insight_id (UUID), do not paraphrase severity or type. Use only when the user's question makes this evidence relevant.]\n${brief.recent_insights
          .map(
            (i) =>
              `- [insight_id=${i.insight_id}] [severity=${i.severity}] [type=${i.type}] [source_app=${i.source_app}] ${i.summary}`,
          )
          .join('\n')}`
      : '';

  // L1a (Kinetiks Contract Addendum §1.10) — high-confidence patterns the system has
  // observed about this customer's business. EVIDENCE, not statistics:
  // weave the implication into the response. The response body never
  // dumps raw pattern fingerprints, dimension blobs, or metric tables.
  // Cite by pattern_id when referencing.
  const patternsBlock =
    brief.recent_patterns && brief.recent_patterns.length > 0
      ? `\n\n[RELEVANT PATTERNS - empirically validated signatures observed for THIS account; treat as evidence to weave into the recommendation's implication, NOT as statistics to recite. Do not paste raw dimension blobs or metric tables in your response. Cite by pattern_id when relevant.]\n${brief.recent_patterns
          .map(
            (p) =>
              `- [pattern_id=${p.pattern_id}] [${p.status}] [source_app=${p.source_app}] ${p.summary}`,
          )
          .join('\n')}`
      : '';

  return `[EVIDENCE BRIEF - use ONLY this evidence in your response]
Available data you CAN cite:
${evidence}

Data you DO NOT have (do not fabricate):
${notAvailable}

[CONVERSATION MEMORY - these are decisions/corrections from this thread, honor them]
${memory}${platformBlock}${observationsBlock}${insightsBlock}${patternsBlock}

[RESPONSE CONSTRAINTS]
- Maximum ${brief.response_shape.max_sentences} sentences
- Lead with: ${brief.response_shape.lead_with}
${mustFlag ? `- Must flag these gaps:\n${mustFlag}` : ''}
- Must NOT:
${mustNot}
- Do NOT mention actions you will take, things you will queue, or follow-ups you will schedule. Your job is strategic advice only. Actions are handled separately.`;
}
