# Cross-App Command Router Spec

> **This is the specification for Kinetiks cross-app command routing — how Marcus orchestrates actions across the entire GTM system through natural language.**
> This system is what makes the Chat tab a real command interface, not just a chatbot.
> Read `docs/kinetiks-product-spec-v3.md` Sections 5.4 and 10.3-10.6 for product context.

---

## 1. Overview

When a user types a directive in Chat, the system needs to figure out what they want, which app(s) are involved, translate the intent into specific actions, execute them, and present a unified response. This happens through a pipeline that extends Marcus's existing conversation engine with command parsing and Synapse-level communication.

The command router is the layer between "the user said something" and "the right agents are doing the right work." Without it, Chat is a conversational interface that can only talk about things. With it, Chat is an operational interface that can do things.

---

## 2. Command Types

Every command the user issues falls into one of three categories:

### 2.1 Query Commands

The user wants information. No action is taken in the world.

**Examples:**
- "How's our outbound performing this week?"
- "Show me the top 10 prospects in the pipeline."
- "What's our best-performing content topic?"
- "How many emails did we send yesterday?"
- "What's the status of the fintech sequence?"

**Flow:** Marcus → parse intent → identify target app(s) → send Query Command to Synapse(s) → receive data → format response → deliver in Chat.

**Approval:** Never. Queries are read-only.

### 2.2 Action Commands

The user wants something done. Creates work products or triggers execution.

**Examples:**
- "Build a 3-touch sequence targeting fintech CFOs about our new pricing."
- "Draft a blog post about AI security trends."
- "Send a follow-up to Jane at Acme."
- "Add these 50 prospects to the enterprise sequence."
- "Pitch this story to TechCrunch."

**Flow:** Marcus → parse intent → identify target app(s) → send Action Command to Synapse(s) → agents do work → results flow to approval system → queued or auto-approved → response delivered in Chat.

**Approval:** Yes, unless auto-approved by confidence gate. The work product flows through the standard approval pipeline (brand gate → quality gate → classify → confidence check → queue or auto-approve).

### 2.3 Configuration Commands

The user wants to change how the system operates. Adjusts settings, parameters, or behavior.

**Examples:**
- "Pause all outbound to healthcare until the compliance doc is updated."
- "Never auto-send cold emails."
- "Change the follow-up cadence to 3 days instead of 5."
- "Set my content publishing schedule to twice a week."
- "Auto-approve all social posts."

**Flow:** Marcus → parse intent → identify target app(s) and/or system settings → send Configuration Command → execute change → confirm in Chat.

**Approval:** Configuration commands that affect the approval system itself (threshold changes, override rules) are applied immediately because the user is explicitly setting policy. Configuration commands that affect app behavior (pause sequences, change cadence) are applied immediately for Kinetiks-connected users since the user is giving a direct instruction. Both are logged in the Ledger.

---

## 3. The Command Pipeline

### 3.1 Step 1: Intent Classification

Marcus's existing intent classifier is extended with a `command` intent type. The classifier determines:

1. **Is this a command or a conversation?** "I'm thinking about expanding into enterprise" is conversation (strategic discussion). "Build a sequence targeting enterprise" is a command.

2. **What type of command?** Query, Action, or Configuration.

3. **What's the subject?** What entities, segments, apps, or concepts are referenced?

The intent classifier runs as the first step in Marcus's conversation pipeline. It uses Claude Sonnet with the full conversation history and a structured output format:

```typescript
interface CommandIntent {
  is_command: boolean;
  command_type: 'query' | 'action' | 'configuration' | null;
  subject: string;              // What the command is about
  target_apps: string[];        // Which apps are likely involved (best guess)
  parameters: Record<string, any>;  // Extracted parameters (segment, timeframe, etc.)
  requires_clarification: boolean;
  clarification_question: string | null;
  confidence: number;           // 0-100, how confident the parse is
}
```

**Ambiguity handling:** If the classifier can't determine the intent with >70% confidence, Marcus asks a clarifying question before proceeding. "I want to do something about fintech" → "Do you want me to build an outreach sequence, draft content, or something else?"

**Conversation context:** The classifier has access to the full thread history. "Do that for healthcare too" references the previous command and applies it to a new segment.

### 3.2 Step 2: App Routing

Once the intent is parsed, the router determines which app(s) should handle the command. This uses the **capability registry** — a mapping of what each connected app can do.

**The capability registry:**

Each Synapse registers its capabilities when activated. Stored in `kinetiks_synapses.capabilities`:

