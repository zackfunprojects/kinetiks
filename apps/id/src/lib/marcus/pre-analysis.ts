import type { DataAvailabilityManifest, PreAnalysisBrief, ThreadMemory } from './types';
import { buildPreAnalysisPrompt } from './prompts/marcus-brief';
import { formatMemoriesForContext } from './memory';

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

    const formatted = formatBriefForSonnet(brief);
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
    return { brief: fallbackBrief, formatted: formatBriefForSonnet(fallbackBrief) };
  }
}

/**
 * Format the brief as a string to inject into the Sonnet user message.
 * This sits DIRECTLY ADJACENT to the user's question in the prompt.
 */
function formatBriefForSonnet(brief: PreAnalysisBrief): string {
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

  return `[EVIDENCE BRIEF - use ONLY this evidence in your response]
Available data you CAN cite:
${evidence}

Data you DO NOT have (do not fabricate):
${notAvailable}

[CONVERSATION MEMORY - these are decisions/corrections from this thread, honor them]
${memory}

[RESPONSE CONSTRAINTS]
- Maximum ${brief.response_shape.max_sentences} sentences
- Lead with: ${brief.response_shape.lead_with}
${mustFlag ? `- Must flag these gaps:\n${mustFlag}` : ''}
- Must NOT:
${mustNot}
- Do NOT mention actions you will take, things you will queue, or follow-ups you will schedule. Your job is strategic advice only. Actions are handled separately.`;
}
