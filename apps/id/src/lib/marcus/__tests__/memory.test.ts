import { describe, it, expect, vi } from 'vitest';
import { loadThreadMemories, formatMemoriesForContext } from '../memory';
import type { ThreadMemory } from '../types';

describe('loadThreadMemories', () => {
  it('returns active memories for a thread in ascending order', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'mem-2',
            thread_id: 'thread-1',
            memory_type: 'fact',
            content: 'User pricing is $15k per engagement',
            source_message_index: 2,
            confidence: 0.9,
            active: true,
            created_at: '2026-04-01T09:00:00Z',
          },
          {
            id: 'mem-1',
            thread_id: 'thread-1',
            memory_type: 'correction',
            content: 'User targets seed stage, NOT Series A/B',
            source_message_index: 4,
            confidence: 0.9,
            active: true,
            created_at: '2026-04-01T10:00:00Z',
          },
        ],
        error: null,
      }),
    };

    const memories = await loadThreadMemories('acct-1', 'thread-1', mockSupabase);
    expect(memories).toHaveLength(2);
    // Older memory first (ascending order)
    expect(memories[0].content).toBe('User pricing is $15k per engagement');
    expect(memories[1].content).toBe('User targets seed stage, NOT Series A/B');
    // Verify ordering clause
    expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns empty array on error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    };

    const memories = await loadThreadMemories('acct-1', 'thread-1', mockSupabase);
    expect(memories).toHaveLength(0);
  });
});

describe('formatMemoriesForContext', () => {
  it('formats memories with type labels', () => {
    const memories: ThreadMemory[] = [
      { id: '1', thread_id: 't', memory_type: 'correction', content: 'User targets seed stage, NOT Series A/B', source_message_index: 4, confidence: 0.9, active: true, created_at: '' },
      { id: '2', thread_id: 't', memory_type: 'decision', content: 'User targeting 3 qualified calls per week', source_message_index: 5, confidence: 0.9, active: true, created_at: '' },
    ];

    const result = formatMemoriesForContext(memories);
    expect(result).toContain('[CORRECTION]');
    expect(result).toContain('[DECISION]');
    expect(result).toContain('seed stage');
    expect(result).toContain('3 qualified calls');
  });

  it('returns placeholder when no memories exist', () => {
    const result = formatMemoriesForContext([]);
    expect(result).toContain('No prior decisions');
  });
});