```typescript
interface SynapseCapabilities {
  app_name: string;
  queries: string[];       // What data this app can provide
  actions: string[];       // What actions this app can perform
  configurations: string[]; // What settings this app exposes
  entity_types: string[];  // What entities this app works with (prospects, articles, pitches, etc.)
}
```

**Example Harvest capabilities:**
```json
{
  "app_name": "harvest",
  "queries": ["prospect_list", "sequence_status", "pipeline_summary", "reply_rates", "email_performance", "prospect_detail"],
  "actions": ["create_sequence", "add_prospects", "send_email", "draft_email", "pause_sequence", "resume_sequence", "create_prospect_list", "enrich_prospects"],
  "configurations": ["email_cadence", "sequence_pause", "targeting_criteria", "sending_schedule"],
  "entity_types": ["prospect", "sequence", "email", "pipeline_deal"]
}
```

**Routing logic:**

```typescript
function routeCommand(intent: CommandIntent, registry: SynapseCapabilities[]): RoutingResult {
  const targets: RouteTarget[] = [];

  for (const synapse of registry) {
    const relevance = calculateRelevance(intent, synapse);
    if (relevance > 0.5) {
      targets.push({ app: synapse.app_name, relevance, capabilities: matchedCapabilities });
    }
  }

  // Sort by relevance, handle multi-app
  return {
    targets: targets.sort((a, b) => b.relevance - a.relevance),
    is_multi_app: targets.length > 1,
    orchestration_needed: targets.length > 1 && intent.command_type === 'action'
  };
}
```

**Multi-app detection:** Some commands clearly target one app ("show me reply rates" → Harvest). Others span multiple apps ("launch a campaign with blog content, outbound sequences, and PR pitches" → Dark Madder + Harvest + Litmus). The router identifies all relevant apps and flags whether orchestration is needed.

**No matching app:** If no connected app can handle the command, Marcus tells the user: "I can't do that yet — it would require [App Name] which isn't activated. Want me to tell you more about it?" This is a natural cross-sell moment, not a hard sell.

### 3.3 Step 3: Command Translation

The natural language intent must be translated into a structured command that the target Synapse can execute. This is where Marcus turns "build a 3-touch sequence targeting fintech CFOs about our new pricing" into:

```typescript
interface SynapseCommand {
  command_id: string;           // Unique ID for tracking
  type: 'query' | 'action' | 'configuration';
  target_app: string;
  operation: string;            // Matches a registered capability
  parameters: Record<string, any>;
  context: CommandContext;       // Relevant Cortex data for the app to use
  timeout_ms: number;           // How long to wait for response
  priority: 'normal' | 'urgent';
}

interface CommandContext {
  account_id: string;
  cortex_layers: Record<string, any>;  // Relevant layers (ICP from Customers, voice from Voice, etc.)
  goals: Goal[];                        // Active goals for prioritization
  conversation_context: string;         // Recent chat context for the agent
}
```

**Example translation:**

User: "Build a 3-touch sequence targeting fintech CFOs about our new pricing"

```json
{
  "command_id": "cmd_abc123",
  "type": "action",
  "target_app": "harvest",
  "operation": "create_sequence",
  "parameters": {
    "touches": 3,
    "segment": {
      "industry": "fintech",
      "title": "CFO"
    },
    "topic": "new pricing",
    "tone_guidance": "Use the calibrated voice. Reference the pricing changes."
  },
  "context": {
    "cortex_layers": {
      "voice": { /* relevant voice data */ },
      "products": { /* pricing details */ },
      "customers": { /* fintech CFO persona */ }
    },
    "goals": [ /* active outbound goals */ ]
  },
  "timeout_ms": 30000,
  "priority": "normal"
}
```

The translation uses Claude Sonnet with the capability registry schema as context. The prompt includes the registered operations and their expected parameter schemas so the translation produces valid, executable commands.

### 3.4 Step 4: Dispatch

Commands are dispatched to the target Synapse(s) through Supabase Realtime channels. Each Synapse listens on a dedicated channel.

**Single-app dispatch:** Send the command, wait for response.

**Multi-app dispatch (orchestration):** When a command spans multiple apps, the router dispatches in parallel by default. If there are dependencies (e.g., "create the blog post, then include it in the outreach sequence"), the router identifies the dependency chain and dispatches sequentially.

```typescript
interface DispatchPlan {
  steps: DispatchStep[];
  parallel: boolean;
}

interface DispatchStep {
  commands: SynapseCommand[];   // Commands in this step (parallel within step)
  depends_on: string[];          // command_ids from previous steps that must complete first
}
```

**Example orchestration:**

User: "Launch a campaign: blog post about AI security, outbound sequence to CISO prospects referencing the post, PR pitch to cybersecurity journalists."

