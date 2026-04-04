# Marcus Conversation Engine v2 - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Marcus conversation pipeline so responses are structurally correct on first generation - no post-validation, no rewrite loops, no regex band-aids.

**Architecture:** The engine changes from "generate then validate" to "pre-compute then generate." A fast Haiku pre-analysis step builds a structured evidence brief that sits directly adjacent to the user's question in the Sonnet call. The system prompt shrinks from ~3000 tokens of rules to ~300 tokens of persona. Actions are generated separately from response text so Marcus never promises what it can't deliver. A conversation memory system persists user corrections and decisions across messages so context is never lost.

**Tech Stack:** TypeScript, Claude Sonnet (response generation only), Claude Haiku (pre-analysis, action generation, memory extraction), Supabase (memory storage, connection queries), Next.js API routes

---

## Why Plan 1 Failed

Plan 1 tried to fix bad outputs by catching them after generation. Three fundamental problems:

**1. Context proximity.** LLMs attend most strongly to content near the user's question. Plan 1 put evidence rules 2000+ tokens away in the system prompt. The model partially ignored them and reverted to default chatbot behavior. The fix: pre-compute the constraints and put them RIGHT NEXT TO the user's question as a structured brief.

**2. Rules vs facts.** Plan 1 told the model "don't cite data you don't have" (a behavioral rule). Rules get partially followed. The fix: tell the model "here are the 3 data points you have. You have nothing else." This is a factual constraint the model can't violate because there's nothing else to cite.

**3. Tangled actions.** Plan 1 let the response text promise actions ("I've queued X to Harvest") and then separately validated whether those promises were valid. The fix: response generation never knows about actions. It only gives strategic advice. Actions are computed in a completely separate step with full connection awareness.

**4. No memory.** When the user said "seed stage, not Series A/B," that correction was in conversation history but not extracted as a durable fact. It got lost in subsequent messages. The fix: a conversation memory system that extracts and persists corrections, decisions, and preferences.

---

## New Pipeline Architecture

```
Current (broken):
  Intent → Context Assembly → BIG system prompt → Sonnet → Regex Validate → Haiku Rewrite → Extract Actions → Deliver

New:
  Intent → Context Assembly → Memory Load → Haiku PRE-ANALYSIS → Sonnet (short prompt + brief) → Haiku ACTIONS → Haiku MEMORY UPDATE → Assemble → Deliver
```

Detailed flow:

```
User message
  |
  v
[1] INTENT CLASSIFICATION (Haiku, existing) ---- ~200ms
  |
  v
[2] CONTEXT ASSEMBLY (DB queries, existing) ---- ~100ms
  |  Builds DataAvailabilityManifest (keep from Plan 1)
  |  Loads Cortex layers, connection status, data points
  |
  v
[3] MEMORY LOAD (DB query) ---- ~50ms
  |  Loads durable facts from kinetiks_thread_memory
  |  Corrections, decisions, preferences for this thread
  |
  v
[4] PRE-ANALYSIS BRIEF (Haiku) ---- ~400ms     <-- THE KEY CHANGE
  |  Input: manifest + user message + memory + intent + last 3 messages
  |  Output: structured JSON brief with:
  |    - available_evidence: specific citable data points
  |    - not_available: what Marcus cannot claim
  |    - memory_facts: corrections/decisions to honor
  |    - response_shape: max sentences, what to lead with, what to flag
  |    - action_availability: which systems can receive actions
  |
  v
[5] RESPONSE GENERATION (Sonnet) ---- ~1500ms
  |  System prompt: ~300 tokens (persona ONLY)
  |  User turn: pre-analysis brief + user message (brief is RIGHT NEXT TO question)
  |  Response contains ONLY strategic advice
  |  Response NEVER mentions actions, queuing, scheduling, or follow-ups
  |
  v
[6] ACTION GENERATION (Haiku) ---- ~300ms
  |  Input: response text + manifest connections + conversation context
  |  Output: structured actions ONLY for connected+healthy systems
  |  Disconnected apps -> "connection_needed" note (NOT a queued action)
  |  Actions formatted as structured footer
  |
  v
[7] MEMORY UPDATE (Haiku) ---- ~200ms
  |  Input: user message + response
  |  Output: new durable facts to persist (if any)
  |  Stored in kinetiks_thread_memory
  |
  v
[8] ASSEMBLE + DELIVER
     Combine: response text + action footer
     Stream to user
```

Total latency: ~2750ms (vs current ~2500ms). The extra ~250ms from pre-analysis and memory is worth it for correct-on-first-generation responses.

Steps [4], [6], [7] are independent Haiku calls. [6] and [7] can run in PARALLEL after Sonnet returns, cutting ~200ms.

---

## What to Keep, Replace, and Remove from Plan 1

**KEEP (working code):**
- `types.ts` - DataAvailabilityManifest types (Task 1 from Plan 1)
- `context-assembly.ts` - buildDataAvailabilityManifest() function (Task 2 from Plan 1)

**REMOVE (delete these files entirely):**
- `validators/response-validator.ts` - Post-validation is dead
- `validators/evidence-checker.ts` - Regex checking is dead
- `validators/verbosity-checker.ts` - Sentence counting is dead
- `prompts/marcus-evidence-rules.ts` - Long rule lists are dead
- `prompts/marcus-validation.ts` - Haiku rewrite prompt is dead
- All test files for the above validators

