import { describe, it, expect, vi } from 'vitest';
import { generateActions } from '../action-generator';
import type { DataAvailabilityManifest } from '../types';

const disconnectedManifest: DataAvailabilityManifest = {
  cortex_coverage: { overall_confidence: 67, layers: [] },
  connections: [
    { app_name: 'harvest', connected: false, synapse_healthy: false, last_sync: null, capabilities_available: ['create_sequence'], capabilities_broken: ['create_sequence'] },
  ],
  available_data: [],
  known_gaps: [],
  data_freshness: [],
};

const connectedManifest: DataAvailabilityManifest = {
  cortex_coverage: { overall_confidence: 67, layers: [] },
  connections: [
    { app_name: 'harvest', connected: true, synapse_healthy: true, last_sync: '2026-04-01', capabilities_available: ['create_sequence'], capabilities_broken: [] },
  ],
  available_data: [],
  known_gaps: [],
  data_freshness: [],
};

describe('generateActions', () => {
  it('converts brief actions to connection_needed when app is disconnected', async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: JSON.stringify({
        actions: [
          { type: 'brief', target_app: 'harvest', description: 'Build outbound sequence', payload: {} },
        ],
      })}],
    });

    const result = await generateActions(
      'help me book calls',
      'Start with LinkedIn outbound targeting seed founders.',
      disconnectedManifest,
      '',
      mockHaiku,
    );

    // Should have been converted to connection_needed
    expect(result.actions[0].type).toBe('connection_needed');
    expect(result.actions[0].requires_connection).toBe(true);
    expect(result.footer_text).toContain('Needs connection');
  });

  it('allows brief actions when app is connected', async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: JSON.stringify({
        actions: [
          { type: 'brief', target_app: 'harvest', description: 'Build outbound sequence', payload: {} },
        ],
      })}],
    });

    const result = await generateActions(
      'build me a sequence',
      'Here is the strategy for your outbound sequence.',
      connectedManifest,
      '',
      mockHaiku,
    );

    expect(result.actions[0].type).toBe('brief');
    expect(result.footer_text).toContain('Queued to harvest');
  });

  it('returns empty footer when no actions generated', async () => {
    const mockHaiku = vi.fn().mockResolvedValue({
      content: [{ text: '{"actions": []}' }],
    });

    const result = await generateActions('hi', 'Hello.', disconnectedManifest, '', mockHaiku);
    expect(result.actions).toHaveLength(0);
    expect(result.footer_text).toBe('');
  });
});
