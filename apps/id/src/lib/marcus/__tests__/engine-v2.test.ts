import { describe, it, expect, vi } from 'vitest';
import { buildPreAnalysisBrief } from '../pre-analysis';
import { generateActions } from '../action-generator';
import { assembleResponse } from '../response-assembler';
import { formatMemoriesForContext } from '../memory';
import type { DataAvailabilityManifest, ThreadMemory } from '../types';

/**
 * Integration tests that verify the new pipeline produces correct behavior
 * for the exact scenarios from the original bug report.
 */

const manifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      { layer_name: 'voice', confidence: 69, has_data: true, field_count: 7, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
      { layer_name: 'competitive', confidence: 97, has_data: true, field_count: 11, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
      { layer_name: 'customers', confidence: 45, has_data: true, field_count: 5, total_fields: 15, last_updated: '2026-04-01', source: 'ai_generated' },
    ],
  },
  connections: [
    { app_name: 'harvest', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: ['create_sequence'], capabilities_broken: ['create_sequence'] },
  ],
  available_data: [],
  known_gaps: [
    { category: 'outbound', what_is_missing: 'No outbound data (Harvest not connected)', why_it_matters: 'Cannot validate outbound assumptions', how_to_fill: 'Connect Harvest' },
  ],
  data_freshness: [],
};

const memories: ThreadMemory[] = [
  { id: '1', thread_id: 't', memory_type: 'correction', content: 'User targets seed stage companies, NOT Series A/B', source_message_index: 4, confidence: 0.9, active: true, created_at: '' },
  { id: '2', thread_id: 't', memory_type: 'fact', content: 'User pricing is $15k per engagement', source_message_index: 2, confidence: 0.9, active: true, created_at: '' },
  { id: '3', thread_id: 't', memory_type: 'decision', content: 'User targeting 3 qualified calls per week', source_message_index: 5, confidence: 0.9, active: true, created_at: '' },
];

describe('Pipeline V2 - Bug Report Scenarios', () => {
  it('pre-analysis brief includes seed stage correction', async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: JSON.stringify({
        available_evidence: [
          { label: 'competitive', value: '97%', citation: 'Competitive layer: 97% confidence' },
          { label: 'voice', value: '69%', citation: 'Voice layer: 69% confidence' },
        ],
        not_available: ['Pipeline data (Harvest not connected)', 'Close rate history', 'Outbound performance'],
        memory_facts: ['User targets seed stage companies, NOT Series A/B', 'User pricing is $15k', 'User targeting 3 calls/week'],
        response_shape: {
          max_sentences: 6,
          lead_with: 'Outbound strategy for booking calls',
          must_flag: ['No pipeline data', 'Cannot validate close rate'],
          must_not: ['Promise Harvest actions', 'Recommend Series A/B targeting', 'Call positioning sharp without data'],
        },
        action_availability: [{ app_name: 'harvest', available: false, reason: 'Not connected' }],
      })}],
    });

    const { brief, formatted } = await buildPreAnalysisBrief(
      'how should i grow this business, id like to get more sales calls on the books',
      manifest,
      memories,
      'strategic',
      '',
      mockHaiku,
    );

    // Brief must include the seed stage correction
    expect(brief.memory_facts).toContain('User targets seed stage companies, NOT Series A/B');
    // Brief must prohibit Series A/B targeting
    expect(brief.response_shape.must_not.some((m) => m.includes('Series A/B'))).toBe(true);
    // Brief must prohibit Harvest promises
    expect(brief.response_shape.must_not.some((m) => m.includes('Harvest'))).toBe(true);
    // Formatted brief must contain the constraint
    expect(formatted).toContain('seed stage');
    expect(formatted).toContain('Do NOT mention actions');
  });

  it('action generator converts Harvest brief to connection_needed', async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: JSON.stringify({
        actions: [
          { type: 'brief', target_app: 'harvest', description: 'Build outbound sequence for seed founders', payload: {} },
          { type: 'proposal', target_app: null, description: 'User wants to grow via outbound calls', payload: {} },
        ],
      })}],
    });

    const result = await generateActions(
      'help me get more calls',
      'Focus on LinkedIn outbound targeting seed founders.',
      manifest,
      '',
      mockHaiku,
    );

    // Harvest brief should be converted to connection_needed
    const harvestAction = result.actions.find((a) => a.description.includes('harvest') || a.description.includes('Harvest'));
    expect(harvestAction?.type).toBe('connection_needed');

    // Proposal should pass through unchanged
    const proposalAction = result.actions.find((a) => a.type === 'proposal');
    expect(proposalAction).toBeTruthy();

    // Footer should say "Needs connection" not "Queued to harvest"
    expect(result.footer_text).toContain('Needs connection');
    expect(result.footer_text).not.toContain('Queued to harvest');
    // Mixed actions: executable proposal + connection_needed, so mixed closing copy
    expect(result.footer_text).toContain('the rest need an app connection');
  });

  it('assembled response keeps advice and actions separate', () => {
    const responseText = 'Your competitive layer is at 97%. Focus on LinkedIn outbound targeting seed founders. I do not have pipeline data to validate conversion assumptions.';
    const actionResult = {
      actions: [
        { type: 'connection_needed' as const, target_app: null, description: 'Connect Harvest to build sequences', payload: {}, requires_connection: true },
      ],
      footer_text: '\n---\nI noted 1 thing from that:\n- Needs connection: Connect Harvest to build sequences\nThese will update your Kinetiks ID. Anything I got wrong?',
    };

    const final = assembleResponse(responseText, actionResult);

    // Response text should NOT contain "I've queued" or "I'll build"
    expect(final).not.toContain("I've queued");
    expect(final).not.toContain("I'll build");
    expect(final).not.toContain('I will queue');

    // Should have clear separation
    expect(final).toContain('---');
    expect(final).toContain('Needs connection');
  });

  it('memories format correctly for context injection', () => {
    const formatted = formatMemoriesForContext(memories);
    expect(formatted).toContain('[CORRECTION] User targets seed stage companies, NOT Series A/B');
    expect(formatted).toContain('[DECISION] User targeting 3 qualified calls per week');
    expect(formatted).toContain('[FACT] User pricing is $15k');
  });
});
