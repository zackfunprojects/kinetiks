# Phase 4: Cross-App Command Router — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire Marcus to talk to app Synapses bidirectionally — parsing user commands, routing to the right app(s), dispatching, and aggregating responses. This makes the Chat tab a real command interface.

**Architecture:** Extend Marcus's intent classifier with a command type. Build a capability registry that Synapses register with. Build command translation (natural language → structured commands). Dispatch via Supabase Realtime channels. Aggregate multi-app results into unified Chat responses. Update the Synapse template in `packages/synapse/` with a command handler interface every app must implement.

**Tech Stack:** Next.js 14, TypeScript, Supabase Realtime, Anthropic Claude API (Sonnet for command translation, Haiku for intent classification)

**Spec Reference:** `docs/specs/cross-app-command-router-spec.md` — read ENTIRE spec before starting.

---

## File Structure

```
apps/id/src/lib/
  marcus/
    intent.ts                       # MODIFY: add 'command' intent type
    command-router.ts               # NEW: core routing logic
    command-translator.ts           # NEW: natural language → structured commands
    command-dispatcher.ts           # NEW: dispatch via Realtime + HTTP fallback
    command-aggregator.ts           # NEW: aggregate multi-app responses
  ai/prompts/
    marcus-command.ts               # NEW: command parsing and translation prompts

packages/synapse/
  src/
    types.ts                        # MODIFY: add command types to Synapse interface
    command-handler.ts              # NEW: base command handler that apps extend
    capability-schema.ts            # NEW: capability definition types

apps/id/src/app/api/
  marcus/command/route.ts           # NEW: command processing endpoint
  synapse/register/route.ts         # NEW: Synapse capability registration
  synapse/capabilities/route.ts     # NEW: update capabilities
```

---

## Tasks

### Task 1: Synapse Command Interface
- [ ] Add command types to `packages/synapse/src/types.ts`: `SynapseCommand`, `CommandResponse`, `CommandProgress`, `SynapseCapabilities`, `CapabilityDefinition`
- [ ] Create `packages/synapse/src/command-handler.ts` — abstract base class with `handleCommand()`, `getCapabilities()`, `ping()` methods
- [ ] Create `packages/synapse/src/capability-schema.ts` — capability definition types with parameter schemas
- [ ] Add `capabilities` field to `kinetiks_synapses` table (JSON column) if not already in migration
- [ ] Commit: `feat(synapse): add command handler interface and capability types`

### Task 2: Capability Registry
- [ ] Create API route `api/synapse/register/route.ts` — Synapse registers capabilities on activation
- [ ] Create API route `api/synapse/capabilities/route.ts` — update capabilities
- [ ] Build capability matching function: given a parsed intent, score each registered Synapse on relevance
- [ ] Store capabilities in `kinetiks_synapses.capabilities` column
- [ ] Commit: `feat(router): add capability registry with registration and matching`

### Task 3: Extended Intent Classification
- [ ] Update `lib/marcus/intent.ts` to detect command intents (query, action, configuration)
- [ ] Add subject extraction and parameter parsing to intent output
- [ ] Add confidence scoring — if < 70%, Marcus asks a clarifying question
- [ ] Add conversational context awareness (pronoun resolution: "do that for healthcare too")
- [ ] Write tests for: command detection, query vs action vs config classification, ambiguity handling
- [ ] Commit: `feat(marcus): extend intent classifier with command detection`

### Task 4: Command Translation
- [ ] Create `lib/marcus/command-translator.ts` — converts parsed intent into structured `SynapseCommand`
- [ ] Create `ai/prompts/marcus-command.ts` — prompt that takes intent + capability registry schema and produces valid commands
- [ ] Build context packaging: select relevant Cortex layers, active goals, conversation context (token-budgeted to ~4000 tokens)
- [ ] Build multi-app dispatch plan generation for commands spanning multiple apps (parallel vs sequential with dependencies)
- [ ] Write tests for: single-app translation, multi-app plan generation, context packaging
- [ ] Commit: `feat(router): add command translation with context packaging`

### Task 5: Dispatch and Response
- [ ] Create `lib/marcus/command-dispatcher.ts` — dispatch via Supabase Realtime channels, HTTP fallback
- [ ] Implement single-app dispatch with timeout handling (configurable per command, default 30s)
- [ ] Implement parallel multi-app dispatch
- [ ] Implement sequential dispatch with dependency tracking
- [ ] Implement progress streaming (Realtime updates rendered as Chat status messages)
- [ ] Create `lib/marcus/command-aggregator.ts` — collect results from all dispatched commands, format unified response
- [ ] Handle partial failure: present what succeeded, explain what failed, suggest next steps
- [ ] Implement retry logic: 3 attempts with exponential backoff for failed dispatches
- [ ] Implement rate limiting: 10 commands/minute, 50 commands/hour per account
- [ ] Commit: `feat(router): add command dispatch with streaming, aggregation, and error handling`

### Task 6: Marcus Integration
- [ ] Create `api/marcus/command/route.ts` — full pipeline endpoint (classify → route → translate → dispatch → aggregate → respond)
- [ ] Wire command pipeline into Marcus conversation engine: when intent is 'command', diverge into command pipeline
- [ ] Build command confirmation flow: for action commands, present plan before dispatch (skippable with "just" prefix)
- [ ] Build refinement handling: "actually, make it 5 touches" modifies the previous command
- [ ] Build conversation + command interleaving in the same thread
- [ ] Commit: `feat(marcus): integrate command router into conversation engine`

### Task 7: First App Test (Harvest)
- [ ] Define Harvest capabilities (queries: prospect_list, sequence_status, reply_rates; actions: create_sequence, send_email, pause_sequence; configs: email_cadence, sequence_pause)
- [ ] Implement Harvest's Synapse command handler (in apps/hv, extending the base handler from packages/synapse)
- [ ] Register Harvest capabilities
- [ ] End-to-end test: "Show me reply rates" → query dispatched → data returned → rendered in Chat
- [ ] End-to-end test: "Build a sequence for fintech CFOs" → action dispatched → work produced → approval created
- [ ] End-to-end test: "Pause all outbound" → config dispatched → change applied → confirmation in Chat
- [ ] Commit: `feat(router): wire Harvest as first integrated app with command handling`

### Task 8: End-to-End Verification
- [ ] Query command works: user asks a question, data returned from app, rendered in Chat
- [ ] Action command works: user gives directive, work produced, flows to approval system
- [ ] Config command works: user changes a setting, applied immediately, confirmed in Chat
- [ ] Multi-app: command touching two apps dispatches in parallel, results aggregated
- [ ] Timeout: slow app gets timeout message, user informed
- [ ] Clarification: ambiguous command prompts a question, user clarifies, command executes
- [ ] Refinement: "actually change it to X" modifies previous command
- [ ] Confirmation: action command shows plan, user confirms, then dispatches
- [ ] `pnpm build` passes
- [ ] Commit: `chore: phase 4 complete — cross-app command router verified`