```
Step 1 (parallel):
  - Dark Madder: draft blog post about AI security
  - Harvest: build CISO prospect list
  - Litmus: identify cybersecurity journalists

Step 2 (depends on Step 1):
  - Harvest: create outbound sequence referencing the blog post URL
  - Litmus: draft PR pitch referencing the blog post

Step 3 (all complete):
  - Aggregate results, present unified plan to user
  - Route each work product to approval system
```

### 3.5 Step 5: Synapse Command Handler

On the app side, the Synapse receives the command and routes it to the appropriate internal Operator(s). The Synapse command handler is a standard interface that every app Synapse must implement:

```typescript
interface SynapseCommandHandler {
  // Handle incoming command from Cortex
  handleCommand(command: SynapseCommand): Promise<CommandResponse>;

  // Report capabilities (called during Synapse registration)
  getCapabilities(): SynapseCapabilities;

  // Health check
  ping(): Promise<boolean>;
}

interface CommandResponse {
  command_id: string;
  status: 'completed' | 'pending_approval' | 'failed' | 'partial';
  result: Record<string, any>;       // Command-specific result data
  approval_submission?: ApprovalSubmission;  // If work product needs approval
  error?: string;
  execution_time_ms: number;
}
```

**For query commands:** The Synapse queries its database, formats the response, and returns the data immediately.

**For action commands:** The Synapse routes to the appropriate internal Operator, which does the work (drafts the email, builds the sequence, etc.). The work product is returned in the response. If it needs approval, the Synapse also submits it to the approval system and includes the approval reference in the response.

**For configuration commands:** The Synapse applies the configuration change and confirms.

### 3.6 Step 6: Response Aggregation

When all commands complete (or timeout), Marcus aggregates the results into a coherent response:

**Single-app query:** Format the data and present it in Chat. May include tables, charts, or structured data blocks.

**Single-app action:** Report what was done and what's pending approval. "I've drafted a 3-touch sequence for fintech CFOs. Here's a preview: [summary]. It's in your approval queue."

**Multi-app orchestration:** Present a unified plan. "Here's the campaign plan:
- Blog post on AI security: drafted, in your review queue
- CISO prospect list: 47 prospects identified, ready for sequence
- Outbound sequence: built, pending your approval after the blog post is approved
- PR pitch: drafted for 3 cybersecurity journalists, in your review queue"

**Partial failure:** If some commands succeed and others fail: present what worked, explain what failed, suggest next steps. "The blog post draft is ready, but I couldn't build the prospect list because the enrichment service is down. I'll retry in an hour."

**Timeout:** If a command doesn't respond within its timeout: "Harvest is taking longer than expected to build the prospect list. I'll let you know when it's ready." Track the command and deliver the result asynchronously when it arrives.

---

## 4. The Capability Registry

### 4.1 Registration

When an app's Synapse is activated, it registers its capabilities with the Cortex. This registration is stored in `kinetiks_synapses.capabilities` and used by the command router.

```
POST /api/synapse/register
```

```typescript
interface SynapseRegistration {
  app_name: string;
  app_url: string;
  capabilities: SynapseCapabilities;
  realtime_channel: string;      // Supabase Realtime channel for commands
}
```

### 4.2 Capability Schema

Each capability is described with enough detail for the command translator to generate valid commands:

```typescript
interface CapabilityDefinition {
  name: string;                  // 'create_sequence'
  type: 'query' | 'action' | 'configuration';
  description: string;           // Natural language description for matching
  parameters: ParameterSchema[]; // Expected parameters
  returns: string;               // Description of what this returns
  requires_approval: boolean;    // Does this generate work needing approval?
  estimated_duration_ms: number; // How long this typically takes
}

interface ParameterSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default_value?: any;
}
```

### 4.3 Capability Updates

Apps can update their capabilities as they evolve:

```
PUT /api/synapse/capabilities
```

This allows apps to add new capabilities, deprecate old ones, or update parameter schemas without re-registration. The command router always uses the latest registered capabilities.

### 4.4 Registry as Routing Intelligence

The capability registry doesn't just list what apps can do — it helps Marcus understand the system's total capability. When the user asks "what can you do?", Marcus reads the registry and generates a contextual response: "With Harvest and Dark Madder active, I can manage your outbound sequences, draft and publish content, track email and content performance, and coordinate campaigns across both."

When a new app is activated, the registry expands and Marcus's capabilities grow automatically. No prompt changes needed.

---

## 5. Conversational Context in Commands

Commands don't exist in isolation. They carry conversational context that helps the target app's agents produce better work.

### 5.1 What Context is Included

Every command includes:

