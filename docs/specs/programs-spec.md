# Kinetiks Platform Addendum: Programs, Policies, and Operational Integrity

> **This addendum introduces six architectural upgrades to the Kinetiks platform.**
> These are not new products or features. They are structural improvements to how the system plans, governs, executes, verifies, and traces GTM work. They make the difference between a system that generates work and a system that compounds intelligence over time.
> This document depends on and extends: the GTM Autopilot Spec, the Approval System Spec, the Analytics & Goals Engine Spec, the Cross-App Command Router Spec, and the Platform Contract.

---

## 1. Programs: Persistent Orchestration Above Workstreams

### 1.1 The Problem with Flat Workstreams

The GTM Autopilot spec introduces workstreams — groups of work items that advance a goal through a specific app. Workstreams are generated weekly and execute daily. But workstreams are ephemeral. They're replanned every Monday. They don't accumulate learnings across weeks. They don't survive strategic pivots. They have no memory of what worked last month.

Real GTM operations aren't weekly sprints — they're persistent programs. An outbound motion targeting fintech CFOs doesn't start fresh each week. It compounds: the messaging angle sharpens, the prospect pool refines, the reply patterns become predictable, the follow-up cadence optimizes. A content engine doesn't reset — it builds topical authority over months. A PR effort builds journalist relationships across quarters.

### 1.2 The Hierarchy

Kinetiks adopts a four-level execution hierarchy:

```
Goal (from Cortex)
  └── Program (persistent, long-running)
        └── Workflow (structured sequence of tasks, recurring or one-shot)
              └── Task (atomic unit of work, routed to a specific app)
```

**Goals** already exist in Cortex. They define what the user wants to achieve ("Generate 50 qualified leads per month"). Goals don't change.

**Programs** are new. A Program is a persistent container that owns the strategy for advancing a goal through a specific approach. Programs live for weeks, months, or quarters. They accumulate learnings, track cumulative outcomes, and get harder to break over time.

**Workflows** replace what the Autopilot spec calls "workstreams." A Workflow is a structured sequence of Tasks — a directed graph with dependencies, conditional branches, and approval checkpoints. Workflows can be recurring (the weekly blog engine) or one-shot (launch a PR campaign around a funding announcement). Workflows live inside Programs.

**Tasks** replace what the Autopilot spec calls "work items." A Task is the atomic unit — a single action routed to a single app. Draft an email. Research prospects. Publish a blog post. Tasks have typed schemas, explicit inputs and outputs, dependencies, and completion criteria.

### 1.3 Program Schema

```typescript
interface Program {
  id: string;
  account_id: string;
  goal_id: string;                     // Which goal this advances
  name: string;                        // "Fintech Outbound Program"
  description: string;                 // Strategic rationale
  approach: string;                    // The lever being exercised
  
  // Lifecycle
  status: 'proposed' | 'active' | 'paused' | 'completed' | 'archived';
  created_at: string;
  activated_at: string | null;
  paused_at: string | null;
  
  // Apps and capabilities
  primary_app: string;                 // The main app this program uses
  supporting_apps: string[];           // Additional apps involved
  
  // Intelligence (accumulated over time)
  learned_preferences: LearnedConstraint[];  // From Autopilot feedback loop
  performance_history: ProgramMetrics[];     // Weekly snapshots
  incident_count: number;                    // Failures encountered and recovered from
  
  // Governance
  policies: string[];                  // IDs of active policies applied to this program
  approval_overrides: ApprovalOverride[];  // Program-level approval rules
  budget_envelope: BudgetEnvelope | null;
  
  // Workflows
  active_workflows: string[];          // IDs of currently running workflows
  workflow_templates: string[];        // Reusable workflow definitions
}

interface ProgramMetrics {
  week_start: string;
  tasks_generated: number;
  tasks_approved: number;
  tasks_rejected: number;
  tasks_completed: number;
  edit_rate: number;                   // Percentage of approvals with edits
  goal_contribution: number;           // Measured impact on parent goal
  cost_seeds: number;                  // Seeds consumed
  cost_budget: number;                 // External budget consumed
}
```

### 1.4 What Programs Change

**Planning shifts from weekly batches to program management.** The Autopilot's weekly planning cycle no longer generates flat workstreams. Instead, it:

1. Reviews each active Program's performance and health
2. Adjusts Workflows within Programs based on Oracle data
3. Proposes new Programs when goal gaps aren't covered by existing ones
4. Proposes retiring or pausing Programs that aren't producing results
5. Generates the week's Tasks by executing each Program's active Workflows

**Learnings compound.** When a user edits every email in a fintech sequence to be shorter, that constraint lives in the Program — not globally. The Outbound Program knows "short emails" while the Content Program might learn "long-form preferred." Constraints are scoped to Programs first, then elevated to account-level only when they appear across multiple Programs.

**Programs survive replans.** When the user says "pivot from enterprise to SMB," the Enterprise Outbound Program pauses (preserving its learnings for potential reactivation) and a new SMB Outbound Program is created. The system doesn't lose what it learned about enterprise — it shelves it.

