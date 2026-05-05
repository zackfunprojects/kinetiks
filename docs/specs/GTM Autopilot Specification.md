# GTM Autopilot Spec

> **This is the specification for the Kinetiks autonomous execution layer - the system that makes Kinetiks a GTM machine, not a GTM chatbot.**
> Without this system, Kinetiks waits for the user to type. With it, Kinetiks continuously generates work that advances the user's goals, fills the approval queue on its own, learns from every human decision, and adjusts course automatically.
> This is what bridges the gap between Cartographer onboarding and real GTM output. It is the reason a vibe coder would trust Kinetiks to take their app to market.
> Read the Approval System Spec, Analytics & Goals Engine Spec, and Cross-App Command Router Spec before this document - this system depends on all three.

---

## 1. The Problem

Today, every piece of value in Kinetiks requires the user to initiate it. Marcus waits for a message. The command router waits for a directive. The Oracle detects patterns and pushes insights to Marcus - but insights are observations, not actions. The approval system is designed to gate autonomous work, but nothing generates that work autonomously.

This means:

- A user onboards through the Cartographer, gets a populated Context Structure, connects their accounts - and then sits in an empty Chat waiting for something to happen.
- The system knows the user's goals (50 qualified leads/month), has their data (current reply rates, pipeline velocity, traffic trends), and has the apps to act (Harvest, Dark Madder, Litmus) - but does nothing with any of it until asked.
- The approval queue is empty unless the user specifically requests work. The driving modes (Human Drive → Approvals → Autopilot) describe earned autonomy, but the precondition - the system generating work to approve - doesn't exist.

The result: Kinetiks feels like Claude with a business context, not an autonomous GTM team.

---

## 2. The Solution: Continuous GTM Execution

The GTM Autopilot is a persistent execution layer that runs continuously. It:

1. **Reads goals** from Cortex and Oracle
2. **Assesses current state** using data from all connected sources and apps
3. **Builds an execution plan** - what needs to happen across which apps to advance each goal
4. **Generates work** by dispatching to apps via the existing command router and Synapse infrastructure
5. **Routes everything through approvals** - the user's primary interaction becomes reviewing and directing, not requesting
6. **Learns from every decision** - approvals, edits, rejections, and inaction all reshape what gets generated next
7. **Repeats** on a continuous cadence

The user's experience shifts from "I ask my GTM system to do things" to "my GTM system does things and I steer."

---

## 3. Core Concepts

### 3.1 The Execution Plan

The Autopilot maintains a living execution plan per account. This is not a static document - it is recomputed on every planning cycle based on current goals, data, and learned preferences.

```typescript
interface ExecutionPlan {
  account_id: string;
  plan_id: string;
  created_at: string;
  expires_at: string;              // Plans expire and regenerate
  planning_cycle: 'weekly' | 'daily';
  
  // What we're working toward
  active_goals: GoalAssessment[];
  
  // What the plan calls for
  workstreams: Workstream[];
  
  // What's already in flight
  in_progress: InFlightWork[];
  
  // What the system learned from recent approvals
  active_constraints: LearnedConstraint[];
}

interface GoalAssessment {
  goal_id: string;
  goal_name: string;
  target_value: number;
  current_value: number;
  projected_value: number;         // Oracle forecast
  gap: number;                     // target - projected
  status: 'on_track' | 'behind' | 'at_risk' | 'critical';
  top_levers: Lever[];             // Ranked actions that would close the gap
  contributing_apps: string[];
}

interface Lever {
  description: string;             // "Increase outbound volume to fintech segment"
  estimated_impact: number;        // Projected impact on goal metric
  confidence: number;              // How confident we are in this lever
  required_app: string;            // Which app executes this
  required_actions: string[];      // What actions are needed
  blocking_dependencies: string[]; // What must happen first
}

interface Workstream {
  workstream_id: string;
  goal_id: string;                 // Which goal this advances
  app: string;                     // Which app handles execution
  description: string;             // "3-touch outbound sequence targeting fintech CFOs"
  priority: number;                // 1 = highest
  cadence: WorkCadence;            // How often this generates work
  work_items: PlannedWorkItem[];   // Specific items to generate
  status: 'active' | 'paused' | 'completed' | 'blocked';
}

interface WorkCadence {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'once';
  next_execution: string;          // ISO timestamp
  last_execution: string | null;
}

interface PlannedWorkItem {
  item_id: string;
  workstream_id: string;
  type: string;                    // 'outbound_sequence' | 'blog_post' | 'pr_pitch' | etc.
  description: string;
  target_app: string;
  command: SynapseCommand | null;  // Pre-built command, null until generation
  status: 'planned' | 'generating' | 'pending_approval' | 'approved' | 'executing' | 'completed' | 'rejected';
  scheduled_for: string;           // When to generate this
  generated_at: string | null;
  approval_id: string | null;      // Links to kinetiks_approvals
}
```

### 3.2 Planning Cycles

The Autopilot operates on two nested cycles:

**Weekly Planning (every Monday or first login of the week):**
- Oracle provides a full goal assessment with projections
- The Autopilot builds (or rebuilds) the execution plan for the week
- Workstreams are created or adjusted based on goal gaps
- The weekly plan is presented to the user as a briefing in Chat and as a strategic approval

**Daily Execution (continuous, with a morning batch):**
- The Autopilot executes the current day's planned work items
- Generates work products via the command router
- Routes everything through the approval system
- Updates the execution plan based on approvals/rejections from the previous day
- Surfaces completed and pending work in the morning brief

