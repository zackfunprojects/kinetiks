import type { ThreadMemory, NewMemory, MemoryExtraction } from './types';
import { buildMemoryExtractionPrompt } from './prompts/marcus-memory';

/**
 * Load all active memories for a thread.
 * These are ALWAYS included in Marcus context, regardless of token budget.
 * Typically <500 tokens total even for long conversations.
 */
export async function loadThreadMemories(
  accountId: string,
  threadId: string,
  supabase: any,
): Promise<ThreadMemory[]> {
  const { data, error } = await supabase
    .from('kinetiks_thread_memory')
    .select('*')
    .eq('account_id', accountId)
    .eq('thread_id', threadId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load thread memories', error);
    return [];
  }

  return data ?? [];
}

/**
 * Extract and persist new memories from a conversation turn.
 * Runs AFTER response delivery (non-blocking).
 */
export async function extractAndPersistMemories(
  accountId: string,
  threadId: string,
  userMessage: string,
  assistantResponse: string,
  existingMemories: ThreadMemory[],
  messageIndex: number,
  claudeHaiku: (prompt: string) => Promise<any>,
  supabase: any,
): Promise<MemoryExtraction> {
  const existingContents = existingMemories.map((m) => m.content);

  const prompt = buildMemoryExtractionPrompt(
    userMessage,
    assistantResponse,
    existingContents,
  );

  try {
    const result = await claudeHaiku(prompt);
    const responseText = result.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(responseText.replace(/```json\s*|```/g, '').trim());

    const newMemories: NewMemory[] = parsed.memories ?? [];
    const supersededIndices: number[] = parsed.supersedes_indices ?? [];

    // Deactivate superseded memories
    // Prompt uses 1-based numbering, so subtract 1 for 0-based array access
    const supersededIds: string[] = [];
    for (const idx of supersededIndices) {
      const adjustedIdx = idx - 1;
      if (adjustedIdx >= 0 && adjustedIdx < existingMemories.length) {
        supersededIds.push(existingMemories[adjustedIdx].id);
      }
    }

    if (supersededIds.length > 0) {
      await supabase
        .from('kinetiks_thread_memory')
        .update({ active: false })
        .in('id', supersededIds);
    }

    // Insert new memories
    if (newMemories.length > 0) {
      const rows = newMemories.map((m) => ({
        account_id: accountId,
        thread_id: threadId,
        memory_type: m.memory_type,
        content: m.content,
        source_message_index: messageIndex,
        confidence: m.confidence,
        active: true,
      }));

      const { error } = await supabase
        .from('kinetiks_thread_memory')
        .insert(rows);

      if (error) {
        console.error('Failed to persist thread memories', error);
      }
    }

    return { memories: newMemories, supersedes: supersededIds };
  } catch (error) {
    console.error('Memory extraction failed', error);
    return { memories: [], supersedes: [] };
  }
}

/**
 * Format memories as a concise string for injection into the pre-analysis brief.
 */
export function formatMemoriesForContext(memories: ThreadMemory[]): string {
  if (memories.length === 0) return 'No prior decisions or corrections in this thread.';

  return memories
    .map((m) => {
      const typeLabel = m.memory_type === 'correction' ? 'CORRECTION'
        : m.memory_type === 'decision' ? 'DECISION'
        : m.memory_type === 'constraint' ? 'CONSTRAINT'
        : m.memory_type.toUpperCase();
      return `[${typeLabel}] ${m.content}`;
    })
    .join('\n');
}