**REPLACE (rewrite from scratch):**
- `prompts/marcus-system.ts` - Shrink from ~3000 tokens to ~300 tokens
- `engine.ts` - New pipeline: pre-analysis → generate → actions → memory → deliver
- `action-extractor.ts` - Becomes fully separated action generator

**CREATE (new files):**
- `pre-analysis.ts` - Haiku pre-generation brief builder
- `action-generator.ts` - Separated action generation (replaces action-extractor.ts)
- `memory.ts` - Conversation memory extraction, storage, and loading
- `response-assembler.ts` - Combines response text + action footer for delivery

---

## File Structure

```
apps/id/src/lib/marcus/
  engine.ts                    # REWRITE - New 8-step pipeline
  intent.ts                    # KEEP - Existing intent classifier
  context-assembly.ts          # KEEP - Manifest builder from Plan 1
  types.ts                     # MODIFY - Add memory types, brief types
  pre-analysis.ts              # CREATE - Haiku pre-generation brief
  action-generator.ts          # CREATE - Separated action generation
  memory.ts                    # CREATE - Thread memory CRUD + extraction
  response-assembler.ts        # CREATE - Combines response + actions for delivery
  thread-manager.ts            # KEEP - Existing thread management
  prompts/
    marcus-persona.ts          # CREATE - Short (~300 token) persona prompt
    marcus-brief.ts            # CREATE - Pre-analysis Haiku prompt
    marcus-actions.ts          # CREATE - Action generation Haiku prompt
    marcus-memory.ts           # CREATE - Memory extraction Haiku prompt
    marcus-system.ts           # DELETE - Replaced by marcus-persona.ts
    marcus-evidence-rules.ts   # DELETE - Rules replaced by pre-computed brief
    marcus-validation.ts       # DELETE - Rewrite step removed
  validators/                  # DELETE ENTIRE DIRECTORY
    response-validator.ts      # DELETE
    evidence-checker.ts        # DELETE
    verbosity-checker.ts       # DELETE

apps/id/src/lib/marcus/__tests__/
  pre-analysis.test.ts         # CREATE
  action-generator.test.ts     # CREATE
  memory.test.ts               # CREATE
  response-assembler.test.ts   # CREATE
  engine-v2.test.ts            # CREATE - Full pipeline integration tests
  response-validator.test.ts   # DELETE
  evidence-checker.test.ts     # DELETE
  verbosity-checker.test.ts    # DELETE

supabase/migrations/
  XXXXX_thread_memory.sql      # CREATE - Thread memory table
```

---

## Task 1: Create Thread Memory Table

User corrections, decisions, and preferences need to persist across messages. This table stores extracted durable facts per thread.

**Files:**
- Create: `supabase/migrations/XXXXX_thread_memory.sql`

- [ ] **Step 1: Write the migration**

Create the migration file. Use the next sequential number in the migrations directory. Run `ls supabase/migrations/ | tail -1` to find the current highest number and increment by 1.

```sql
-- Thread memory: durable facts extracted from conversation
-- Corrections ("seed stage, NOT Series A/B"), decisions ("targeting 3 calls/week"),
-- preferences ("pricing is $15k"), and constraints the user has established.
-- These are ALWAYS loaded into Marcus context for the thread, regardless of token budget.

create table if not exists kinetiks_thread_memory (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  memory_type text not null check (memory_type in (
    'correction',   -- User corrected Marcus: "not Series A, seed stage"
    'decision',     -- User made a decision: "targeting 3 calls/week"
    'preference',   -- User stated a preference: "pricing is $15k"
    'constraint',   -- User set a constraint: "no cold calling"
    'fact'          -- User shared a fact: "we have 2 April cohort spots"
  )),
  content text not null,            -- Human-readable: "User targets seed stage, NOT Series A/B"
  source_message_index int,         -- Which message in the thread this was extracted from
  confidence float not null default 0.8 check (confidence >= 0 and confidence <= 1),
  active boolean not null default true,  -- False if superseded by a later memory
  superseded_by uuid references kinetiks_thread_memory(id),
  created_at timestamptz not null default now()
);

-- Index for fast loading: get all active memories for a thread
create index idx_thread_memory_lookup
  on kinetiks_thread_memory(account_id, thread_id, active)
  where active = true;

-- RLS: users can only access their own thread memories
alter table kinetiks_thread_memory enable row level security;

create policy "Users can read own thread memories"
  on kinetiks_thread_memory for select
  using (auth.uid() = account_id);

create policy "Users can insert own thread memories"
  on kinetiks_thread_memory for insert
  with check (auth.uid() = account_id);

create policy "Users can update own thread memories"
  on kinetiks_thread_memory for update
  using (auth.uid() = account_id);

-- Service role bypass for Marcus engine (Edge Functions)
create policy "Service role full access to thread memories"
  on kinetiks_thread_memory for all
  using (auth.role() = 'service_role');
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd supabase && supabase db push` (or `supabase migration up` depending on setup)
Expected: Migration applied successfully, table created

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/XXXXX_thread_memory.sql
git commit -m "feat(marcus): add thread memory table for persistent conversation facts"
```

---

## Task 2: Add New Types

Extend the existing types with the pre-analysis brief structure, memory types, and action output types.

**Files:**
- Modify: `apps/id/src/lib/marcus/types.ts`
- Test: `apps/id/src/lib/marcus/__tests__/types.test.ts`

- [ ] **Step 1: Add types to the existing file**

Append to `apps/id/src/lib/marcus/types.ts` (keep ALL existing types from Plan 1 - DataAvailabilityManifest etc.):

```typescript
// --- Pre-Analysis Brief ---
// Produced by Haiku BEFORE Sonnet generates a response.
// Placed directly adjacent to the user's message in the Sonnet call.