**Intra-day (event-driven):**
- Oracle alerts (urgent anomalies) can trigger immediate replanning of specific workstreams
- User chat messages that change strategy ("pivot from enterprise to SMB") trigger a full replan
- Approval patterns (3 rejections in a row in a category) pause that workstream and surface in Chat

### 3.3 The Morning Brief

Every day, the system produces a brief. This is not a notification or a digest - it is the primary communication from the Autopilot to the user. Delivered via Chat, Slack, and/or email depending on configuration.

**Morning brief contents:**

```
[System Name] - Tuesday, April 15

GOALS
- 50 qualified leads/month: 23 so far, on pace for 41. Behind target.
  Top lever: increase outbound volume (currently 12 emails/day, recommend 20)
- 8 blog posts/month: 3 published, 2 in review. On track.
- 15% reply rate: currently 11.2%. Trending down from 13.1% last week.
  Top lever: A/B test subject lines in fintech sequence

TODAY'S WORK (pending your approval)
- 3 follow-up emails drafted for active Harvest sequences
- 1 new blog post outline on "AI security trends" (Dark Madder)
- 12 new prospects added to enterprise sequence (Harvest)
- Subject line variants for fintech A/B test (Harvest)

YESTERDAY'S RESULTS
- 8 emails sent (5 approved, 3 auto-approved)
- 1 blog post published ("Zero Trust for Startups") - 340 views, 12 signups
- Reply from VP Eng at Dataflow - positive, meeting requested

NEEDS YOUR INPUT
- The PR pitch to TechCrunch was rejected yesterday. Should I try a different angle 
  or a different publication?
- Enterprise sequence has low reply rates (6.1%). Recommend pausing and revising 
  the messaging. Approve pause?
```

The brief is interactive. Each item links to the relevant approval card, app view, or Chat thread. "Approve all" is available for the daily work batch.

### 3.4 Workstream Types

The Autopilot generates work across all connected apps. Each app has standard workstream types:

**Harvest workstreams:**
- Prospect sourcing: continuously find and add prospects matching ICP
- Sequence generation: build outbound sequences targeting specific segments
- Follow-up generation: draft follow-ups for active conversations
- Sequence optimization: A/B test subject lines, messaging angles, cadence
- Pipeline management: stage updates, next actions for active deals

**Dark Madder workstreams:**
- Content calendar execution: draft blog posts, social content on schedule
- SEO content: target keyword gaps identified by Oracle/GSC data
- Content optimization: update underperforming published content
- Social engagement: draft social posts promoting published content

**Litmus workstreams:**
- Media outreach: identify relevant journalists, draft pitches
- Coverage monitoring: track mentions, draft responses
- Relationship building: suggest engagement with target journalists' content

**Hypothesis workstreams:**
- Landing page optimization: generate A/B test variants
- Conversion analysis: recommend changes based on analytics data
- New page creation: build pages for campaigns from other apps

**Cross-app workstreams:**
- Campaign orchestration: coordinate content + outreach + PR around a theme
- Funnel optimization: identify and address drop-off points across apps
- Attribution-driven reallocation: shift effort toward highest-ROI channels

---

## 4. The Strategy-to-Action Compiler

This is the intelligence that turns abstract goals into concrete daily work. It runs during weekly planning and adjusts during daily execution.

### 4.1 Goal Decomposition

For each active goal, the compiler:

1. **Queries Oracle** for current performance, trajectory, and forecast
2. **Identifies the gap** between projected outcome and target
3. **Maps available levers** based on connected apps and their capabilities
4. **Ranks levers** by estimated impact, confidence, and cost (seeds + budget)
5. **Generates workstreams** that exercise the top levers
6. **Allocates effort** across workstreams based on goal priority and lever confidence

**Example decomposition:**

```
Goal: Generate 50 qualified leads this month
Current: 23 leads, 14 days remaining
Projected at current pace: 41 leads
Gap: 9 leads

Lever analysis:
1. Increase outbound volume (Harvest)
   - Current: 12 emails/day, 11.2% reply rate, 18% reply-to-lead conversion
   - If 20 emails/day: +8.4 additional leads projected
   - Confidence: 78% (based on historical conversion rates)
   - Workstream: source 160 new prospects, draft 2 new sequences

2. Improve reply rates (Harvest)  
   - Current: 11.2%, was 13.1% last week
   - If restored to 13.1%: +3.2 additional leads projected
   - Confidence: 65% (requires identifying what changed)
   - Workstream: A/B test subject lines, analyze recent reply drop

3. Publish SEO content targeting high-intent keywords (Dark Madder)
   - Current: 2 blog posts driving 6 leads/month
   - If 2 additional high-intent posts: +2-4 leads projected
   - Confidence: 45% (longer time horizon, less predictable)
   - Workstream: draft 2 blog posts targeting "AI security compliance" keywords

4. PR placement in TechCrunch (Litmus)
   - Historical: 1 placement = 8-12 leads
   - If placed: +8-12 leads projected
   - Confidence: 25% (depends on editorial interest)
   - Workstream: draft pitch, identify backup publications

Selected workstreams (by priority):
1. Harvest volume increase (high confidence, high impact)
2. Harvest reply rate optimization (medium confidence, medium impact)
3. Dark Madder SEO content (medium confidence, medium impact)
4. Litmus PR pitch (low confidence, high potential impact)
```

### 4.2 Effort Allocation

The compiler doesn't blindly maximize all levers. It respects:

