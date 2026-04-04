import { describe, it, expect, vi } from 'vitest';
import { buildPreAnalysisBrief } from '../pre-analysis';
import type { DataAvailabilityManifest, ThreadMemory } from '../types';

const manifest: DataAvailabilityManifest = {
  cortex_coverage: {
    overall_confidence: 67,
    layers: [
      { layer_name: 'voice', confidence: 69, has_data: true, field_count: 7, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
      { layer_name: 'competitive', confidence: 97, has_data: true, field_count: 11, total_fields: 12, last_updated: '2026-04-01', source: 'mixed' },
      { layer_name: 'content', confidence: 10, has_data: false, field_count: 1, total_fields: 8, last_updated: null, source: 'empty' },
    ],
  },
  connections: [
    { app_name: 'harvest', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: ['create_sequence'], capabilities_broken: ['create_sequence'] },
  ],
  available_data: [],
  known_gaps: [
    { category: 'outbound', what_is_missing: 'No outbound data (Harvest not connected)', why_it_matters: 'Cannot assess pipeline', how_to_fill: 'Connect Harvest' },
  ],
  data_freshness: [],
};

const memories: ThreadMemory[] = [
  { id: '1', thread_id: 't', memory_type: 'correction', content: 'User targets seed stage, NOT Series A/B', source_message_index: 4, confidence: 0.9, active: true, created_at: '' },
  { id: '2', thread_id: 't', memory_type: 'fact', content: 'User pricing is $15k', source_message_index: 2, confidence: 0.9, active: true, created_at: '' },
];

describe('buildPreAnalysisBrief', () => {
  it('produces a valid brief from Haiku response', async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: JSON.stringify({
        available_evidence: [
          { label: 'competitive', value: '97%', citation: 'Competitive layer at 97% confidence' },
        ],
        not_available: ['Pipeline data', 'Close rate history'],
        memory_facts: ['User targets seed stage, NOT Series A/B', 'User pricing is $15k'],
        response_shape: {
          max_sentences: 6,
          lead_with: 'Outbound strategy for seed-stage companies',
          must_flag: ['No pipeline data'],
          must_not: ['Promise Harvest actions', 'Recommend Series A/B targeting'],
        },
        action_availability: [
          { app_name: 'harvest', available: false, reason: 'Not connected' },
        ],
      })}],
    });

    const { brief, formatted } = await buildPreAnalysisBrief(
      'how should I grow this business',
      manifest,
      memories,
      'strategic',
      '',
      mockHaiku,
    );

    expect(brief.available_evidence).toHaveLength(1);
    expect(brief.not_available).toContain('Pipeline data');
    expect(brief.memory_facts).toContain('User targets seed stage, NOT Series A/B');
    expect(brief.response_shape.must_not).toContain('Promise Harvest actions');

    // Formatted brief should contain key constraints
    expect(formatted).toContain('EVIDENCE BRIEF');
    expect(formatted).toContain('Competitive layer at 97%');
    expect(formatted).toContain('seed stage');
    expect(formatted).toContain('Do NOT mention actions');
  });

  it('produces fallback brief when Haiku fails', async () => {
    const mockHaiku = vi.fn().mockRejectedValue(new Error('API timeout'));

    const { brief, formatted } = await buildPreAnalysisBrief(
      'how should I grow this business',
      manifest,
      memories,
      'strategic',
      '',
      mockHaiku,
    );

    // Fallback should still have evidence from manifest
    expect(brief.available_evidence.length).toBeGreaterThan(0);
    // Fallback should include memories
    expect(brief.memory_facts).toContain('User targets seed stage, NOT Series A/B');
    // Fallback should flag Harvest as unavailable
    expect(brief.response_shape.must_not.some((m) => m.includes('harvest') || m.includes('Harvest'))).toBe(true);
    // Formatted should still be usable
    expect(formatted).toContain('EVIDENCE BRIEF');
  });
});