**Programs enable cross-app orchestration.** A "Product Launch Program" can own Workflows that span Dark Madder (content), Harvest (outbound), Litmus (PR), and Hypothesis (landing page). The Program is the coordination point — it knows the launch date, the messaging framework, the target audience, and which Workflow depends on which.

### 1.5 Workflow Schema

```typescript
interface Workflow {
  id: string;
  program_id: string;
  account_id: string;
  name: string;                        // "Weekly Blog Engine"
  description: string;
  
  // Structure
  tasks: WorkflowTask[];               // The task graph
  edges: WorkflowEdge[];               // Dependencies between tasks
  checkpoints: ApprovalCheckpoint[];    // Hard gates requiring human approval
  branches: ConditionalBranch[];       // If/then paths based on outcomes
  
  // Cadence
  trigger: WorkflowTrigger;
  
  // Lifecycle
  status: 'template' | 'active' | 'running' | 'paused' | 'completed' | 'failed';
  run_count: number;                   // How many times this workflow has executed
  last_run_at: string | null;
  next_run_at: string | null;
  
  // Learning
  avg_completion_time_hours: number;
  avg_approval_rate: number;
  failure_count: number;
}

interface WorkflowTrigger {
  type: 'recurring' | 'event' | 'manual';
  // Recurring: "every Monday", "twice per week", "monthly"
  schedule: string | null;
  // Event: "when Oracle detects reply rate drop > 10%"
  event_condition: string | null;
}

interface WorkflowEdge {
  from_task_id: string;
  to_task_id: string;
  condition: string | null;            // null = always, otherwise evaluated
}

interface ApprovalCheckpoint {
  after_task_id: string;               // Pause after this task completes
  approval_type: 'quick' | 'review' | 'strategic';
  description: string;                 // What the user is approving
  timeout_hours: number;               // How long to wait
  timeout_action: 'auto_promote' | 'pause' | 'cancel';
}

interface ConditionalBranch {
  at_task_id: string;
  condition: string;                   // "if reply_rate < 10%"
  true_path: string[];                 // Task IDs to execute if true
  false_path: string[];                // Task IDs to execute if false
}
```

### 1.6 Task Schema

```typescript
interface Task {
  id: string;
  workflow_id: string;
  program_id: string;
  account_id: string;
  
  // Identity
  name: string;                        // "Draft fintech CFO intro email"
  type: TaskType;
  target_app: string;                  // Which app handles this
  
  // Execution
  context_pack: ContextPack;           // Scoped context (see Section 4)
  command: SynapseCommand | null;      // Built when task executes
  
  // Dependencies
  depends_on: string[];                // Task IDs that must complete first
  inputs: TaskInput[];                 // Data from predecessor tasks
  
  // Completion
  completion_criteria: CompletionCriteria;
  outputs: TaskOutput[];               // What this task produces
  
  // Lifecycle
  status: 'planned' | 'queued' | 'generating' | 'pending_approval' 
        | 'approved' | 'executing' | 'verifying' | 'completed' 
        | 'failed' | 'cancelled';
  approval_id: string | null;
  verification_result: VerificationResult | null;  // See Section 3
  
  // Tracing
  correlation_id: string;             // See Section 5
  
  // Timing
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
}

type TaskType = 
  | 'research'         // Gather information
  | 'draft'            // Generate content or creative
  | 'optimize'         // Improve existing work based on data
  | 'publish'          // Push approved work live
  | 'configure'        // Change app settings or targeting
  | 'analyze'          // Run analytics or generate insights
  | 'outreach'         // Send communications
  | 'monitor';         // Watch for signals or outcomes

interface CompletionCriteria {
  type: 'approval' | 'automated' | 'verification';
  // 'approval': task completes when user approves the output
  // 'automated': task completes when the app confirms execution
  // 'verification': task completes when post-execution verification passes
  validation_rules: string[];          // App-specific quality checks
  policy_checks: string[];             // Policy IDs that must pass
}
```

### 1.7 Example: How a Goal Becomes Daily Work

```
Goal: "Generate 50 qualified leads per month"

Programs spawned:
├── Fintech Outbound Program (Harvest)
│   ├── Workflow: Weekly Prospect Sourcing (recurring, Monday)
│   │   ├── Task: Research fintech companies matching ICP (research)
│   │   ├── Task: Enrich prospects with contact data (research)
│   │   └── Task: Add qualified prospects to sequence (configure)
│   │
│   ├── Workflow: Sequence Execution (recurring, daily)
│   │   ├── Task: Generate personalized emails for today's sends (draft)
│   │   ├── Checkpoint: Approve email batch
│   │   └── Task: Send approved emails (outreach)
│   │
│   └── Workflow: Reply Handling (event-triggered: new reply detected)
│       ├── Task: Classify reply intent (analyze)
│       ├── Branch: if positive → Draft follow-up (draft)
│       ├── Branch: if objection → Draft objection handler (draft)
│       └── Branch: if meeting request → Confirm and schedule (configure)
│
├── Security Content Program (Dark Madder)
│   └── Workflow: Biweekly Blog Engine (recurring, every other Monday)
│       ├── Task: Identify trending security keywords from GSC (research)
│       ├── Task: Draft blog post outline (draft)
│       ├── Checkpoint: Approve outline
│       ├── Task: Draft full blog post (draft)
│       ├── Checkpoint: Approve post
│       ├── Task: Publish to CMS (publish)
│       └── Task: Verify publication and index status (monitor)
│
└── PR Outreach Program (Litmus) [proposed, pending activation]
    └── [Workflow templates ready, awaiting Litmus activation]
```