**Budget constraints.** If the user has a monthly marketing budget defined in Cortex, the compiler respects it. Paid actions (ads, sponsored content) are allocated within budget. Organic actions (outbound, content, PR) have a seed cost but no external budget requirement.

**Capacity constraints.** The approval system creates natural capacity limits. If the user approves 5 items/day on average, the system generates ~5-7 items/day (slight oversupply to keep the queue warm, not overwhelming). This is tracked and adapts automatically.

**Quality constraints.** The system would rather generate 3 excellent emails than 10 mediocre ones. Quality gates in the approval pipeline enforce this, but the compiler also self-regulates: if rejection rates rise, it slows down and spends more intelligence tokens per work item.

**Goal priority.** Users can rank their goals in Cortex. Higher-priority goals get disproportionate effort allocation. If goals conflict (e.g., "reduce CAC" vs "increase lead volume"), the compiler flags the tension and asks the user to resolve it once - then respects the decision.

### 4.3 The Planning Prompt

The weekly planning cycle uses a Claude Sonnet call with this structure:

```
System: You are a GTM strategist planning this week's execution.

Context (from Cortex):
- Business identity (org, products, voice, customers, narrative, competitive)
- Active goals with Oracle assessments
- Connected apps and their capabilities
- Budget constraints and current spend
- Learned constraints from previous approval patterns

Data (from Oracle):
- Last 30 days of metric data across all connected sources
- Goal progress and projections
- Active insights and anomalies
- Attribution data (what's working, what isn't)

Previous week's results:
- Work generated, approved, rejected, completed
- Outcomes observed (leads generated, content published, meetings booked)
- User feedback and corrections

Task: Generate this week's execution plan. For each workstream:
1. Which goal it advances and why this lever was selected
2. Specific work items to generate with priority and timing
3. Expected impact on goal metrics
4. Dependencies and sequencing
5. What success looks like by end of week

Constraints:
- Only generate work for connected, healthy apps
- Respect the user's demonstrated approval capacity
- If data is sparse, state what you'd do WITH data vs WITHOUT
- Never plan work that the approval system can't gate
```

The plan output is structured (JSON) and stored in `kinetiks_execution_plans`.

---

## 5. Autonomous App Activation

The Autopilot doesn't just use apps that are already connected - it identifies when a disconnected app would meaningfully advance a goal and recommends activation.

### 5.1 Activation Recommendation Logic

During weekly planning, the compiler runs a gap analysis:

```typescript
interface ActivationRecommendation {
  app: string;
  goal_id: string;
  rationale: string;               // Why this app would help
  projected_impact: string;        // What it would contribute to the goal
  evidence: string[];              // Specific data points backing the recommendation
  effort_to_activate: 'minimal' | 'moderate' | 'significant';
  urgency: 'nice_to_have' | 'recommended' | 'critical_for_goal';
}
```

**Rules for activation recommendations (from Chat UX Addendum, reinforced here):**

- Maximum one app recommendation per planning cycle. No bombardment.
- Every recommendation must reference specific user data. Not "Litmus could help" but "Your 'Land 3 tier-1 placements' goal has zero connected PR capability. Litmus would let the system draft and track pitches."
- If the user dismisses a recommendation, don't repeat it for 30 days.
- Never hard-sell. The recommendation is strategic advice, same as any other Marcus output.
- Activation recommendations are strategic approvals - they always require explicit user consent.

### 5.2 Post-Activation Onboarding

When a user activates a new app, the Autopilot immediately:

1. Registers the app's Synapse capabilities in the registry
2. Runs a lightweight data pull (what does the app already know? any existing content, contacts, etc.)
3. Generates an initial workstream for the app based on the goal that triggered activation
4. Produces the first batch of work items within 24 hours
5. Delivers a brief: "I've started using [App Name]. Here's the first batch of work - [3 items]. Review them and I'll learn your preferences."

The key insight: the first work an app produces is the most important. It sets expectations. The Autopilot should spend extra intelligence tokens on first-batch quality. The approval system's confidence starts at zero for the new app, so everything goes through human review - which is correct behavior for a new capability.

### 5.3 App Ecosystem Intelligence

As more apps activate, the Autopilot's planning becomes more sophisticated:

**Single app (e.g., Harvest only):**
- Workstreams are linear: find prospects → draft sequences → send → follow up
- Recommendations are tactical: "increase volume" or "change messaging angle"
- Value prop: automated outbound with learning

**Two apps (e.g., Harvest + Dark Madder):**
- Cross-app workstreams emerge: "publish blog post → use as outbound ammo → track which content drives replies"
- Attribution becomes possible: which content topics correlate with outbound success
- Value prop: content-powered outbound

**Three+ apps (e.g., Harvest + Dark Madder + Litmus):**
- Full campaign orchestration: PR placement → content around the coverage → outbound referencing the press → landing page for the campaign
- Multi-channel attribution: which combination of channels drives the best pipeline
- Value prop: coordinated GTM machine

The system should explicitly communicate this progression to the user: "With Harvest and Dark Madder connected, I can start correlating your content topics with outbound performance. Here's what I'm seeing..." This makes the value of each new app tangible.

---

## 6. The User's Role

### 6.1 Primary Interaction: The Approval Queue

The approval queue becomes the user's daily cockpit. Not Chat. The morning routine:

1. Open Kinetiks (desktop app notification: "7 items ready for review")
2. Review the morning brief (30 seconds)
3. Scroll through pending approvals (2-5 minutes)
4. Approve, edit, or reject each item
5. Done - the system executes approved work and learns from edits/rejections