**Cortex data (relevant layers only):** The command translator selects which Context Structure layers are relevant. A sequence-building command includes Voice, Customers, Products. A content-drafting command includes Voice, Narrative, Market, Competitive. Not all layers for every command — token budget matters.

**Active goals:** The user's current goals, so the app's agents can factor them into decision-making. If "generate 50 leads/month" is the top goal, Harvest agents prioritize lead volume.

**Conversation context:** A summary of the relevant chat thread. If the user said "focus on the security angle" three messages ago, that context carries into the command so the agent doesn't revert to generic messaging.

**Prior command results:** If this command depends on a prior command's output (e.g., "now build a sequence referencing that blog post"), the prior result is included.

### 5.2 Context Size Management

Context is token-budgeted per command to keep payloads reasonable:

- **Cortex layers:** Compressed to relevant fields only (not the full layer data)
- **Goals:** Active goals only, summarized
- **Conversation context:** Last 5 relevant messages, summarized by Haiku if too long
- **Prior results:** Referenced by ID with summary, not full content

Maximum context payload: ~4000 tokens per command. This keeps Synapse processing fast and focused.

---

## 6. Error Handling

### 6.1 Synapse Unavailable

The target app's Synapse is down or unreachable:

- Retry with exponential backoff (3 attempts: 1s, 5s, 15s)
- If still unavailable: inform the user, suggest alternatives
- "Harvest seems to be unavailable right now. I've queued the command and will execute it when it's back. Want me to draft the sequence content in the meantime?"

### 6.2 Command Rejected by Synapse

The Synapse receives the command but can't execute it (missing data, invalid parameters, etc.):

- The Synapse returns a structured error with reason
- Marcus interprets the error and communicates it naturally
- "I can't build that sequence because we don't have any fintech CFO prospects in the database yet. Want me to build a prospect list first?"

### 6.3 Partial Results

A multi-step command where some steps succeed and others fail:

- Present what succeeded
- Explain what failed with actionable next steps
- Offer to retry the failed steps or adjust the plan

### 6.4 Conflicting Commands

User issues a command that conflicts with a previous one:

- Detect the conflict before dispatch
- Present both options: "You asked me to pause outbound to healthcare earlier. This new sequence targets healthcare CISOs. Should I resume healthcare outreach, or adjust this sequence to exclude healthcare?"

### 6.5 Rate Limiting

To prevent runaway agents:

- Maximum 10 commands per minute per account
- Maximum 50 commands per hour per account
- Commands beyond the limit are queued with a notification: "I'm handling a lot right now. This command is queued and will execute in a few minutes."

---

## 7. Streaming Responses

For action commands that take time (drafting content, building prospect lists), the response should stream progress to the user rather than blocking:

### 7.1 Progress Updates

The Synapse can send intermediate progress updates through the Realtime channel:

```typescript
interface CommandProgress {
  command_id: string;
  stage: string;                // 'enriching_prospects', 'drafting_email_1', 'running_quality_check'
  progress: number;             // 0-100
  message: string;              // Human-readable progress update
}
```

Marcus renders these as real-time updates in the Chat: "Building your fintech sequence... Finding prospects (23 found so far)... Drafting email 1 of 3..."

### 7.2 Incremental Results

For commands that produce multiple outputs (a multi-touch sequence), results can stream incrementally:

- Email 1 drafted → show preview immediately
- Email 2 drafted → append to display
- Email 3 drafted → show complete sequence
- All done → route to approval system

This gives the user visibility into what's happening and the ability to intervene early: "Actually, skip the third touch and make it a 2-touch."

---

## 8. Marcus Integration

### 8.1 Extended Intent Classification

Marcus's intent classifier gains a new intent type:

```typescript
type IntentType =
  | 'strategic'       // Strategic discussion, advice
  | 'tactical'        // Specific operational question
  | 'support'         // Product help, guidance
  | 'data'            // Analytics question (routed to Oracle)
  | 'command'          // Action directive (routed to command pipeline)
  | 'implicit_intel';  // Conversation contains intelligence to extract
```

When `intent_type === 'command'`, Marcus's pipeline diverges into the command pipeline instead of the standard conversation flow.

### 8.2 Conversation + Command Interleaving

A single thread can mix conversation and commands:

```
User: "I'm thinking about targeting enterprise more aggressively."
Marcus: [strategic conversation about enterprise strategy]

User: "OK let's do it. Build a sequence for enterprise VPs."
Marcus: [recognizes command, enters command pipeline, dispatches to Harvest]

User: "Actually, focus on VP Engineering specifically."
Marcus: [recognizes refinement of previous command, updates and re-dispatches]

User: "How's the current pipeline looking while we wait?"
Marcus: [recognizes query, dispatches to Harvest or Oracle]
```