Each Program persists across weeks. The Fintech Outbound Program remembers that the security angle produces 3x better reply rates. The Security Content Program remembers that long-form technical posts outperform listicles. These learnings don't reset on Monday — they compound.

---

## 2. Policy-as-Code: Declarative Governance

### 2.1 The Problem

Kinetiks currently has two governance mechanisms: brand gates (hardcoded checks against the Voice layer) and quality gates (app-specific best practices). Both are enforced during the approval pipeline — after work is generated.

This means the system generates work that violates user preferences, then catches it at the gate, then regenerates. Wasteful. More importantly, it means the system has no way to enforce user-declared rules *before* work generation. The only way to teach the system "never email healthcare companies" is to reject healthcare emails until the learned constraints engine infers the pattern. That takes 3-5 rejections minimum.

### 2.2 Policies as First-Class Objects

Policies are user-declarable rules stored in Cortex and enforced at every layer — planning, generation, approval, and execution. They are the explicit version of learned constraints. Together, explicit policies and learned constraints form the complete governance model.

```typescript
interface Policy {
  id: string;
  account_id: string;
  
  // Identity
  name: string;                        // "No healthcare outbound"
  description: string;                 // Why this policy exists
  source: 'user_declared' | 'system_recommended' | 'compliance';
  
  // Scope
  scope: PolicyScope;
  
  // Rule
  rule_type: PolicyRuleType;
  rule: PolicyRule;
  
  // Lifecycle
  status: 'active' | 'paused' | 'expired';
  version: number;                     // Incremented on every edit
  created_at: string;
  updated_at: string;
  expires_at: string | null;           // Null = permanent
  
  // Governance
  created_by: 'user' | 'system';       // User-declared vs system-recommended
  requires_approval_to_change: boolean; // Strategic policies need approval to modify
  override_count: number;               // How many times this has been overridden
}

interface PolicyScope {
  // Where this policy applies (all optional — narrower = more specific)
  apps: string[] | null;               // null = all apps
  programs: string[] | null;           // null = all programs
  task_types: TaskType[] | null;       // null = all task types
  categories: string[] | null;         // Approval categories
}

type PolicyRuleType = 
  | 'prohibition'       // "Never do X"
  | 'requirement'       // "Always include X"
  | 'constraint'        // "X must be within range Y"
  | 'preference'        // "Prefer X over Y" (soft, not hard)
  | 'budget'            // "X cannot exceed Y"
  | 'cadence'           // "Do not X more than Y times per Z"
  | 'approval_override'; // "Always/never require approval for X"

interface PolicyRule {
  // Machine-readable rule definition
  condition: string;                   // What triggers this rule
  action: 'block' | 'require_approval' | 'warn' | 'prefer' | 'cap';
  parameters: Record<string, any>;     // Rule-specific parameters
  message: string;                     // Human-readable explanation
}
```

### 2.3 Examples of Policies

**Prohibitions:**
- "Never email companies with fewer than 50 employees" → blocks prospect sourcing tasks that target small companies
- "Never mention competitor X by name in any content" → enforced at draft generation and brand gate
- "No outbound on weekends" → blocks scheduling of outreach tasks on Saturday/Sunday

**Requirements:**
- "All content must reference our SOC 2 compliance" → checked at draft generation, enforced at quality gate
- "Every cold email must include an unsubscribe link" → enforced at Harvest's quality gate (already exists as a hardcoded check — policies make it visible and user-editable)
- "Blog posts must target a keyword with at least 100 monthly searches" → enforced during research task

**Constraints:**
- "Maximum 3 follow-up emails per prospect" → enforced at sequence generation
- "Email subject lines must be under 60 characters" → enforced at draft generation
- "No more than 2 blog posts per week" → enforced at workflow scheduling

**Preferences (soft):**
- "Prefer the security messaging angle over cost savings" → weights the planning prompt, doesn't hard-block
- "Prefer shorter emails" → guides generation without rejecting longer ones
- "Prioritize LinkedIn over Twitter for social distribution" → influences channel selection

**Budget:**
- "Monthly ad spend cannot exceed $5,000" → hard cap with budget fuse
- "Content production budget: 40% SEO, 30% thought leadership, 30% product" → guides program allocation

**Cadence:**
- "No more than one PR pitch to the same journalist per quarter" → enforced at Litmus task generation
- "Maximum 20 outbound emails per day" → enforced at daily execution