Over time, as confidence builds and driving modes progress from Human Drive to Approvals to Autopilot, even this review step shrinks. The system auto-approves routine work and only surfaces novel or strategic decisions.

### 6.2 Secondary Interaction: Strategic Direction via Chat

Chat shifts from "task initiation" to "strategy and redirection":

- "I'm pivoting from enterprise to SMB" → triggers full replan
- "Stop all outbound to healthcare" → pauses relevant workstreams immediately
- "Why aren't we hitting the lead goal?" → Oracle analysis + Autopilot plan adjustment
- "I love what you did with that fintech sequence, do more like that" → learned preference applied across future work
- "What would happen if we doubled the content cadence?" → what-if modeling against the execution plan

The user should never need to say "draft an email" or "build a sequence." Those are generated automatically. The user's job is to say "yes," "no," "more like this," "less like that," and "change direction."

### 6.3 Tertiary Interaction: Tasks That Need Human Action

Some things the system can't do autonomously. These are surfaced as "Needs Your Input" items:

- Record a voice sample (for Harvest calls)
- Write a founder story (for content authenticity)
- Review and approve the brand voice calibration
- Connect a new data source (OAuth requires human action)
- Resolve a strategic conflict between competing goals
- Provide feedback on a rejected item ("what was wrong?")

These are presented in order of impact on goal progress. "I can't optimize outbound emails until you calibrate the voice" is more urgent than "a new social platform integration is available."

---

## 7. The Feedback Loop

Every human interaction with the Autopilot generates learning signals. This goes beyond the approval system's confidence model (which handles per-category trust). The Autopilot learns *what to generate*, not just *whether to auto-approve*.

### 7.1 Signal Types

**Approval without edits:** Strong positive signal. Generate more work like this. The specific attributes of the approved item (messaging angle, tone, target segment, content topic) are reinforced.

**Approval with edits:** Moderate positive signal with correction vector. The diff between generated and approved versions is analyzed. Common patterns:
- User always shortens emails → adjust generation length
- User always removes the case study paragraph → stop including case studies
- User changes "innovative" to "practical" in every draft → voice calibration update
- User adjusts target segment → update ICP weighting

**Rejection with reason:** Strong negative signal with direction. The rejection reason is categorized and applied:
- "Wrong tone" → voice constraint tightened for this work type
- "Wrong segment" → targeting adjusted
- "Not now / bad timing" → workstream paused, not killed
- "We don't do this" → permanent constraint added
- "Quality too low" → more intelligence tokens allocated per item

**Rejection without reason:** Negative signal without direction. The system asks once: "I noticed you rejected the fintech follow-up. Knowing why helps me improve - was it the tone, timing, targeting, or something else?" If no response, the system slows that workstream and monitors.

**Inaction (items aging in queue):** Not a negative signal - a tempo signal. The system adapts, it doesn't punish. See Section 7.4 (Missed Days) and Section 7.5 (Away Mode) for the full behavior.

### 7.2 Constraint Learning

Over time, approval patterns crystallize into durable constraints:

```typescript
interface LearnedConstraint {
  constraint_id: string;
  account_id: string;
  source: 'approval_pattern' | 'explicit_instruction' | 'rejection_reason';
  category: string;                // What work type this applies to
  constraint_type: 'positive' | 'negative' | 'parameter';
  description: string;             // "User prefers direct CTAs over soft asks"
  confidence: number;              // How confident we are in this constraint
  evidence_count: number;          // How many signals support this
  first_observed: string;
  last_confirmed: string;
  status: 'active' | 'testing' | 'expired';
}
```

Constraints feed back into the planning prompt and the work generation prompts. They accumulate over time, making the system's output increasingly aligned with the user's preferences without the user ever having to explicitly state them.

### 7.3 Constraint Decay

Constraints aren't permanent unless explicitly stated by the user. Inferred constraints decay over time:

- Constraints with <3 evidence signals expire after 30 days of no confirmation
- Constraints with 3-10 signals expire after 90 days
- Constraints with 10+ signals are considered durable but still tested periodically (the system occasionally generates work that challenges a constraint to verify it still holds)
- Constraints the user explicitly stated ("never cold-email healthcare") never decay

### 7.4 Missed Days and Queue Continuity

Vibe coders are solo founders. They'll miss days. The system must handle this gracefully - no guilt, no backlog anxiety, no stale queue that feels like debt.

**Core principle: the queue is always fresh.** When the user opens Kinetiks after being away, they see today's work, not yesterday's leftovers.

**What happens when a day is missed:**

1. **Stale items expire, not stack.** Any work item that was pending approval for 24+ hours and is time-sensitive (outbound emails, social posts, PR pitches with a news hook) is automatically cancelled. The system doesn't send yesterday's email today - the moment has passed. Non-time-sensitive items (blog post drafts, prospect lists, sequence templates) can persist but are folded into today's batch, not shown separately.

2. **The next morning brief is a clean slate.** No "you have 12 pending items from the last 2 days." Instead: "I held off on Tuesday's outreach since you weren't available. Here's Wednesday's batch - I incorporated the latest data so everything is current." The brief covers what happened in the user's absence (any auto-approved items that executed, results from previously approved work) and presents today's fresh queue.

3. **The execution plan absorbs the gap.** The daily execution CRON detects that yesterday's items weren't acted on. It doesn't re-queue them plus today's items. It replans: given the remaining days in the weekly plan and the goal gap, what should today's batch look like? If the user missed one day of a 5-day week, today might get slightly more items to stay on pace - but never double. The capacity estimate is respected.