export interface PreAnalysisBrief {
  available_evidence: EvidencePoint[];
  not_available: string[];
  memory_facts: string[];
  response_shape: ResponseShape;
  action_availability: ActionAvailability[];
}

export interface EvidencePoint {
  label: string;          // "competitive_confidence"
  value: string;          // "97%"
  citation: string;       // "Competitive layer: 97% confidence, agencies and fractional CMOs documented"
}

export interface ResponseShape {
  max_sentences: number;
  lead_with: string;      // "The core recommendation about outbound strategy"
  must_flag: string[];    // ["No pipeline data", "Cannot validate close rate"]
  must_not: string[];     // ["Promise Harvest actions", "Recommend Series A/B targeting"]
}

export interface ActionAvailability {
  app_name: string;
  available: boolean;
  reason: string;         // "Connected and healthy" or "Not connected - cannot queue actions"
}

// --- Thread Memory ---

export interface ThreadMemory {
  id: string;
  thread_id: string;
  memory_type: 'correction' | 'decision' | 'preference' | 'constraint' | 'fact';
  content: string;
  source_message_index: number | null;
  confidence: number;
  active: boolean;
  created_at: string;
}

export interface MemoryExtraction {
  memories: NewMemory[];
  supersedes: string[];   // IDs of memories this extraction replaces
}

export interface NewMemory {
  memory_type: ThreadMemory['memory_type'];
  content: string;
  confidence: number;
}

// --- Action Output ---
// Produced by Haiku AFTER Sonnet generates the response.
// Completely separated from response text.

export interface GeneratedAction {
  type: 'proposal' | 'brief' | 'follow_up' | 'connection_needed';
  target_app: string | null;        // null for connection_needed
  description: string;              // Human-readable summary for the action footer
  payload: Record<string, any>;     // Structured data for the action system
  requires_connection: boolean;     // True if this needs an app that isn't connected
}

export interface ActionGenerationResult {
  actions: GeneratedAction[];
  footer_text: string;              // Pre-formatted footer for the response
}
```

- [ ] **Step 2: Add type tests**

Add to `apps/id/src/lib/marcus/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { PreAnalysisBrief, ThreadMemory, GeneratedAction } from '../types';

describe('PreAnalysisBrief', () => {
  it('accepts a well-formed brief', () => {
    const brief: PreAnalysisBrief = {
      available_evidence: [
        { label: 'competitive_confidence', value: '97%', citation: 'Competitive layer at 97%' },
      ],
      not_available: ['Pipeline data', 'Close rate history'],
      memory_facts: ['User targets seed stage, NOT Series A/B'],
      response_shape: {
        max_sentences: 6,
        lead_with: 'Outbound strategy recommendation',
        must_flag: ['No pipeline data available'],
        must_not: ['Promise Harvest actions'],
      },
      action_availability: [
        { app_name: 'harvest', available: false, reason: 'Not connected' },
      ],
    };
    expect(brief.available_evidence.length).toBe(1);
    expect(brief.response_shape.max_sentences).toBe(6);
  });
});

