import type { DataAvailabilityManifest } from '../types';

/**
 * Prompt for Haiku to produce a structured pre-analysis brief.
 * This brief constrains what Sonnet can say in its response.
 *
 * KEY DESIGN PRINCIPLE: This prompt converts RULES into FACTS.
 * Instead of telling Sonnet "don't cite data you don't have" (a rule),
 * the brief tells Sonnet "here are the 3 data points you have" (a fact).
 * Models follow facts better than rules.
 */
export function buildPreAnalysisPrompt(
  userMessage: string,
  manifest: DataAvailabilityManifest,
  memoryFacts: string,
  intentType: string,
  recentMessages: string,
): string {
  // Build a compact manifest summary for Haiku
  const cortexSummary = manifest.cortex_coverage.layers
    .filter((l) => l.has_data)
    .map((l) => `${l.layer_name}: ${l.confidence}% confidence, ${l.field_count}/${l.total_fields} fields`)
    .join('\n');

  const emptyCortex = manifest.cortex_coverage.layers
    .filter((l) => !l.has_data || l.confidence < 30)
    .map((l) => `${l.layer_name}: ${l.has_data ? 'sparse' : 'empty'}`)
    .join(', ');

  const connectionSummary = manifest.connections
    .map((c) => `${c.app_name}: ${c.connected && c.synapse_healthy ? 'CONNECTED' : 'NOT CONNECTED'}`)
    .join('\n');

  const gaps = manifest.known_gaps
    .map((g) => g.what_is_missing)
    .join('\n');

  const maxSentences = intentType === 'data' ? 4
    : intentType === 'tactical' ? 6
    : intentType === 'command' ? 5
    : intentType === 'implicit_intel' ? 3
    : 7; // strategic and default

  return `You are building a response brief for a stoic GTM advisor. Your job is to PRE-COMPUTE what the advisor can and cannot say, so the advisor's response is correct on the first try.

## User's message:
"${userMessage}"

## Intent type: ${intentType}

## Recent conversation context:
${recentMessages || 'Start of conversation.'}

## Thread memory (corrections, decisions the user has made):
${memoryFacts}

## Available Cortex data:
Overall confidence: ${manifest.cortex_coverage.overall_confidence}%
${cortexSummary || 'No Cortex layers have data.'}

## Empty/sparse Cortex layers:
${emptyCortex || 'None - all layers have data.'}

## App connections:
${connectionSummary}

## Known data gaps:
${gaps || 'None identified.'}

## Available live data points:
${manifest.available_data.length > 0
  ? manifest.available_data.map((d) => `[${d.freshness}] ${d.description}${d.value_summary ? ': ' + d.value_summary : ''}`).join('\n')
  : 'No live data from any app.'}

## Your task:

Produce a JSON brief with these fields:

1. "available_evidence": Array of objects with {label, value, citation}. These are the SPECIFIC data points the advisor can cite. Only include data points that are RELEVANT to the user's question. Pull from Cortex layers, live data, and known facts. Each citation should be a short, quotable sentence.

2. "not_available": Array of strings. Things the advisor CANNOT speak to because the data doesn't exist. Be specific: "Close rate history (no deal tracking connected)" not just "some metrics".

3. "memory_facts": Array of strings. Pull from the thread memory above. Include ALL corrections and decisions. These MUST be honored in the response.

4. "response_shape": Object with:
   - "max_sentences": ${maxSentences}
   - "lead_with": What the first sentence should address (the core answer to the question)
   - "must_flag": Array of strings - gaps the advisor must mention because they're relevant to the question
   - "must_not": Array of strings - specific things the advisor must NOT do (based on disconnected apps, prior corrections, etc.)

5. "action_availability": Array of objects with {app_name, available (boolean), reason}. Which apps can receive actions and which can't.

Respond with ONLY valid JSON, no markdown fences.`;
}