4. **No escalation on single missed days.** The 3-step escalation (prompt → slow down → pause) only engages on consecutive missed days:
   - 1 day missed: no signal, no mention, fresh queue next day
   - 2 consecutive days missed: brief notes "I've been holding work for a couple days. Want me to keep generating or pause until you're back?"
   - 3+ consecutive days missed (without Away Mode): system auto-pauses work generation and sends a single notification: "I've paused your GTM workstreams since you've been away. Just say 'resume' when you're ready and I'll replan." No further messages until the user returns.

5. **Returning after absence triggers a replan, not a dump.** When the user opens Kinetiks after 2+ days away, the Autopilot runs a fresh planning cycle immediately. It reads current Oracle data (not stale 3-day-old data), assesses where goals stand now, and generates a new batch. The user sees current, relevant work - not a backlog.

```typescript
interface QueueContinuityRules {
  // Items older than this are auto-expired if time-sensitive
  stale_threshold_hours: 24;
  
  // Non-time-sensitive items persist up to this limit
  persistent_item_max_age_hours: 72;
  
  // After this many consecutive missed days, auto-pause
  auto_pause_after_days: 3;
  
  // When user returns after absence, replan before showing queue
  replan_after_absence_days: 2;
  
  // Never generate more than this multiplier of daily capacity, even when catching up
  max_catchup_multiplier: 1.3;  // At most 30% more than normal daily batch
}
```

### 7.5 Away Mode

The user can explicitly tell the system they'll be gone. This is better than auto-detection because it lets the system plan ahead.

**Activation:** "I'm going on vacation for 10 days" or "I'll be away until the 25th" in Chat, or via a toggle in Settings.

**What Away Mode does:**

1. **Immediately pauses all work generation.** No new items enter the approval queue. Existing pending items are expired (time-sensitive) or shelved (persistent).

2. **Continues monitoring but doesn't act.** The Oracle keeps running. Data keeps flowing. Insights accumulate. The system stays informed but doesn't generate work that would go stale in the queue.

3. **Auto-approved categories keep running.** If the user has earned Autopilot mode for certain work types (e.g., follow-up emails are auto-approved at 95% confidence), those continue executing. The system already proved it can handle these without human review. This is a major trust reward - the user can go on vacation and routine GTM still runs.

4. **Critical alerts still surface.** If the Oracle detects something urgent (major traffic drop, competitor launch, deal at risk), it sends a single notification via the user's preferred channel (Slack DM, email). Not the full brief - just the alert with a one-tap "I'll handle it" or "ignore until I'm back" response. Maximum one alert per day during Away Mode.

5. **Return planning happens 24 hours before scheduled return.** The day before the user is expected back, the system runs a full replan incorporating everything that happened during the absence. When the user opens Kinetiks on their return day, they see:

```
Welcome back. Here's what happened while you were away:

RESULTS (auto-approved work that ran)
- 34 follow-up emails sent (auto-approved). 8 replies, 2 meetings booked.
- "Zero Trust" blog post was auto-shared on LinkedIn. 1,200 impressions.

WHAT I NOTICED (Oracle insights from the last 10 days)
- Reply rates on the enterprise sequence dropped to 7%. Recommend revising.
- Competitor launched a new pricing page. I saved the analysis.
- GSC shows "AI compliance audit" trending. Content opportunity.

TODAY'S PLAN
Based on updated data, here's what I'd prioritize this week:
[Fresh execution plan, not a backlog]
```

**Away Mode settings:**

```typescript
interface AwayModeConfig {
  enabled: boolean;
  return_date: string | null;        // ISO date, null for indefinite
  auto_approved_continue: boolean;   // Default: true - Autopilot-level work keeps running
  critical_alerts: boolean;          // Default: true - urgent Oracle alerts still surface
  alert_channel: 'slack' | 'email' | 'none';
  alert_max_per_day: number;         // Default: 1
  replan_before_return: boolean;     // Default: true - fresh plan ready on return
}
```

**Ending Away Mode:** "I'm back" in Chat, toggle in Settings, or automatic on the scheduled return date. Triggers immediate replan.

---

## 8. First Run: Onboarding to Autopilot

This is the most critical flow. The user just finished Cartographer onboarding. What happens next?

### 8.1 Immediate Post-Onboarding (first 5 minutes)

The Cartographer has built the Context Structure. The user may or may not have connected data sources (GA4, Stripe, GSC). They may or may not have activated an app.

**If no apps activated yet:**

Marcus initiates the first strategic conversation, grounded in the Context Structure:

```
I've analyzed your business context. Here's what I see:

[2-3 sentence assessment based on Context Structure - their product, market, 
competitive position]

For getting [product name] to market, I'd start with outbound. Here's why:
[specific reasoning based on their ICP, market, and competitive positioning]

If you activate Harvest, I'll have a first batch of prospect research and 
draft outreach ready for you to review by tomorrow morning.

Want me to set that up?
```

This is an activation recommendation, but it's also the first demonstration that the system understands the user's business and has a point of view. It's not "which app would you like to use?" - it's "here's what I'd do first and why."

**If an app is already activated (e.g., Harvest):**

Skip the recommendation. Generate the first execution plan immediately:

1. Run goal assessment (if goals exist) or suggest initial goals ("Based on your stage and market, I'd recommend targeting 30 qualified leads in your first month. Sound right?")
2. Use Context Structure data to identify first workstream (ICP → prospect criteria → initial search)
3. Generate first batch of work within 1 hour (not 24 hours - the first batch needs to be fast)
4. Surface the first approval: "I've found 15 prospects matching your ICP and drafted an intro sequence. Take a look."

**If data sources are connected:**

Even richer first experience. The system can reference actual numbers:

```
I can see your GA4 data. You're getting 2,400 sessions/month with 67% from 
organic search. Your top pages are [X, Y, Z]. Your Stripe shows $4,200 MRR 
across 38 customers.

With this data, here's my read on your GTM situation:
[Strategic assessment grounded in real numbers]

I'd prioritize [specific action] this week. Here's the plan...
```

### 8.2 First Week Experience

Day 1: First batch of work ready for approval. User reviews, approves/edits/rejects. System learns.

Day 2: Morning brief delivered. Second batch incorporates learnings from Day 1 approvals. Queue has 3-5 items.

Day 3-4: Pattern established. User knows to check approvals each morning. System is generating work at the user's demonstrated approval pace.

Day 5: First weekly planning cycle. The system produces a week-in-review and next-week plan:

```
WEEK 1 REVIEW
- Generated 18 work items across Harvest
- You approved 14, edited 3, rejected 1
- From your edits, I learned: [2-3 specific patterns]
- Results so far: 45 emails sent, 6 replies, 2 meetings booked

NEXT WEEK PLAN
Based on this week's performance and your goal of 30 leads:
1. Continue fintech outbound (working well - 14% reply rate)
2. Start healthcare segment (your ICP includes healthcare, untested so far)
3. A/B test the subject line approach (your edits suggest shorter is better)

I'll have Monday's batch ready by 8am. Anything you'd like me to adjust?
```

### 8.3 First Month Progression

By end of month 1, the user should experience:
- Consistent daily work generation (the queue is never empty)
- Measurable improvement in output quality (fewer edits per approval)
- At least one driving mode progression (e.g., Harvest follow-ups move from Human Drive to Approvals)
- An app activation recommendation (if only one app is active)
- A strategic insight from cross-source data (e.g., "blog posts about security drive 3x more outbound replies than posts about pricing")

The system tracks these milestones internally and celebrates them in the morning brief: "This week I auto-approved 8 follow-up emails without edits. Your approval rate for Harvest follow-ups is 96% - I'm getting the hang of your style."

---

## 9. Integration with Existing Systems

### 9.1 Relationship to Marcus

Marcus is the conversational interface. The Autopilot is the execution engine. They share context but have different jobs:

- **Marcus** delivers the morning brief, explains the execution plan, handles strategic conversations, surfaces recommendations, and communicates Autopilot decisions in natural language
- **The Autopilot** generates the execution plan, dispatches work to apps, processes approval outcomes, manages workstream lifecycle, and feeds constraints back into planning

Marcus is aware of the Autopilot's current plan and can explain any decision: "Why did you draft a PR pitch?" → "Your 'land 3 tier-1 placements' goal is behind pace. I identified TechCrunch as the highest-probability target based on your narrative about [topic]. The pitch is in your approval queue."

### 9.2 Relationship to Oracle

The Oracle is the Autopilot's sensor array. The Autopilot consumes:

- Goal assessments and projections (from oracle-goals CRON)
- Active insights and anomalies (from oracle-insights CRON)
- Urgent alerts (from oracle-alerts CRON)
- Attribution data (from oracle-attribution CRON)
- Metric trends and patterns (from oracle-metrics CRON)

The Oracle doesn't change. It already produces everything the Autopilot needs. The Autopilot is the missing consumer of Oracle intelligence that turns observations into actions.

### 9.3 Relationship to Approval System

The approval system doesn't change architecturally. The Autopilot is simply the largest producer of approvals. Everything it generates flows through the existing pipeline: brand gate → quality gate → classification → confidence check → queue or auto-approve.

One addition: the Autopilot needs to be registered as an approval source. Currently, approvals come from app agents responding to user commands. Now they also come from the Autopilot's autonomous work generation. The source attribution in `kinetiks_approvals` should distinguish:

```typescript
type ApprovalSource = 
  | 'user_command'      // User explicitly asked for this via Chat
  | 'autopilot_planned' // Autopilot generated this as part of the execution plan
  | 'autopilot_reactive' // Autopilot generated this in response to an Oracle alert
  | 'app_autonomous';    // App's internal agents generated this independently
```

### 9.4 Relationship to Command Router

The Autopilot dispatches work through the existing command router infrastructure. The command router doesn't know or care whether the command originated from a user typing in Chat or from the Autopilot's execution engine. Same SynapseCommand format, same dispatch channels, same response handling.

The only difference: commands from the Autopilot skip the confirmation step. When a user types a command, Marcus confirms the plan before dispatching. The Autopilot doesn't need confirmation because the entire execution plan was already reviewed (or will be reviewed via the approval system when work products are ready).

### 9.5 Relationship to Cortex

The Autopilot reads from Cortex (business context, goals, voice, ICP) but doesn't write to it directly. When the Autopilot learns something that should update the Context Structure (e.g., "outbound to healthcare consistently underperforms, suggesting ICP is narrower than stated"), it generates a Proposal through the standard Proposal pipeline. The Cartographer evaluates and merges it. The user sees it if it's a major change.

---

## 10. Database Schema

### 10.1 New Tables