**Approval overrides:**
- "Always require my approval before any cold outreach to enterprise accounts" → overrides confidence-based auto-approval
- "Auto-approve all social post drafts" → overrides default threshold

### 2.4 How Policies Are Created

**Via Chat (most common):**

```
User: "Never send cold emails to healthcare companies"
Marcus: "Got it. I've created a policy: no outbound to healthcare.
This applies to all Harvest sequences and prospect sourcing. 
I'll also remove any healthcare prospects currently in your pipeline 
queues. Want me to adjust this — for example, should it include 
health tech or just traditional healthcare?"
```

Marcus parses the intent, creates the structured policy, and confirms. The policy is immediately active and versioned.

**Via Cortex (structured):**

The Cortex > Policies view shows all active policies in a list. Users can add, edit, pause, or remove policies. Each policy shows its scope, rule, enforcement history (how many times it's been applied), and version history.

**Via approval patterns (system-recommended):**

When the learned constraints engine detects a strong pattern (5+ consistent signals), it proposes a policy: "I've noticed you always shorten my email drafts. Want me to create a policy to keep all outbound emails under 150 words?" If the user confirms, the learned constraint is promoted to an explicit policy. If not, it remains a soft constraint.

### 2.5 Enforcement Points

Policies are checked at four points in the execution pipeline:

1. **Planning** — The Strategy-to-Action Compiler reads all active policies before generating Programs, Workflows, and Tasks. Prohibitions and constraints prevent disqualified work from ever being planned.

2. **Generation** — When a Task executes and produces a work product, the generation prompt includes relevant policies as hard constraints. The AI respects them during generation, not just after.

3. **Approval pipeline** — Brand gates and quality gates check policy compliance. This is the safety net for anything the planning and generation steps missed.

4. **Post-execution verification** — After a Task completes, the Verification layer (Section 3) confirms the outcome doesn't violate any policies.

### 2.6 Policy Versioning and Audit

Every policy change creates a new version. The audit trail shows:
- Who created or modified the policy (user or system)
- What changed (diff)
- When it took effect
- How many tasks it has affected since activation

When reviewing historical work (why did the system not email healthcare last month?), the Ledger can reference the exact policy version that was active at the time.

### 2.7 Relationship to Learned Constraints

Policies and learned constraints are complementary:

| Aspect | Policies | Learned Constraints |
|--------|----------|-------------------|
| Origin | User declares or system proposes | Inferred from approval patterns |
| Strength | Hard (prohibitions, requirements) or soft (preferences) | Soft by default, with confidence scores |
| Scope | Explicit (per-app, per-program, per-task-type) | Inferred (per-category, may be imprecise) |
| Durability | Permanent until changed or expired | Decay over time without confirmation |
| Visibility | Shown in Cortex, referenced in briefs | Invisible unless promoted to policy |

The pipeline: learned constraints are the system's hypotheses about user preferences. When a hypothesis is strong enough, the system proposes promoting it to an explicit policy. Policies are the ground truth.

---

## 3. Verification and Recovery

### 3.1 The Problem

The current execution pipeline ends at "approved → executed." There is no systematic check that the execution matched the approval. If a blog post publishes with broken images, if an email sequence sends with unfilled merge fields, if an ad campaign starts spending above the expected rate — nothing in the system detects or responds to it.

The Learning Ledger logs execution events, but logging is not verification. Logging tells you what happened. Verification tells you whether what happened matches what was supposed to happen.

### 3.2 The Verification Layer

After every Task with type 'publish', 'outreach', or 'configure' completes execution, a verification step runs automatically.

```typescript
interface VerificationCheck {
  task_id: string;
  check_type: VerificationCheckType;
  expected: string;                    // What should have happened
  actual: string;                      // What actually happened
  status: 'pass' | 'fail' | 'warn' | 'pending';
  severity: 'critical' | 'major' | 'minor';
  detected_at: string;
  details: Record<string, any>;
}

type VerificationCheckType =
  | 'content_integrity'    // Published content matches approved version
  | 'delivery_success'     // Email/message was actually delivered
  | 'campaign_health'      // Ad campaign is running as expected
  | 'page_availability'    // Published page is live and accessible
  | 'budget_compliance'    // Spend is within policy limits
  | 'policy_compliance'    // Post-execution policy check
  | 'metric_sanity';       // Outcome metrics are within expected range
```

### 3.3 App-Specific Verification Checks

**Harvest (outbound):**
- Delivery: email didn't bounce, wasn't flagged as spam
- Merge fields: all personalization tokens resolved (no "[First Name]" in sent emails)
- Cadence: didn't email the same person twice within the minimum interval
- Compliance: unsubscribe link present and functional

**Dark Madder (content):**
- Publication: page is live, returns 200, and matches approved content
- SEO: meta title, description, and canonical URL are set correctly
- Images: all images load, alt text present
- Index: page is not accidentally set to noindex

**Litmus (PR):**
- Delivery: pitch email was sent and not bounced
- Exclusivity: didn't pitch the same story to competing outlets simultaneously
- Embargo: if embargoed, content isn't publicly accessible before the date

**Hypothesis (landing pages):**
- Availability: page loads under 3 seconds, all CTAs functional
- Tracking: conversion pixels and analytics tags firing
- A/B test: variants are serving correctly and traffic split matches plan

### 3.4 The Recovery Pipeline

When a verification check fails, the system doesn't just log it — it responds.

```typescript
interface Incident {
  id: string;
  task_id: string;
  program_id: string;
  account_id: string;
  
  // What happened
  verification_check: VerificationCheck;
  severity: 'critical' | 'major' | 'minor';
  
  // Response
  auto_action_taken: RecoveryAction | null;
  requires_human: boolean;
  human_prompt: string | null;         // What to ask the user
  
  // Resolution
  status: 'detected' | 'responding' | 'resolved' | 'escalated';
  resolved_at: string | null;
  resolution: string | null;
  
  // Learning
  postmortem: Postmortem | null;
}

type RecoveryAction =
  | 'pause_workflow'       // Stop the workflow until resolved
  | 'pause_program'        // Stop the entire program
  | 'rollback_task'        // Undo the executed task if possible
  | 'retry_task'           // Re-execute with the same parameters
  | 'regenerate_task'      // Re-generate the work product and re-queue for approval
  | 'notify_user'          // Surface in Chat/brief, no automatic action
  | 'adjust_policy';       // Tighten a policy to prevent recurrence
```

**Severity determines response:**

**Critical** (data loss, reputation risk, budget breach):
- Immediate automatic action: pause workflow, rollback if possible
- Urgent notification to user via all channels
- Incident requires human resolution before workflow resumes

**Major** (quality failure, delivery issue):
- Workflow continues but affected task is flagged
- Surfaced prominently in the next morning brief
- System proposes a fix: "The blog post published with a broken image. I can republish with the corrected version — approve?"

**Minor** (cosmetic, non-blocking):
- Logged in the Ledger
- Mentioned in the weekly review
- System auto-corrects if possible, otherwise notes for future generation

### 3.5 Postmortems and System Hardening

Every resolved incident generates a postmortem — a structured learning that makes the system harder to break:

```typescript
interface Postmortem {
  incident_id: string;
  root_cause: string;                  // What went wrong
  prevention: PostmortemAction[];      // What changes to prevent recurrence
  applied_at: string;
}

type PostmortemAction =
  | { type: 'policy_created'; policy: Policy }          // New policy to prevent this
  | { type: 'policy_tightened'; policy_id: string }     // Existing policy made stricter
  | { type: 'constraint_added'; constraint: LearnedConstraint }
  | { type: 'workflow_updated'; workflow_id: string; change: string }
  | { type: 'verification_added'; check: VerificationCheckType }  // New check added
  | { type: 'quality_gate_updated'; app: string; change: string };
```

Programs track their incident history. A Program that has weathered 12 incidents and has postmortem-driven policy updates is *more reliable* than a Program that has never failed — because it has been hardened by real-world feedback. This is antifragility at the system level.

---

## 4. Context Packs: Scoped Intelligence Per Task

### 4.1 The Problem

Currently, Marcus v2 builds a DataAvailabilityManifest — a comprehensive inventory of everything the system knows. This is appropriate for Marcus's conversational role (it needs broad awareness). But when the Autopilot generates a specific Task ("draft a blog post about AI security trends"), sending the entire manifest is wasteful and noisy. The Task doesn't need the user's PR strategy or their Harvest pipeline metrics. It needs the voice profile, the security-related competitive positioning, the keyword data from GSC, and the relevant content from Dark Madder's editorial calendar.

### 4.2 ContextPack Definition

A ContextPack is a minimal, scoped bundle of context assembled for a specific Task. It contains only what the executing agent needs — nothing more.

```typescript
interface ContextPack {
  task_id: string;
  
  // Business context (from Cortex, scoped to relevance)
  identity: {
    voice: VoiceProfile;                  // Always included — tone/style is universal
    relevant_products: Product[];          // Only products relevant to this task
    relevant_customers: CustomerPersona[]; // Only personas relevant to this task
    relevant_competitive: CompetitorData[]; // Only competitors relevant to this topic
    narrative_elements: string[];          // Only narrative points that apply
  };
  
  // Data context (from Oracle, scoped to relevance)
  metrics: MetricSlice[];                 // Only metrics relevant to this task
  insights: OracleInsight[];              // Only insights relevant to this domain
  
  // Historical context (from the Program)
  program_learnings: LearnedConstraint[]; // Constraints specific to this program
  prior_outcomes: PriorOutcome[];         // How similar tasks performed before
  
  // Governance context
  applicable_policies: Policy[];          // Policies that apply to this task's scope
  
  // Predecessor context (from workflow dependencies)
  upstream_outputs: TaskOutput[];         // Outputs from tasks this one depends on
  
  // Pack metadata
  assembled_at: string;
  token_estimate: number;                 // Estimated tokens for this context
  freshness: Record<string, string>;      // Last-updated timestamps per data source
}
```

### 4.3 Assembly Logic

The ContextPack assembler runs when a Task is about to execute. It:

1. Reads the Task's type, target app, and description
2. Identifies which Cortex layers are relevant (a Harvest outreach task needs Customers and Voice; a Dark Madder content task needs Voice, Products, and Competitive)
3. Pulls only the relevant slices from Oracle (metrics related to this app and goal)
4. Includes Program-scoped learned constraints (not account-wide constraints that don't apply)
5. Includes applicable policies
6. Includes outputs from predecessor tasks in the workflow
7. Estimates token count and trims if necessary (prioritizing recency and relevance)

### 4.4 Why This Matters

**Better output quality.** LLMs produce better results with focused, relevant context than with a massive dump of everything. A blog post drafted with a 800-token ContextPack of relevant competitive data and keyword insights will outperform one drafted with a 4,000-token manifest that includes irrelevant pipeline metrics.

**Lower cost.** Fewer tokens per Task means lower API costs. At scale (dozens of tasks per day), this compounds.

**Clearer attribution.** When a Task produces a bad output, the ContextPack shows exactly what information the agent had. Was the competitive data stale? Was a key policy missing? The ContextPack is the receipt.

---

## 5. Correlation IDs: End-to-End Traceability

### 5.1 The Problem

The Learning Ledger logs events. The approval system tracks approvals. The Oracle tracks metrics. But there is no single thread that connects a goal to the Program it spawned, to the Workflow that ran, to the Task that generated work, to the approval that gated it, to the execution that published it, to the outcome that resulted, to the constraint that was learned.

When a user asks "why did that email get sent?" or "what drove the improvement in reply rates this week?", answering requires manually correlating across multiple tables. The system can't easily say "the fintech sequence improvement came from a constraint learned in Program X after the user edited Task Y in Workflow Z, which was spawned by Goal W."

### 5.2 The Correlation ID

Every Goal generates a `correlation_id` that threads through every object it spawns:

```
correlation_id: "corr_abc123"

goal (kinetiks_goals)
  → program (kinetiks_programs)
    → workflow (kinetiks_workflows)
      → task (kinetiks_tasks)
        → approval (kinetiks_approvals)
        → execution job
          → verification (kinetiks_verifications)
          → incident (kinetiks_incidents)
        → outcome metric (kinetiks_analytics_metrics)
        → learned constraint (kinetiks_learned_constraints)
      → task
        → ...
```

The `correlation_id` is set at the goal level and inherited by every downstream object. A single query can retrieve the complete story of any goal's execution history.

### 5.3 Implementation

Add `correlation_id TEXT` to:
- `kinetiks_programs`
- `kinetiks_workflows` (new table from Section 1)
- `kinetiks_tasks` (replaces `kinetiks_work_items`)
- `kinetiks_approvals`
- `kinetiks_verifications` (new table from Section 3)
- `kinetiks_incidents` (new table from Section 3)
- `kinetiks_learned_constraints`
- `kinetiks_ledger` (already logs events — add correlation_id for filtering)

Index on `(account_id, correlation_id)` for fast retrieval.

### 5.4 What This Enables

**"Why did this happen?" queries in Chat.** User asks why a certain email was sent. Marcus traces the correlation_id backward: this email was Task #47 in the Weekly Outreach Workflow, part of the Fintech Outbound Program, advancing the 50-leads goal. It was auto-approved because confidence was 91% (earned over 34 consecutive approvals in this category).

**Work-item-level attribution.** The Oracle can attribute outcomes not just to channels or apps, but to specific Tasks and Workflows. "The 8 leads from fintech came from Tasks #41-#48 in the Fintech Outbound Program, specifically from the sequence using the security messaging angle."

**Program health dashboards.** Each Program shows its complete history as a correlated timeline: tasks generated, approved, completed, outcomes, incidents, learnings.

---

## 6. Time-Boxed Approval Windows

### 6.1 The Problem

The Autopilot spec handles missed approvals by expiring stale items after 24 hours (time-sensitive) or folding them forward (non-time-sensitive). But this is binary. Some work should auto-promote if not reviewed. Some should hard-pause. And the user should control which behavior applies to which type of work.

### 6.2 Configurable Approval Windows

Every approval now has a window — a deadline after which a configured action occurs.

```typescript
interface ApprovalWindow {
  timeout_hours: number;               // How long to wait
  timeout_action: ApprovalTimeoutAction;
}

type ApprovalTimeoutAction =
  | 'auto_promote'     // Approve automatically (for low-risk, high-confidence items)
  | 'pause_workflow'   // Pause the workflow until the user returns
  | 'cancel'           // Cancel the task and move on
  | 'reschedule';      // Move to the next day's batch with fresh context
```

### 6.3 Defaults by Category

| Category | Default Timeout | Default Action | Rationale |
|----------|----------------|----------------|-----------|
| Follow-up emails (in active thread) | 12 hours | auto_promote | Time-sensitive, high confidence from thread context |
| Cold outreach (first touch) | 24 hours | reschedule | Important to review, but can try again tomorrow |
| Content publish | 48 hours | pause_workflow | Not urgent, but don't publish stale content |
| PR pitch | 24 hours | cancel | News hooks expire; regenerate with fresh angle |
| Sequence configuration | 48 hours | pause_workflow | Strategic change, worth waiting for |
| Social posts | 12 hours | cancel | Timely content loses value quickly |
| Budget changes | 72 hours | pause_workflow | Never auto-approve budget changes |
| Strategic approvals | No timeout | pause_workflow | Always require explicit human decision |

### 6.4 User Overrides

Users can override defaults per category or per program via Chat or Cortex:

- "Auto-approve follow-up emails if I don't review them within 6 hours"
- "Never auto-promote anything in the enterprise outbound program"
- "If I miss a social post approval, just cancel it"

These are stored as policies (Section 2) with type `approval_override`.

### 6.5 Integration with Away Mode

During Away Mode (from the Autopilot spec), timeout actions are overridden:

- Items in auto-approved categories (Autopilot driving mode) execute normally
- All other items use the `pause_workflow` action regardless of default — no work auto-promotes while the user is explicitly away
- Exception: if the user has explicitly set `auto_promote` for a category AND the confidence threshold is met, it can still execute (the user opted in to this level of autonomy)

---

## 7. Database Schema Changes

### 7.1 New Tables

```sql
-- Programs (persistent orchestration containers)
CREATE TABLE kinetiks_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  goal_id UUID NOT NULL REFERENCES kinetiks_goals(id),
  correlation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  approach TEXT,
  primary_app TEXT NOT NULL,
  supporting_apps JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed' 
    CHECK (status IN ('proposed', 'active', 'paused', 'completed', 'archived')),
  learned_preferences JSONB NOT NULL DEFAULT '[]',
  performance_history JSONB NOT NULL DEFAULT '[]',
  incident_count INTEGER NOT NULL DEFAULT 0,
  policies JSONB NOT NULL DEFAULT '[]',
  approval_overrides JSONB NOT NULL DEFAULT '[]',
  budget_envelope JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflows (structured task graphs within programs)
CREATE TABLE kinetiks_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES kinetiks_programs(id),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  correlation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tasks JSONB NOT NULL,                -- WorkflowTask[] (task definitions, not instances)
  edges JSONB NOT NULL DEFAULT '[]',
  checkpoints JSONB NOT NULL DEFAULT '[]',
  branches JSONB NOT NULL DEFAULT '[]',
  trigger JSONB NOT NULL,              -- WorkflowTrigger
  status TEXT NOT NULL DEFAULT 'template' 
    CHECK (status IN ('template', 'active', 'running', 'paused', 'completed', 'failed')),
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  avg_completion_time_hours REAL,
  avg_approval_rate REAL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks (replaces kinetiks_work_items with richer schema)
CREATE TABLE kinetiks_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES kinetiks_workflows(id),
  program_id UUID NOT NULL REFERENCES kinetiks_programs(id),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  correlation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'research', 'draft', 'optimize', 'publish', 
    'configure', 'analyze', 'outreach', 'monitor'
  )),
  target_app TEXT NOT NULL,
  context_pack JSONB,                  -- Assembled at execution time
  command JSONB,                       -- SynapseCommand
  depends_on JSONB NOT NULL DEFAULT '[]',
  inputs JSONB NOT NULL DEFAULT '[]',
  completion_criteria JSONB NOT NULL,
  outputs JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'queued', 'generating', 'pending_approval',
    'approved', 'executing', 'verifying', 'completed',
    'failed', 'cancelled'
  )),
  approval_id UUID REFERENCES kinetiks_approvals(id),
  verification_result JSONB,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policies (declarative governance rules)
CREATE TABLE kinetiks_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('user_declared', 'system_recommended', 'compliance')),
  scope JSONB NOT NULL DEFAULT '{}',   -- PolicyScope
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'prohibition', 'requirement', 'constraint', 'preference',
    'budget', 'cadence', 'approval_override'
  )),
  rule JSONB NOT NULL,                 -- PolicyRule
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'system')),
  requires_approval_to_change BOOLEAN NOT NULL DEFAULT false,
  override_count INTEGER NOT NULL DEFAULT 0,
  enforcement_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policy version history
CREATE TABLE kinetiks_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES kinetiks_policies(id),
  version INTEGER NOT NULL,
  rule JSONB NOT NULL,
  scope JSONB NOT NULL,
  changed_by TEXT NOT NULL,            -- 'user' or 'system'
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verification checks (post-execution integrity)
CREATE TABLE kinetiks_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES kinetiks_tasks(id),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  correlation_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  expected TEXT,
  actual TEXT,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warn', 'pending')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Incidents (failure detection and recovery)
CREATE TABLE kinetiks_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES kinetiks_tasks(id),
  program_id UUID NOT NULL REFERENCES kinetiks_programs(id),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  correlation_id TEXT NOT NULL,
  verification_id UUID REFERENCES kinetiks_verifications(id),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  auto_action_taken TEXT,
  requires_human BOOLEAN NOT NULL DEFAULT false,
  human_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'detected' 
    CHECK (status IN ('detected', 'responding', 'resolved', 'escalated')),
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  postmortem JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on all new tables
ALTER TABLE kinetiks_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_incidents ENABLE ROW LEVEL SECURITY;
```

### 7.2 Modified Tables

```sql
-- Add correlation_id to existing tables
ALTER TABLE kinetiks_approvals ADD COLUMN correlation_id TEXT;
ALTER TABLE kinetiks_learned_constraints ADD COLUMN correlation_id TEXT;
ALTER TABLE kinetiks_learned_constraints ADD COLUMN program_id UUID REFERENCES kinetiks_programs(id);
ALTER TABLE kinetiks_ledger ADD COLUMN correlation_id TEXT;

-- Add approval window to approvals
ALTER TABLE kinetiks_approvals ADD COLUMN timeout_hours INTEGER;
ALTER TABLE kinetiks_approvals ADD COLUMN timeout_action TEXT 
  CHECK (timeout_action IN ('auto_promote', 'pause_workflow', 'cancel', 'reschedule'));
ALTER TABLE kinetiks_approvals ADD COLUMN timeout_at TIMESTAMPTZ;

-- Index for correlation-based queries
CREATE INDEX idx_programs_correlation ON kinetiks_programs(account_id, correlation_id);
CREATE INDEX idx_tasks_correlation ON kinetiks_tasks(account_id, correlation_id);
CREATE INDEX idx_approvals_correlation ON kinetiks_approvals(account_id, correlation_id);
CREATE INDEX idx_verifications_correlation ON kinetiks_verifications(account_id, correlation_id);
CREATE INDEX idx_incidents_correlation ON kinetiks_incidents(account_id, correlation_id);
```

### 7.3 Superseded Table

`kinetiks_work_items` (from the Autopilot spec) is replaced by `kinetiks_tasks`. If `kinetiks_work_items` has already been built, migrate data to the new schema. If not yet built, skip it and build `kinetiks_tasks` directly.

`kinetiks_execution_plans` remains but its `workstreams` field now references Program and Workflow IDs instead of containing flat workstream definitions.

---

## 8. Impact on Existing Specs

### 8.1 GTM Autopilot Spec

The Autopilot becomes a **Program manager**. Its weekly planning cycle creates and manages Programs instead of flat workstreams. Its daily execution cycle runs Workflows within Programs instead of processing flat work item lists. The Strategy-to-Action Compiler decomposes goals into Programs, and Programs decompose into Workflows and Tasks.

The morning brief, Away Mode, missed-day handling, and feedback loop all work the same — they just operate on Programs and Tasks instead of workstreams and work items.

### 8.2 Approval System Spec

No architectural changes. Approvals gain two new fields: `correlation_id` for tracing and `timeout_*` for windowed approvals. The approval source field (`user_command`, `autopilot_planned`, etc.) remains.

### 8.3 Cross-App Command Router Spec

No changes. The command router is the execution mechanism for Tasks. Tasks generate SynapseCommands that are dispatched through the existing router.

### 8.4 Analytics & Goals Engine Spec

The Oracle gains a new consumer: Programs. Program-level metrics (tasks generated, approved, completed, outcomes) feed into Oracle's attribution model. The Oracle can now attribute outcomes not just to channels but to specific Programs and Workflows.

### 8.5 Platform Contract

The Synapse interface gains verification hooks. After a Synapse executes a command, it reports an execution result that the verification layer can check. This is a new optional field in the existing `CommandResponse` type.

### 8.6 CLAUDE.md

Add to the Phased Build Plan:
- Programs, Workflows, and Tasks replace work items in the Autopilot
- Policy-as-Code is a new Cortex capability
- Verification and Recovery run post-execution
- ContextPacks are assembled per-task at execution time
- Correlation IDs thread through all tables

---

## 9. Build Sequence

These six additions have a natural dependency order:

**Step 1: Correlation IDs.** Add the field to all existing and new tables. Cheapest change, enables everything else.

**Step 2: Policies.** `kinetiks_policies` table, Cortex UI for viewing/editing, Chat interface for declaring. Immediately valuable even before Programs exist — policies can be enforced in the existing approval pipeline.

**Step 3: Programs, Workflows, Tasks.** The new hierarchy. Replaces flat workstreams and work items. This is the largest change and requires updating the Autopilot's planning and execution CRONs.

**Step 4: ContextPacks.** The assembly logic that builds scoped context per Task. Improves generation quality. Depends on the Task schema from Step 3.

**Step 5: Verification.** Post-execution checks. Depends on Tasks existing (Step 3) and app-specific check definitions.

**Step 6: Recovery and Incidents.** Automated failure response. Depends on Verification (Step 5) for detection. Depends on Programs (Step 3) for postmortem-driven hardening.

**Step 7: Time-boxed approval windows.** Adds timeout fields to approvals. Can be built anytime after the approval system exists, but most useful after Programs are running and generating consistent approval volume.