The thread maintains full context. Refinements reference prior commands. Questions can be asked while commands are executing.

### 8.3 Command Confirmation

For action commands, Marcus confirms the plan before dispatching (unless the user has opted out of confirmation for routine commands):

User: "Build a sequence for fintech CFOs"
Marcus: "I'll create a 3-touch email sequence targeting fintech CFOs, using the security messaging angle that's been performing well. The sequence will include personalized opening, value prop follow-up, and case study close. Sound good?"
User: "Yes" / "Make it 5 touches" / "Use the cost savings angle instead"

This confirmation step prevents wasted work on misunderstood commands. For query and configuration commands, no confirmation is needed — the system executes immediately.

**Confirmation bypass:** The user can prefix commands with "just" to skip confirmation: "Just build a sequence for fintech CFOs" → immediate dispatch. Or they can set a preference: "Don't ask me to confirm commands, just do them."

---

## 9. API Design

### 9.1 Command Dispatch (internal — Marcus to Synapse)

Commands are dispatched via Supabase Realtime, not HTTP. This allows:
- Real-time progress streaming
- Lower latency for simple queries
- Connection persistence across multiple commands

**Channel format:** `synapse:{app_name}:{account_id}`

**Message format:**
```typescript
// Outgoing (to Synapse)
{ type: 'command', payload: SynapseCommand }

// Incoming (from Synapse)
{ type: 'progress', payload: CommandProgress }
{ type: 'result', payload: CommandResponse }
{ type: 'error', payload: { command_id: string, error: string } }
```

### 9.2 Command Route (HTTP — for orchestration)

```
POST /api/marcus/command
```

Called by the Chat interface when the user sends a message identified as a command. This endpoint runs the full command pipeline: intent classification → app routing → command translation → dispatch → aggregation → response.

```typescript
interface CommandRequest {
  thread_id: string;
  message: string;               // The user's raw message
  conversation_history: Message[]; // Recent thread context
}

interface CommandResult {
  response_text: string;          // Marcus's formatted response for the Chat
  commands_dispatched: DispatchedCommand[];
  approvals_created: string[];    // Approval IDs for any work products
  pending_commands: string[];     // Commands still executing (async)
}
```

### 9.3 Synapse Command Endpoint (HTTP — fallback)

```
POST /api/synapse/command
```

HTTP fallback for when Realtime isn't available. The Synapse exposes this endpoint for direct command delivery. Same interface as the Realtime message format.

---

## 10. Implementation Priority

This system is built in Phase 4 of the build plan. Dependencies:

**Requires (from earlier phases):**
- Phase 1: Chat tab with message input and streaming responses
- Phase 2: Approval system (action commands produce work that flows to approvals)
- Phase 3: Cortex with goals (context for commands) and integrations view (Synapse management)
- Marcus conversation engine (existing) with intent classification

**Does not require:**
- Phase 5: Oracle / Analytics (query commands can work without Oracle initially)
- Phase 6: Agent communication layer

### 10.1 Build Order Within Phase 4

1. **Extended intent classification:**
   - Update `lib/marcus/intent.ts` to detect command intents
   - Add command type classification (query/action/configuration)
   - Add subject and parameter extraction

2. **Capability registry:**
   - Add `capabilities` field to `kinetiks_synapses` table (if not already in migration)
   - Build registration and update endpoints
   - Create capability matching logic for app routing

3. **Command translation:**
   - Build `lib/marcus/command-router.ts` — the core routing logic
   - Build command translation prompts (`ai/prompts/marcus-command.ts`)
   - Build dispatch plan generation for multi-app commands

4. **Synapse command handler template:**
   - Update `packages/synapse/` with command handler interface
   - Build the standard command handler that apps extend
   - Build Realtime channel listener for incoming commands

5. **Dispatch and aggregation:**
   - Build single-app dispatch with Realtime
   - Build multi-app parallel dispatch
   - Build sequential dispatch with dependency tracking
   - Build response aggregation for multi-app results
   - Build progress streaming

6. **Marcus integration:**
   - Wire command pipeline into Marcus's conversation engine
   - Build command confirmation flow
   - Build refinement handling (modifying previous commands)
   - Build interleaving (conversation + commands in same thread)

7. **Error handling:**
   - Timeout handling and retry logic
   - Conflict detection
   - Rate limiting
   - Graceful degradation messaging

8. **First app integration (Harvest):**
   - Register Harvest's capabilities
   - Implement Harvest's Synapse command handler for core operations
   - End-to-end test: user command → Harvest action → approval queue