```sql
-- The execution plan (one active per account)
CREATE TABLE kinetiks_execution_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('weekly', 'daily', 'reactive')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'expired')),
  goals_snapshot JSONB NOT NULL,       -- GoalAssessment[] at time of planning
  workstreams JSONB NOT NULL,          -- Workstream[]
  constraints_applied JSONB NOT NULL,  -- LearnedConstraint[] used in this plan
  planning_context JSONB,              -- Oracle data summary used for planning
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  superseded_by UUID REFERENCES kinetiks_execution_plans(id),
  UNIQUE(account_id, status) WHERE status = 'active'  -- Only one active plan per account
);

-- Individual work items planned and tracked
CREATE TABLE kinetiks_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES kinetiks_execution_plans(id),
  workstream_id TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  type TEXT NOT NULL,                  -- 'outbound_sequence', 'blog_post', 'pr_pitch', etc.
  description TEXT NOT NULL,
  target_app TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'generating', 'pending_approval', 'approved', 
    'executing', 'completed', 'rejected', 'cancelled'
  )),
  command JSONB,                       -- SynapseCommand when generated
  approval_id UUID REFERENCES kinetiks_approvals(id),
  scheduled_for TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome JSONB,                       -- Results after completion (metrics impact)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Learned constraints from approval patterns
CREATE TABLE kinetiks_learned_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  source TEXT NOT NULL CHECK (source IN ('approval_pattern', 'explicit_instruction', 'rejection_reason')),
  category TEXT NOT NULL,              -- Work type this applies to
  constraint_type TEXT NOT NULL CHECK (constraint_type IN ('positive', 'negative', 'parameter')),
  description TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  evidence JSONB NOT NULL DEFAULT '[]', -- Array of approval_ids that support this
  first_observed TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_confirmed TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,              -- Null for explicit user constraints
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'testing', 'expired', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Morning briefs (stored for history and Chat reference)
CREATE TABLE kinetiks_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  plan_id UUID REFERENCES kinetiks_execution_plans(id),
  brief_type TEXT NOT NULL CHECK (brief_type IN ('morning', 'weekly_review', 'weekly_plan', 'alert')),
  content JSONB NOT NULL,              -- Structured brief content
  rendered_text TEXT NOT NULL,          -- Marcus-formatted natural language version
  delivered_via JSONB NOT NULL DEFAULT '[]', -- ['chat', 'slack', 'email']
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activation recommendations (tracked to enforce cooldown)
CREATE TABLE kinetiks_activation_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kinetiks_accounts(id),
  app TEXT NOT NULL,
  goal_id UUID,
  rationale TEXT NOT NULL,
  projected_impact TEXT NOT NULL,
  evidence JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired')),
  dismissed_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,          -- Don't recommend this app again until this date
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS policies (same pattern as other kinetiks_* tables)
ALTER TABLE kinetiks_execution_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_learned_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinetiks_activation_recommendations ENABLE ROW LEVEL SECURITY;

-- Standard account-scoped RLS policy for each table
-- (same pattern as kinetiks_approvals, kinetiks_goals, etc.)
```

### 10.2 Modified Tables

```sql
-- Add autopilot source to approvals
ALTER TABLE kinetiks_approvals 
  ADD COLUMN source TEXT NOT NULL DEFAULT 'user_command' 
  CHECK (source IN ('user_command', 'autopilot_planned', 'autopilot_reactive', 'app_autonomous'));

-- Add approval_capacity tracking to accounts (or a settings table)
-- This tracks the user's demonstrated approval throughput
ALTER TABLE kinetiks_accounts
  ADD COLUMN autopilot_settings JSONB NOT NULL DEFAULT '{
    "enabled": true,
    "daily_capacity": null,
    "preferred_brief_time": "08:00",
    "brief_channels": ["chat"],
    "auto_pause_on_inactivity_days": 3,
    "away_mode": {
      "enabled": false,
      "return_date": null,
      "auto_approved_continue": true,
      "critical_alerts": true,
      "alert_channel": "slack",
      "alert_max_per_day": 1,
      "replan_before_return": true
    },
    "queue_continuity": {
      "stale_threshold_hours": 24,
      "persistent_item_max_age_hours": 72,
      "max_catchup_multiplier": 1.3
    }
  }';
```

---

## 11. CRON Functions

### 11.1 autopilot-weekly-plan (Monday 6:00 AM account-local time)

1. Check Away Mode - if enabled, skip planning entirely (but still run Oracle)
2. Fetch active goals and Oracle assessments
3. Fetch learned constraints
4. Fetch previous week's work item outcomes
5. Run the Strategy-to-Action Compiler (Claude Sonnet)
6. Store new execution plan in `kinetiks_execution_plans`
7. Mark previous plan as superseded
8. Generate weekly plan brief
9. Queue brief for delivery via Marcus

### 11.2 autopilot-daily-execute (daily, 6:00 AM account-local time)

1. **Check Away Mode** - if enabled:
   a. Execute only auto-approved-category work (Autopilot driving mode items)
   b. Skip all items requiring human approval
   c. If return_date is tomorrow, run replan for return-day brief
   d. Exit early

2. **Handle missed days** - before generating new work:
   a. Expire time-sensitive items pending >24 hours (status → 'cancelled', reason: 'stale')
   b. Fold non-time-sensitive persistent items into today's plan (don't show as separate stale batch)
   c. If 2+ consecutive days missed: check if auto-pause threshold reached
   d. If auto-pause triggered: pause all workstreams, send single notification, exit