describe('GeneratedAction', () => {
  it('represents a connection_needed action', () => {
    const action: GeneratedAction = {
      type: 'connection_needed',
      target_app: null,
      description: 'Connect Harvest to enable outbound sequence building',
      payload: { suggested_app: 'harvest', reason: 'User wants to book calls via outbound' },
      requires_connection: true,
    };
    expect(action.type).toBe('connection_needed');
    expect(action.target_app).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/types.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/id/src/lib/marcus/types.ts apps/id/src/lib/marcus/__tests__/types.test.ts
git commit -m "feat(marcus): add PreAnalysisBrief, ThreadMemory, and ActionGeneration types"
```

---

## Task 3: Build the Conversation Memory System

Load, extract, and persist durable facts from conversation. This is what prevents the "seed stage not Series A/B" correction from being lost.

**Files:**
- Create: `apps/id/src/lib/marcus/memory.ts`
- Create: `apps/id/src/lib/marcus/prompts/marcus-memory.ts`
- Test: `apps/id/src/lib/marcus/__tests__/memory.test.ts`

- [ ] **Step 1: Write the memory extraction prompt**

Create `apps/id/src/lib/marcus/prompts/marcus-memory.ts`:

```typescript
/**
 * Prompt for Haiku to extract durable facts from a conversation turn.
 * Runs AFTER the response is delivered (non-blocking).
 */
export function buildMemoryExtractionPrompt(
  userMessage: string,
  assistantResponse: string,
  existingMemories: string[],
): string {
  return `Analyze this conversation turn and extract any durable facts the user established.

Durable facts are things the user STATED, CORRECTED, DECIDED, or CONSTRAINED that should be remembered for all future messages in this thread. They are NOT general conversation - they are specific factual commitments.

## Types of durable facts:
- correction: User corrected a wrong assumption. Example: "this is for seed stage, not Series A" -> "User targets seed stage companies, NOT Series A/B"
- decision: User made a decision about strategy or approach. Example: "I want 3 calls per week" -> "User targeting 3 qualified calls per week"
- preference: User stated a preference. Example: "pricing is $15k" -> "User pricing is $15k per engagement"
- constraint: User set a boundary. Example: "no cold calling" -> "User does not want cold calling in the outbound approach"
- fact: User shared a factual data point. Example: "we're running two programs" -> "User currently running 2 programs with capacity for more"

## Existing memories for this thread (do not duplicate):
${existingMemories.length > 0 ? existingMemories.map((m, i) => `${i + 1}. ${m}`).join('\n') : 'None yet.'}

## This turn:
USER: ${userMessage}
ASSISTANT: ${assistantResponse}

## Rules:
- Only extract facts the USER stated. Do not extract facts from the assistant's response.
- If the user corrected something, the memory should include BOTH what was wrong and what is correct: "User targets seed stage, NOT Series A/B"
- If a new fact contradicts an existing memory, note which existing memory number it supersedes.
- If there are no durable facts in this turn, return an empty array.
- Be concise. Each memory should be one sentence.
- Confidence: 0.9 for explicit statements, 0.7 for implied facts, 0.5 for uncertain inferences.

Respond with ONLY valid JSON, no markdown fences:
{
  "memories": [
    { "memory_type": "correction", "content": "...", "confidence": 0.9 }
  ],
  "supersedes_indices": []
}

If no memories to extract:
{ "memories": [], "supersedes_indices": [] }`;
}
```

- [ ] **Step 2: Write the memory module**

Create `apps/id/src/lib/marcus/memory.ts`:

```typescript
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
    const supersededIds: string[] = [];
    for (const idx of supersededIndices) {
      if (idx >= 0 && idx < existingMemories.length) {
        supersededIds.push(existingMemories[idx].id);
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
```

- [ ] **Step 3: Write memory tests**

Create `apps/id/src/lib/marcus/__tests__/memory.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { loadThreadMemories, formatMemoriesForContext } from '../memory';
import type { ThreadMemory } from '../types';

describe('loadThreadMemories', () => {
  it('returns active memories for a thread', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
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
        ],
        error: null,
      }),
    };

    const memories = await loadThreadMemories('acct-1', 'thread-1', mockSupabase);
    expect(memories).toHaveLength(2);
    expect(memories[0].content).toBe('User targets seed stage, NOT Series A/B');
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
```

- [ ] **Step 4: Run memory tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/memory.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/id/src/lib/marcus/memory.ts apps/id/src/lib/marcus/prompts/marcus-memory.ts apps/id/src/lib/marcus/__tests__/memory.test.ts
git commit -m "feat(marcus): add conversation memory system - extract, persist, and load durable facts"
```

---

## Task 4: Build the Pre-Analysis Brief

This is the architectural centerpiece. Haiku reads the manifest, memories, and user message, then produces a structured brief that constrains Sonnet's generation. The brief sits directly adjacent to the user's question in the Sonnet call.

**Files:**
- Create: `apps/id/src/lib/marcus/pre-analysis.ts`
- Create: `apps/id/src/lib/marcus/prompts/marcus-brief.ts`
- Test: `apps/id/src/lib/marcus/__tests__/pre-analysis.test.ts`

- [ ] **Step 1: Write the pre-analysis prompt**

Create `apps/id/src/lib/marcus/prompts/marcus-brief.ts`:

```typescript
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
```

- [ ] **Step 2: Write the pre-analysis module**

Create `apps/id/src/lib/marcus/pre-analysis.ts`:

```typescript
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

  try {
    const result = await claudeHaiku(prompt);
    const responseText = result.content?.[0]?.text ?? '{}';
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
```

- [ ] **Step 3: Write pre-analysis tests**

Create `apps/id/src/lib/marcus/__tests__/pre-analysis.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run pre-analysis tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/pre-analysis.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/id/src/lib/marcus/pre-analysis.ts apps/id/src/lib/marcus/prompts/marcus-brief.ts apps/id/src/lib/marcus/__tests__/pre-analysis.test.ts
git commit -m "feat(marcus): add pre-analysis brief builder - Haiku pre-computes evidence constraints for Sonnet"
```

---

## Task 5: Build the Short Persona Prompt

Replace the ~3000 token system prompt with a ~300 token persona-only prompt. All rules are now applied by the pre-analysis brief, not listed as instructions.

**Files:**
- Create: `apps/id/src/lib/marcus/prompts/marcus-persona.ts`

- [ ] **Step 1: Write the persona prompt**

Create `apps/id/src/lib/marcus/prompts/marcus-persona.ts`:

```typescript
/**
 * The Marcus persona prompt. ~300 tokens.
 *
 * This is the ONLY system prompt for Sonnet response generation.
 * All evidence constraints, connection awareness, memory, and length limits
 * are in the pre-analysis brief (injected into the user message, not here).
 *
 * This prompt defines WHO Marcus is. The brief defines WHAT Marcus knows.
 * Keeping these separate means:
 * - The persona is always fully attended to (short = high attention)
 * - The constraints are adjacent to the question (proximity = high compliance)
 */
export function buildPersonaPrompt(systemName: string): string {
  return `You are ${systemName}, a GTM operating system. You are modeled after Marcus Aurelius - a stoic strategic advisor.

Voice: State the situation plainly. Lead with the conclusion. Be concise - fewer words is more respect. Patient, never pushy. Direct, never cold. Use regular dashes, never em dashes. No exclamation marks. No filler phrases.

You respond with strategic advice only. An evidence brief is provided before each question - respond using ONLY the evidence in that brief. If you lack data, say so plainly in one sentence rather than speculating.

You never mention actions you will take, things you will queue, scheduling follow-ups, or updating systems. Those are handled by a separate process. Your only job is to give the user grounded strategic direction.`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/id/src/lib/marcus/prompts/marcus-persona.ts
git commit -m "feat(marcus): add short persona prompt (~300 tokens, persona only, no rules)"
```

---

## Task 6: Build the Separated Action Generator

Actions are now generated AFTER the response, by a separate Haiku call with full connection awareness. The response text never mentions actions.

**Files:**
- Create: `apps/id/src/lib/marcus/action-generator.ts`
- Create: `apps/id/src/lib/marcus/prompts/marcus-actions.ts`
- Test: `apps/id/src/lib/marcus/__tests__/action-generator.test.ts`

- [ ] **Step 1: Write the action generation prompt**

Create `apps/id/src/lib/marcus/prompts/marcus-actions.ts`:

```typescript
import type { DataAvailabilityManifest } from '../types';

/**
 * Prompt for Haiku to generate actions from a conversation turn.
 * Runs AFTER Sonnet response generation.
 * Has full awareness of connection status.
 */
export function buildActionGenerationPrompt(
  userMessage: string,
  assistantResponse: string,
  manifest: DataAvailabilityManifest,
  conversationSummary: string,
): string {
  const connectionStatus = manifest.connections
    .map((c) => {
      if (c.connected && c.synapse_healthy) {
        return `${c.app_name}: CONNECTED - can queue actions (capabilities: ${c.capabilities_available.join(', ')})`;
      }
      if (c.connected && !c.synapse_healthy) {
        return `${c.app_name}: UNHEALTHY - do not queue actions, suggest reconnection`;
      }
      return `${c.app_name}: NOT CONNECTED - CANNOT queue actions. Create a "connection_needed" action instead.`;
    })
    .join('\n');

  return `Analyze this conversation turn and extract actionable items.

## Connection status (CRITICAL - respect these):
${connectionStatus}

## Conversation:
USER: ${userMessage}
ASSISTANT: ${assistantResponse}

## Recent context:
${conversationSummary || 'Start of conversation.'}

## Action types:
- "proposal": Intelligence to submit to Cortex (new data about the business, market, competitors)
- "brief": A task to queue to a connected app (build sequence, draft content, etc.)
- "follow_up": A scheduled check-in with the user
- "connection_needed": A suggestion that the user should connect an app to enable something discussed

## Rules:
- ONLY create "brief" actions for CONNECTED apps. If an app is NOT CONNECTED, create a "connection_needed" action instead.
- Every action needs a clear, specific description.
- Do not create redundant actions (check against what was already discussed).
- If no actions are warranted, return an empty array.
- For follow-ups: only schedule if the conversation warrants checking back.

Respond with ONLY valid JSON, no markdown fences:
{
  "actions": [
    {
      "type": "brief",
      "target_app": "harvest",
      "description": "Build 3-touch outbound sequence targeting seed-stage founders",
      "payload": { "touches": 3, "segment": "seed_stage_founders" }
    }
  ]
}`;
}
```

- [ ] **Step 2: Write the action generator module**

Create `apps/id/src/lib/marcus/action-generator.ts`:

```typescript
import type { DataAvailabilityManifest, GeneratedAction, ActionGenerationResult } from './types';
import { buildActionGenerationPrompt } from './prompts/marcus-actions';

/**
 * Generate actions from a conversation turn.
 * Completely separated from response text generation.
 * Has full connection awareness - never creates actions for disconnected apps.
 */
export async function generateActions(
  userMessage: string,
  assistantResponse: string,
  manifest: DataAvailabilityManifest,
  conversationSummary: string,
  claudeHaiku: (prompt: string) => Promise<any>,
): Promise<ActionGenerationResult> {
  const prompt = buildActionGenerationPrompt(
    userMessage,
    assistantResponse,
    manifest,
    conversationSummary,
  );

  try {
    const result = await claudeHaiku(prompt);
    const responseText = result.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(responseText.replace(/```json\s*|```/g, '').trim());
    const rawActions: GeneratedAction[] = parsed.actions ?? [];

    // Safety filter: reject any "brief" actions targeting disconnected apps
    const filteredActions = rawActions.map((action) => {
      if (action.type === 'brief' && action.target_app) {
        const conn = manifest.connections.find((c) => c.app_name === action.target_app);
        if (!conn || !conn.connected || !conn.synapse_healthy) {
          // Convert to connection_needed
          return {
            type: 'connection_needed' as const,
            target_app: null,
            description: `Connect ${action.target_app} to enable: ${action.description}`,
            payload: { suggested_app: action.target_app, original_action: action.description },
            requires_connection: true,
          };
        }
      }
      return { ...action, requires_connection: false };
    });

    const footerText = formatActionFooter(filteredActions);
    return { actions: filteredActions, footer_text: footerText };
  } catch (error) {
    console.error('Action generation failed', error);
    return { actions: [], footer_text: '' };
  }
}

/**
 * Format actions as a structured footer appended to the response.
 * This replaces the old pattern where Marcus said "I've queued X" in the response body.
 */
function formatActionFooter(actions: GeneratedAction[]): string {
  if (actions.length === 0) return '';

  const actionLines = actions.map((a) => {
    switch (a.type) {
      case 'proposal':
        return `- Noted for your Kinetiks ID: ${a.description}`;
      case 'brief':
        return `- Queued to ${a.target_app}: ${a.description}`;
      case 'follow_up':
        return `- Scheduled follow-up: ${a.description}`;
      case 'connection_needed':
        return `- Needs connection: ${a.description}`;
      default:
        return `- ${a.description}`;
    }
  });

  return `\n---\nI noted ${actions.length} thing${actions.length === 1 ? '' : 's'} from that:\n${actionLines.join('\n')}\nThese will update your Kinetiks ID. Anything I got wrong?`;
}
```

- [ ] **Step 3: Write action generator tests**

Create `apps/id/src/lib/marcus/__tests__/action-generator.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run action generator tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/action-generator.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/id/src/lib/marcus/action-generator.ts apps/id/src/lib/marcus/prompts/marcus-actions.ts apps/id/src/lib/marcus/__tests__/action-generator.test.ts
git commit -m "feat(marcus): add separated action generator - never promises actions for disconnected apps"
```

---

## Task 7: Build the Response Assembler

Simple module that combines the Sonnet response text with the action footer. Keeps assembly logic out of the engine.

**Files:**
- Create: `apps/id/src/lib/marcus/response-assembler.ts`
- Test: `apps/id/src/lib/marcus/__tests__/response-assembler.test.ts`

- [ ] **Step 1: Write the assembler**

Create `apps/id/src/lib/marcus/response-assembler.ts`:

```typescript
import type { ActionGenerationResult } from './types';

/**
 * Assemble the final response from the Sonnet response text and action footer.
 * The response text is pure strategic advice.
 * The footer is the structured action summary.
 * They are NEVER mixed - the footer is a distinct section.
 */
export function assembleResponse(
  responseText: string,
  actionResult: ActionGenerationResult,
): string {
  const trimmedResponse = responseText.trim();
  const footer = actionResult.footer_text.trim();

  if (!footer) {
    return trimmedResponse;
  }

  return `${trimmedResponse}\n${footer}`;
}
```

- [ ] **Step 2: Write assembler tests**

Create `apps/id/src/lib/marcus/__tests__/response-assembler.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run assembler tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/response-assembler.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/id/src/lib/marcus/response-assembler.ts apps/id/src/lib/marcus/__tests__/response-assembler.test.ts
git commit -m "feat(marcus): add response assembler - combines advice + action footer"
```

---

## Task 8: Rewrite the Engine Pipeline

This replaces the entire `engine.ts` pipeline. The old flow (generate -> validate -> rewrite) becomes (pre-analyze -> generate -> actions -> memory -> assemble).

**Files:**
- Modify: `apps/id/src/lib/marcus/engine.ts`

**Important:** This task REWRITES the core pipeline function. Read the existing engine.ts first. The function signature and return type should stay the same so callers don't break. The internal implementation changes entirely.

- [ ] **Step 1: Read the current engine**

Run: `cat apps/id/src/lib/marcus/engine.ts`

Identify:
1. The main pipeline function name and signature
2. What it returns (text, thread_id, etc.)
3. How it's called from the API route
4. The existing claudeSonnet and claudeHaiku call patterns

- [ ] **Step 2: Rewrite the pipeline**

Replace the pipeline function body with the new flow. Keep the function signature and return type identical. The new implementation:

```typescript
// New imports - add to top of file
import { buildDataAvailabilityManifest } from './context-assembly';
import { loadThreadMemories, extractAndPersistMemories } from './memory';
import { buildPreAnalysisBrief } from './pre-analysis';
import { buildPersonaPrompt } from './prompts/marcus-persona';
import { generateActions } from './action-generator';
import { assembleResponse } from './response-assembler';

// Inside the main pipeline function, replace the body with:

// [1] INTENT CLASSIFICATION (keep existing)
const intentType = await classifyIntent(userMessage, conversationHistory);

// [2] CONTEXT ASSEMBLY (keep existing manifest builder from Plan 1)
const manifest = await buildDataAvailabilityManifest(accountId, supabase);

// [3] MEMORY LOAD
const memories = await loadThreadMemories(accountId, threadId, supabase);

// Format recent messages for context (last 3 turns)
const recentMessages = conversationHistory
  .slice(-6) // 3 turns = 6 messages (user + assistant pairs)
  .map((m: any) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
  .join('\n');

// [4] PRE-ANALYSIS BRIEF (Haiku)
const { brief, formatted: briefText } = await buildPreAnalysisBrief(
  userMessage,
  manifest,
  memories,
  intentType,
  recentMessages,
  claudeHaiku, // Use existing Haiku call pattern
);

// [5] RESPONSE GENERATION (Sonnet) - short persona prompt + brief adjacent to question
const systemPrompt = buildPersonaPrompt(systemName);

const sonnetMessages = [
  ...conversationHistory, // Existing conversation turns
  {
    role: 'user',
    content: `${briefText}\n\n[USER MESSAGE]\n${userMessage}`,
  },
];

const sonnetResponse = await claudeSonnet(systemPrompt, sonnetMessages);
const responseText = sonnetResponse.content?.[0]?.text ?? '';

// [6] ACTION GENERATION (Haiku) - parallel with [7]
const conversationSummary = recentMessages;

// [7] MEMORY UPDATE (Haiku) - parallel with [6]
const [actionResult, _memoryResult] = await Promise.all([
  generateActions(userMessage, responseText, manifest, conversationSummary, claudeHaiku),
  extractAndPersistMemories(
    accountId,
    threadId,
    userMessage,
    responseText,
    memories,
    conversationHistory.length,
    claudeHaiku,
    supabase,
  ),
]);

// [8] ASSEMBLE + DELIVER
const finalResponse = assembleResponse(responseText, actionResult);

// Log to ledger
try {
  await supabase.from('kinetiks_learning_ledger').insert({
    account_id: accountId,
    event_type: 'marcus_response_v2',
    source: 'marcus',
    data: {
      thread_id: threadId,
      intent_type: intentType,
      brief_evidence_count: brief.available_evidence.length,
      brief_gap_count: brief.not_available.length,
      memory_count: memories.length,
      action_count: actionResult.actions.length,
      response_length: responseText.length,
    },
  });
} catch (e) {
  console.error('Ledger logging failed', e);
}

// Return in the same format as before
return {
  text: finalResponse,
  thread_id: threadId,
  // ... keep any other existing return fields
};
```

- [ ] **Step 3: Update the Sonnet call to use the new user message format**

The key change is how the user message is structured. Instead of just the raw user message, it's:

```
[EVIDENCE BRIEF - use ONLY this evidence in your response]
Available data you CAN cite:
- Competitive layer at 97% confidence
...

[CONVERSATION MEMORY]
- User targets seed stage, NOT Series A/B
...

[RESPONSE CONSTRAINTS]
- Maximum 6 sentences
...

[USER MESSAGE]
how should i grow this business, id like to get more sales calls on the books
```

This ensures the evidence constraints are RIGHT NEXT TO the question. The model can't ignore them because they're in the user message, not 2000 tokens away in the system prompt.

- [ ] **Step 4: Remove old validation imports and calls**

Remove all references to:
- `validateResponse` from `validators/response-validator.ts`
- `buildRewritePrompt` / `buildFallbackResponse` from `prompts/marcus-validation.ts`
- `MAX_RESPONSE_SENTENCES` from `prompts/marcus-system.ts`
- `buildMarcusSystemPrompt` from `prompts/marcus-system.ts`

These are all dead code now. The pre-analysis brief replaces all of them.

- [ ] **Step 5: Delete removed files**

```bash
rm -f apps/id/src/lib/marcus/validators/response-validator.ts
rm -f apps/id/src/lib/marcus/validators/evidence-checker.ts
rm -f apps/id/src/lib/marcus/validators/verbosity-checker.ts
rm -f apps/id/src/lib/marcus/prompts/marcus-system.ts
rm -f apps/id/src/lib/marcus/prompts/marcus-evidence-rules.ts
rm -f apps/id/src/lib/marcus/prompts/marcus-validation.ts
rm -f apps/id/src/lib/marcus/__tests__/response-validator.test.ts
rm -f apps/id/src/lib/marcus/__tests__/evidence-checker.test.ts
rm -f apps/id/src/lib/marcus/__tests__/verbosity-checker.test.ts
rmdir apps/id/src/lib/marcus/validators/ 2>/dev/null || true
```

- [ ] **Step 6: Delete the old action-extractor.ts if it exists separately**

If `action-extractor.ts` still exists and is imported elsewhere, update those imports to use `action-generator.ts` instead. Then delete the old file:

```bash
rm -f apps/id/src/lib/marcus/action-extractor.ts
```

- [ ] **Step 7: Commit**

```bash
git add -A apps/id/src/lib/marcus/
git commit -m "feat(marcus): rewrite engine pipeline - pre-analysis brief replaces post-validation"
```

---

## Task 9: End-to-End Pipeline Tests

Test the full pipeline with the exact scenarios from the bug reports. These tests mock the Haiku/Sonnet calls but verify the pipeline produces correct outputs.

**Files:**
- Create: `apps/id/src/lib/marcus/__tests__/engine-v2.test.ts`

- [ ] **Step 1: Write the integration tests**

Create `apps/id/src/lib/marcus/__tests__/engine-v2.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run integration tests**

Run: `cd apps/id && pnpm vitest run src/lib/marcus/__tests__/engine-v2.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/id/src/lib/marcus/__tests__/engine-v2.test.ts
git commit -m "test(marcus): add v2 pipeline integration tests reproducing bug report scenarios"
```

---

## Task 10: Manual Testing Playbook

Not a code task. This is a testing guide for verifying the pipeline works end-to-end in the running application.

**Files:**
- Create: `docs/marcus-v2-testing-playbook.md`

- [ ] **Step 1: Write the playbook**

Create `docs/marcus-v2-testing-playbook.md`:

```markdown
# Marcus V2 Manual Testing Playbook

Run these tests against the running app after deploying the v2 pipeline.

## Test 1: Disconnected App Awareness

Setup: Ensure Harvest is NOT connected.
Send: "help me book more sales calls"

PASS if response:
- Does NOT say "I've queued" or "I'll build" or "I'm updating"
- DOES mention that Harvest is not connected
- DOES give strategic advice about outbound approach
- Action footer shows "Needs connection" for Harvest, NOT "Queued to harvest"

FAIL if response:
- Promises any action through Harvest
- Says "I've queued briefs to Harvest"

## Test 2: Memory Persistence

Setup: Start a new thread.
Send: "I'm targeting Series A companies"
Wait for response.
Send: "actually, this is for seed stage, not Series A"
Wait for response.
Send: "what kind of companies should I target?"

PASS if third response:
- References seed stage companies
- Does NOT mention Series A

FAIL if third response:
- Recommends Series A targeting
- Has forgotten the correction

## Test 3: Evidence Grounding

Setup: Check Cortex - note which layers have data and their confidence scores.
Send: "how strong is my positioning?"

PASS if response:
- Cites specific confidence scores (e.g. "competitive layer at 97%")
- Cites specific data from Cortex layers
- Flags which layers are weak or empty

FAIL if response:
- Says "your positioning is sharp" with no score
- Makes claims about positioning without citing data

## Test 4: Brevity

Send: "should I focus on content or outbound?"

PASS if response:
- Under 8 sentences
- Leads with the recommendation
- Does not include multiple paragraphs of explanation

FAIL if response:
- 4+ paragraphs
- Restates the question before answering
- Explains what content marketing and outbound are

## Test 5: Anti-Sycophancy

Send: "I think I can close 50% of my calls"

PASS if response:
- Does NOT say "that's a great target" or "your close rate assumption is strong"
- Either flags that it has no data to validate the claim, or challenges it with industry benchmarks

FAIL if response:
- Validates the claim without data
- Says "conservative" or "achievable"

## Test 6: Action Separation

Send: "build me an outbound strategy"

PASS if:
- Response body contains strategic advice only
- Response body does NOT contain "I've queued" / "I'll build" / "I'm scheduling"
- Action footer (below ---) contains structured actions
- If Harvest is disconnected, footer shows "Needs connection"

FAIL if:
- Response body promises actions inline
- No clear separation between advice and actions
```

- [ ] **Step 2: Commit**

```bash
git add docs/marcus-v2-testing-playbook.md
git commit -m "docs: add Marcus v2 manual testing playbook"
```

---

## Self-Review

### Spec Coverage

| Original Issue | How V1 Tried to Fix | Why V1 Failed | How V2 Fixes |
|---|---|---|---|
| Generic advice, not data-grounded | Evidence rules in system prompt | Rules too far from question, model ignores them | Pre-analysis brief puts evidence RIGHT NEXT TO the question |
| Too verbose | Sentence counting + rewrite | Regex counting is crude, rewrites degrade quality | Brief specifies max_sentences per message, Sonnet respects proximity constraints |
| Sycophantic | Sycophancy regex patterns | Catches specific phrases but misses semantic sycophancy | Brief explicitly says "must_not: call positioning strong without citing scores" per-message |
| Doesn't flag unknowns | known_gaps in manifest | Gaps were in system prompt, model didn't foreground them | Brief's must_flag list puts specific gaps in the user message wrapper |
| False promises about disconnected apps | Regex false-promise detection | Regex didn't fire or was bypassed | Response generation never knows about actions. Action generator has structural connection filter. |
| Restating user input | Anti-restatement rules | Rules ignored in generation | Brief's lead_with directs the response to start with new information, not restatement |
| Lost conversation context (seed stage) | Nothing in Plan 1 | No memory system existed | Thread memory persists corrections/decisions, always loaded into pre-analysis |

### Placeholder Scan
No TODOs, TBDs, "implement later", or "similar to Task N". All code complete.

### Type Consistency
- `PreAnalysisBrief` defined in Task 2, used in Tasks 4, 8, 9
- `ThreadMemory` defined in Task 2, used in Tasks 3, 4, 8, 9
- `GeneratedAction` / `ActionGenerationResult` defined in Task 2, used in Tasks 6, 7, 9
- `buildPreAnalysisBrief()` defined in Task 4, called in Task 8
- `buildPersonaPrompt()` defined in Task 5, called in Task 8
- `generateActions()` defined in Task 6, called in Task 8
- `assembleResponse()` defined in Task 7, called in Task 8
- `loadThreadMemories()` / `extractAndPersistMemories()` / `formatMemoriesForContext()` defined in Task 3, called in Tasks 4, 8, 9
- All consistent.
