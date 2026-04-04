import { describe, it, expect } from 'vitest';
import { assembleResponse } from '../response-assembler';
import type { ActionGenerationResult } from '../types';

describe('assembleResponse', () => {
  it('combines response and footer', () => {
    const actionResult: ActionGenerationResult = {
      actions: [{ type: 'connection_needed', target_app: null, description: 'Connect Harvest', payload: {}, requires_connection: true }],
      footer_text: '\n---\nI noted 1 thing from that:\n- Needs connection: Connect Harvest\nThese will update your Kinetiks ID. Anything I got wrong?',
    };

    const result = assembleResponse('Start with LinkedIn outbound.', actionResult);
    expect(result).toContain('Start with LinkedIn outbound.');
    expect(result).toContain('---');
    expect(result).toContain('Needs connection');
  });

  it('returns only response when no actions', () => {
    const actionResult: ActionGenerationResult = { actions: [], footer_text: '' };
    const result = assembleResponse('Just a response.', actionResult);
    expect(result).toBe('Just a response.');
    expect(result).not.toContain('---');
  });
});