3. **Detect return from absence** - if last user activity was 2+ days ago and user opened the app today:
   a. Run immediate replan with fresh Oracle data before generating today's batch
   b. Generate return brief (what happened while away + fresh plan) instead of standard morning brief

4. Fetch today's planned work items from active execution plan
5. Respect capacity: generate min(planned_items, daily_capacity * max_catchup_multiplier)
6. For each item:
   a. Generate the work product via command router
   b. Route through approval pipeline
   c. Update work item status
7. Generate morning brief (or return brief if applicable)
8. Queue brief for delivery

### 11.3 autopilot-learn (runs after every approval action)

Not a CRON - an event-triggered function. When an approval is acted on:

1. Analyze the action (approve/edit/reject) 
2. If edited: extract diff, identify patterns, update or create constraints
3. If rejected: extract reason, apply constraint
4. If approved without edits: reinforce positive patterns
5. Check for workstream-level signals (3+ rejections → pause recommendation)
6. Update approval capacity estimate
7. Reset consecutive-missed-days counter (user is active)

### 11.4 autopilot-replan (event-triggered)

Triggered by:
- Oracle urgent alert
- User strategic direction change in Chat
- Workstream pause due to rejection pattern
- New app activation
- Goal added, removed, or modified
- User returns from Away Mode or 2+ day absence
- "I'm back" message in Chat

Runs a partial or full replan depending on trigger severity.

### 11.5 autopilot-away-alerts (runs during Away Mode only, daily)

1. Check for Oracle urgent alerts generated in the last 24 hours
2. If any exist and alert_max_per_day not exceeded:
   a. Pick the single highest-severity alert
   b. Format as a minimal notification (not a full brief)
   c. Deliver via configured alert_channel
   d. Include one-tap responses: "I'll handle it" (opens app) / "Ignore until I'm back" (suppresses)
3. If no urgent alerts: do nothing (silence is the default during Away Mode)

---

## 12. Implementation Priority

This system builds on top of existing infrastructure. Dependencies:

**Hard requirements (must exist first):**
- Oracle with real data flowing (Phase A extractors) - without data, the compiler has nothing to plan against
- Goals system in Cortex (Phase 3) - without goals, there's nothing to optimize toward
- Approval system (Phase 2) - without approvals, autonomous work can't be gated
- At least one app with Synapse command handling (Harvest Phase B) - without an app, there's nothing to generate

**Soft requirements (improve quality but not blocking):**
- Cross-app command router (Phase 4) - needed for multi-app workstreams, but single-app autopilot works without it
- Agent communication layer (Phase 6) - needed for Slack/email brief delivery, but in-app brief works without it

### 12.1 Build Sequence

**Step 1: Database schema + basic types.** Migrations for the five new tables. TypeScript types matching the interfaces above.

**Step 2: Learned constraints engine.** The feedback loop - because it needs to start learning from Day 1 of approval activity, even before the full Autopilot exists. Wire it to fire on every approval action.

**Step 3: Morning brief generator.** Even before autonomous work generation, the morning brief adds value by summarizing pending approvals, goal progress, and insights. This becomes the Autopilot's voice immediately.

**Step 4: Strategy-to-Action Compiler.** The weekly planning Sonnet call. Requires Oracle data and goals. Produces execution plans. This is the intelligence core.

**Step 5: Daily execution engine.** The CRON that processes planned work items, dispatches to apps, and routes through approvals. This is where the queue starts filling itself.

**Step 6: First-run experience.** The onboarding-to-first-batch flow from Section 8. Wire the Cartographer completion to the Autopilot's initial planning cycle.

**Step 7: App activation recommendations.** The gap analysis that identifies when a new app would advance a goal.

**Step 8: Capacity management and inactivity handling.** The approval capacity tracking, queue overflow management, and auto-pause behavior.

---

## 13. Metrics

How to know if the Autopilot is working:

**User engagement:**
- Daily approval rate (what % of queued items get acted on within 24 hours)
- Edit rate trend (should decrease over time as the system learns)
- Rejection rate trend (should decrease over time)
- Time-to-first-approval each day (how quickly the user engages with the queue)
- Brief open rate (are users reading the morning brief?)

**System quality:**
- Constraint accuracy (do learned constraints predict future approval outcomes?)
- Workstream completion rate (what % of planned items make it to completion?)
- Execution plan stability (how much does the weekly plan change day-to-day? Some change is healthy, constant churn isn't)
- First-batch approval rate (do users approve the system's first work for a new app? Critical for onboarding)

**Goal impact:**
- Goal progress velocity (are goals being advanced faster with the Autopilot than without?)
- Lever prediction accuracy (did the workstreams actually move the metrics the compiler predicted?)
- Time-to-first-value (how quickly after onboarding does the user see a measurable GTM outcome?)

---

## 14. What This Changes About Kinetiks

With the Autopilot, the product positioning shifts:

**Before:** "An AI-powered GTM operating system where you can manage your go-to-market through conversation."

**After:** "An autonomous GTM machine that takes your app to market. Connect your accounts, set your goals, and approve the work. It gets smarter every day."

The Chat tab is no longer the primary surface - the approval queue is. Chat becomes the strategy layer, not the task layer. The morning brief becomes the daily touchpoint. The Analytics tab becomes how you verify the machine is working.

For vibe coders specifically: you built the app. Kinetiks takes it to market. You approve the emails, the content, the PR pitches. You redirect when something feels off. The system handles the rest - and it improves with every interaction.

That's the promise. This spec makes it real.
