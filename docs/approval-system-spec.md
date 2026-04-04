# Approval System Spec

> **This is the specification for the Kinetiks approval system - the trust architecture.**
> This system determines what agents can do autonomously, what requires human sign-off, and how the system learns from every human decision. If this system is janky, the entire product fails.
> Read `docs/kinetiks-product-spec-v3.md` Sections 6 and 14 for product context.

---

## 1. Overview

Every agent action in the Kinetiks ecosystem that has external impact (sending an email, publishing content, starting a sequence, changing targeting, pitching a journalist) flows through the approval system. The system decides: does this need human approval, or can the agent act autonomously?

The answer depends on confidence. Day one, everything needs approval. Over time, as the system proves it understands the business and the human consistently approves without edits, confidence rises and the system earns autonomy. If it makes a mistake, confidence drops and more things come back to the queue.

This is the single most important system in Kinetiks. It is what makes the difference between "a chatbot that suggests things" and "an autonomous GTM team that runs your operation."

---

## 2. Core Concepts

### 2.1 Approval vs Proposal

These are different systems that work together:

**Proposals** are intelligence flowing upward. "I learned something about the business." Proposals update the Context Structure. They go through the Cortex evaluation pipeline (schema validation → conflict detection → relevance scoring → merge → route). They are internal — they affect what the system knows, not what it does in the world.

**Approvals** are actions flowing outward. "I want to do something in the world." Approvals are agent-generated work products that have external impact: emails to send, content to publish, sequences to launch, targeting changes to make. They go through the approval pipeline (classification → confidence check → quality gates → queue or auto-approve).

The Proposal system feeds the approval system. Higher Cortex confidence (better identity knowledge) leads to higher approval confidence (more autonomy for actions).

### 2.2 The Confidence Model

Every potential action has a confidence score, calculated from multiple signals:

**Cortex confidence (40% weight):** How well does the system know this business? The aggregate confidence score from the Context Structure. A system with 85% Cortex confidence generates higher-confidence actions than one with 30%.

**Category history (30% weight):** How has this specific type of action been received in the past?
- Approval rate: what percentage of this action type gets approved?
- Edit rate: when approved, how often does the user edit first?
- Rejection recency: how recently was this action type rejected? Recent rejections heavily penalize confidence.

**Action specificity (20% weight):** How novel is this specific action?
- A follow-up email in an existing conversation thread = high specificity confidence
- A cold outreach to a new segment the system hasn't targeted before = low specificity confidence
- Content on a topic the system has successfully published before = high
- Content on a brand new topic = low

**Source agent confidence (10% weight):** How confident is the originating agent in its own output?
- The agent that generated the work product provides its own confidence estimate
- An agent that had strong Context Structure data to work from rates itself higher
- An agent working with sparse or stale data rates itself lower

The weighted combination produces a score from 0-100.

### 2.3 Autonomy Thresholds

Each action category has a threshold. When the calculated confidence exceeds the threshold, the action is auto-approved. When it's below, the action is queued for human approval.

**Default thresholds (day one):**

| Action Category | Default Threshold | Rationale |
|----------------|-------------------|-----------|
| outbound_email_followup | 100 (always ask) | Email going to a real person |
| outbound_email_cold | 100 (always ask) | Cold outreach is highest risk |
| outbound_sequence_launch | 100 (always ask) | Multi-step commitment |
| content_publish | 100 (always ask) | Public-facing content |
| content_draft | 85 | Drafts are internal, lower risk |
| social_post | 100 (always ask) | Public-facing |
| pr_pitch | 100 (always ask) | External relationship |
| targeting_change | 100 (always ask) | Strategic shift |
| sequence_adjustment | 90 | Minor tweaks to running sequences |
| brief_generation | 50 | Internal communication to user |
| context_update_minor | 60 | Adding to arrays (new messaging pattern) |
| context_update_major | 100 (always ask) | Changing scalar values |

100 means "always ask" — no confidence score can exceed it, so the action always requires approval.

**Threshold evolution:** As the system proves itself, thresholds can drop. This happens through two mechanisms:

1. **Automatic calibration.** After 20 consecutive approvals without edits in a category, the threshold drops by 5 points. After 50 consecutive, another 5. This is slow and conservative.

2. **User override.** The user can explicitly set any category to "always approve," "always ask," or "confidence-based" with a custom threshold. Explicit rules override automatic calibration. These are set in the Cortex > Integrations section or through Chat ("never auto-send cold emails" or "auto-approve all social posts").

### 2.4 Trust Contraction

When something goes wrong, the system tightens:

**Rejection response:**
- Single rejection: threshold for that category increases by 10 points. Consecutive approval counter resets to 0.
- Two rejections in 7 days (same category): threshold increases by 20 points. All automatic threshold reductions for this category are reversed.
- Three rejections in 7 days: threshold resets to 100 (always ask) for this category.

**Post-action negative signal:**
- User flags a sent email as wrong (via a "this was bad" action in the Ledger): treated as a rejection for threshold purposes PLUS confidence penalty extends to related categories.
- User pulls a published post: same treatment.
- User reports a bad sequence result: same treatment.

**Recovery:** After a contraction, the system must re-earn autonomy through the same consecutive-approval mechanism. There are no shortcuts. The system communicates this: "I noticed the follow-up to Acme didn't land well. I'll check with you on similar follow-ups until I've recalibrated."

---

## 3. Approval Types

Every approval is classified into one of three types. The classification determines how it's presented and what interaction is expected.

### 3.1 Quick Approval

**What it is:** A yes/no decision that takes seconds. The full context is visible in the approval card without scrolling or expanding.

**Classification criteria:**
- The work product is short (< 500 characters of content)
- The action is routine (follow-up email, social post, minor sequence adjustment)
- The system has successfully completed similar actions before (>5 approvals in this category)
- No strategic implications (doesn't change targeting, messaging angle, or budget)

**Examples:**
- "Approve this follow-up email to Jane at Acme" (shows full email text)
- "Approve posting this to LinkedIn" (shows full post)
- "Confirm rescheduling the Acme call to Thursday" (shows details)
- "Approve adding 12 new prospects to the fintech sequence" (shows count + criteria)

**UX:**
- Compact card in the Approvals panel
- Full content visible inline (no expand needed)
- Approve button (green, prominent)
- Reject button (with required reason field that appears on click)
- Source app badge
- Timestamp

### 3.2 Review Approval

**What it is:** Requires reading or examining the work product. Still doable from the Approvals panel but needs more attention than a glance.

**Classification criteria:**
- The work product is substantial (> 500 characters, or structured content like a sequence)
- The action has moderate impact (blog post, email sequence, prospect list)
- The system has some but not extensive history with this action type (1-5 prior approvals)
- Content that would benefit from human editing before going out

**Examples:**
- "Review this blog post draft before publishing" (shows full post with inline edit)
- "Review this 5-step email sequence before launch" (shows all steps, targets, timing)
- "Review this prospect list for the enterprise segment" (shows list with criteria)
- "Review this PR pitch to TechCrunch" (shows full pitch text)

**UX:**
- Expanded card in the Approvals panel
- Full content preview with scroll
- Inline editing capability (click to edit text, adjust fields)
- "View in [App]" link for full editing in the source app's UI
- Approve button
- Reject button with reason
- Any edits made before approval are captured as training data

### 3.3 Strategic Approval

**What it is:** A decision that affects direction, not just a single output. Requires understanding context and implications.

**Classification criteria:**
- The action changes targeting criteria, messaging angle, or campaign parameters
- The action affects multiple future outputs (changing ICP impacts all future outreach)
- The action involves budget or resource allocation
- The Oracle flagged this as a strategic recommendation
- The system's confidence in the right answer is low (< 50) regardless of action type

**Examples:**
- "I recommend shifting outbound targeting from Series A to Series B based on 60 days of data" (shows supporting evidence)
- "Recommend changing the primary messaging angle from cost savings to risk reduction" (shows performance data)
- "Recommend pausing the healthcare vertical until compliance review is complete" (shows reasoning)
- "Recommend increasing email cadence from 3-day to 2-day intervals based on reply rate data" (shows analysis)

**UX:**
- Detailed card with full context, reasoning, and supporting data
- The system explains WHY it's recommending this change
- Impact analysis: "If approved, this will affect X outreach sequences and Y content pieces"
- "Discuss with [System Name]" link that opens a Chat thread about this specific decision
- Approve / Reject buttons
- Strategic approvals are never auto-approved regardless of confidence thresholds

---

## 4. The Approval Pipeline

When an agent produces work that needs human sign-off, this pipeline runs:

### 4.1 Step 1: Brand Consistency Gate

Before the approval is created, the work product passes through a brand consistency check:

**Input:** The generated content + the Voice and Brand layers from Cortex

**Check:** Claude Haiku evaluates whether the content matches the calibrated voice:
- Tone within acceptable range (formality, warmth, humor, authority sliders)
- Vocabulary matches jargon_level and sentence_complexity settings
- No messaging patterns that contradict established patterns
- Visual elements (if applicable) match brand tokens

**Pass:** Content proceeds to the next gate.

**Fail:** Content is returned to the originating agent with specific feedback: "Tone is too casual for this audience. Formality score is 30, target is 65+. Revise and resubmit." The agent revises and resubmits. This loop can repeat up to 3 times. If it still fails after 3 attempts, the approval is created with a flag: "Brand consistency check: marginal pass after revision."

**The user never sees off-brand work in their approval queue.** The internal revision cycle is invisible.

### 4.2 Step 2: Quality Gate

Domain-specific quality checks based on the source app:

**Harvest (outbound):**
- CAN-SPAM compliance (unsubscribe, physical address, no deceptive headers)
- Email deliverability best practices (no spam trigger words, reasonable length)
- Cadence checks (not emailing the same person too frequently)
- Personalization validation (merge fields populated, no "[First Name]" placeholders)

**Dark Madder (content):**
- Factual accuracy check (no hallucinated statistics or claims)
- SEO basics (title tag, meta description, heading structure)
- Readability score within target range
- No plagiarism flags

**Litmus (PR):**
- Journalist relevance check (is this journalist likely to cover this topic?)
- Publication tone match (pitch tone matches the target outlet)
- Embargo/exclusivity rules respected
- No simultaneous duplicate pitches

**Hypothesis (landing pages):**
- Conversion best practices (clear CTA, above-fold value prop)
- Mobile responsiveness check
- Load time estimate
- A/B test validity (if applicable)

**Pass:** Content proceeds.
**Fail:** Returned to agent with specific feedback, same revision loop as brand gate.

### 4.3 Step 3: Classification

The system classifies the approval type (quick / review / strategic) using the criteria from Section 3.

Classification logic in `lib/approvals/classify.ts`:

```typescript
function classifyApproval(action: AgentAction, history: ApprovalHistory, cortexConfidence: number): ApprovalType {
  // Strategic: always if it changes targeting, messaging angle, budget, or cross-app parameters
  if (action.changesStrategy || action.affectsMultipleOutputs || action.involvesBudget) {
    return 'strategic';
  }

  // Strategic: if confidence is very low regardless of action type
  if (cortexConfidence < 50 && action.confidenceScore < 40) {
    return 'strategic';
  }

  // Quick: short content + routine action + history of approval
  if (
    action.contentLength < 500 &&
    history.categoryApprovalCount > 5 &&
    !action.hasStrategicImplications
  ) {
    return 'quick';
  }

  // Default: review
  return 'review';
}
```

### 4.4 Step 4: Confidence Check

Calculate the action's confidence score (Section 2.2) and compare against the category threshold (Section 2.3):

**Confidence >= Threshold:** Auto-approve. The action executes immediately. A record is created in `kinetiks_approvals` with `status: 'auto_approved'` and `auto_approved: true`. Logged in the Ledger. The user can review auto-approved actions in the Ledger and flag them if they were wrong (triggering trust contraction).

**Confidence < Threshold:** Queue for human approval. A record is created in `kinetiks_approvals` with `status: 'pending'`. The approval card appears in the Approvals panel. Desktop notification sent if the app is backgrounded.

**Exception:** Strategic approvals are never auto-approved regardless of confidence.

### 4.5 Step 5: Queue & Notify

The approval enters the queue:

- Badge count on the Approvals toggle updates
- Desktop notification (if Electron app, backgrounded): "[System Name] needs your approval on a Harvest follow-up email"
- Slack notification (if connected): DM from the system with a summary and link
- Email notification (if configured): digest of pending approvals

Queue sort order: Strategic first, then Review, then Quick. Within each type: most recent first.

---

## 5. The Learning Loop

Every approval interaction is a training signal. This is how the system gets smarter over time.

### 5.1 Approved Without Changes

**Signal:** Strong positive. The system got it right.

**Effects:**
- Consecutive approval counter for this category increments
- Category approval rate recalculated
- Confidence for similar future actions increases marginally
- If auto-approval threshold reduction criteria met (20 consecutive), threshold drops

**Logged:** Ledger entry with `event_type: 'approval_approved'`, no diff.

### 5.2 Approved With Edits

**Signal:** Partial positive. The system was close but not perfect.

**Effects:**
- The diff between original and edited version is captured in `kinetiks_approvals.user_edits`
- The diff is analyzed by Claude Haiku to classify the edit type:
  - **Tone adjustment** → feeds back as a Proposal to refine the Voice layer
  - **Factual correction** → feeds back as context enrichment
  - **Targeting adjustment** → feeds back as a Proposal to refine the Customers layer
  - **Structural change** → feeds back as a content preference signal
  - **Minor polish** → minimal signal (typo fixes, word choice preferences)
- Edit rate for this category recalculated
- Consecutive "clean approval" counter resets (edits break the streak)
- Confidence does not increase for this category

**Logged:** Ledger entry with `event_type: 'approval_approved_with_edits'`, full diff, edit classification.

**Proposal generation:** If the edit analysis reveals something systematic (e.g., the user always softens the CTA language), a Proposal is generated: "User consistently reduces CTA aggressiveness in outbound emails. Recommend adjusting the tone.authority setting from 75 to 60." This Proposal goes through normal Cortex evaluation.

### 5.3 Rejected With Reason

**Signal:** Negative. The system got it wrong.

**Effects:**
- Rejection reason text is analyzed by Claude Haiku to classify:
  - **Wrong audience** → Proposal to update Customers/targeting
  - **Wrong timing** → temporal learning signal
  - **Wrong tone** → Proposal to update Voice
  - **Wrong content/angle** → Proposal to update Narrative or messaging_patterns
  - **Factually incorrect** → context correction
  - **Strategically wrong** → broader recalibration signal
- Trust contraction (Section 2.4) triggers for this category
- Consecutive approval counter resets to 0
- Threshold increases

**Logged:** Ledger entry with `event_type: 'approval_rejected'`, reason text, reason classification.

### 5.4 Expired

**Signal:** Weak negative. The system queued something the user didn't care about.

**Effects:**
- Expiration counter for this category increments
- If many approvals expire (>30% expiration rate in a category), the system reduces the frequency of generating this type of action
- No threshold change (expiration is ambiguous — the user might have been busy)

**Logged:** Ledger entry with `event_type: 'approval_expired'`.

### 5.5 Batch Approved

When the user clicks "Approve all quick approvals":

**Signal:** Moderate positive. The user trusts the system's quick decisions enough to batch them.

**Effects:**
- Each individual approval gets the "approved without changes" treatment
- An additional signal: the user is comfortable batch-approving this category
- After 3 batch approvals in 7 days for a category, the system flags this category as a candidate for threshold reduction

**Logged:** Each approval logged individually, plus a meta-entry for the batch action.

---

## 6. Approval Lifecycle and Expiration

### 6.1 Status Transitions

```
pending → approved          (user approves)
pending → rejected          (user rejects with reason)
pending → expired           (expiration window passes)
pending → auto_approved     (confidence gate auto-approves on creation — never actually enters pending)
approved → flagged          (user later flags as wrong — triggers trust contraction)
auto_approved → flagged     (user reviews auto-approved action in Ledger, flags it)
```

### 6.2 Expiration

Each approval has an optional expiration window based on urgency:

- **Time-sensitive actions** (follow-up emails, meeting scheduling): 24 hours
- **Campaign actions** (sequence launch, content publish): 72 hours
- **Strategic decisions** (targeting change, messaging shift): 7 days
- **No expiration** set for actions that remain valid indefinitely

When an approval is about to expire (4 hours before for 24h, 24 hours before for 72h/7d):
- Reminder notification sent
- The system can optionally re-queue with updated context if the situation has changed

### 6.3 Approval History

All approval history is queryable for the learning loop and for user review:

- Filter by: status, type, source app, date range, action category
- Accessible from the Ledger in the Cortex tab
- Summary statistics: approval rate, edit rate, average time-to-decision per category
- These statistics are visible to the user so they can understand how the system is calibrating

---

## 7. Standalone App Approvals vs Kinetiks Approvals

### 7.1 Standalone App Mode

When an app is used standalone (not connected to Kinetiks), the app handles its own approval flow internally. This is simpler:

- No confidence-based autonomy (always ask for significant actions)
- Approvals appear within the app's own UI (not in a central queue)
- No cross-app learning (edits in Dark Madder don't affect Harvest's confidence)
- Brand gate still runs against the Context Structure (which exists even for standalone users)
- Quality gate still runs (app-specific best practices)
- No strategic approval type (no cross-app implications in standalone mode)

### 7.2 Kinetiks-Connected Mode

When the app is connected to Kinetiks, its approval flow changes:

- Approvals generated by the app's agents flow to the central Kinetiks approval queue
- Confidence-based autonomy applies (thresholds, auto-approval, trust contraction)
- Cross-app learning applies (patterns from one app inform another)
- Full approval type taxonomy (quick/review/strategic)
- The user manages all approvals from one place (the Kinetiks Chat sidebar)

### 7.3 Transition

When a standalone user connects to Kinetiks:
- Any pending in-app approvals migrate to the central queue
- Historical approval data from the standalone app seeds the initial confidence calculations
- Thresholds start at defaults but benefit from existing history

---

## 8. API Design

### 8.1 Approval Submission (from app agents)

```
POST /api/approvals/submit
```

Called by app Synapses when an agent produces work needing approval.

```typescript
interface ApprovalSubmission {
  source_app: string;            // 'harvest', 'dark_madder', etc.
  source_operator: string;       // Which agent generated this
  action_category: string;       // 'outbound_email_followup', 'content_publish', etc.
  title: string;                 // Human-readable title
  description: string;           // Brief context
  preview: ApprovalPreview;      // Full content preview (structure varies by type)
  deep_link: string;             // URL to edit in source app
  agent_confidence: number;      // 0-100, the agent's self-assessed confidence
  changes_strategy: boolean;     // Does this affect targeting/messaging/budget?
  affects_multiple_outputs: boolean;
  content_length: number;        // Character count of the content
  expires_in_hours: number | null;
}

interface ApprovalPreview {
  type: 'email' | 'content' | 'sequence' | 'prospect_list' | 'pitch' | 'social_post' | 'config_change';
  content: Record<string, any>;  // Type-specific preview data
}
```

**Response:** The approval record ID and whether it was auto-approved or queued.

### 8.2 Approval Action (from user)

```
POST /api/approvals/action
```

Called when the user approves, rejects, or edits an approval.

```typescript
interface ApprovalAction {
  approval_id: string;
  action: 'approve' | 'reject';
  edits: Record<string, any> | null;  // Diff of user changes (null if no edits)
  rejection_reason: string | null;     // Required if action is 'reject'
}
```

**Response:** Updated approval record. Side effects: learning loop triggers, Ledger entry, confidence recalculation, Proposal generation if edits warrant it.

### 8.3 Approval List (for the panel)

```
GET /api/approvals/list?status=pending
```

Returns pending approvals sorted by type (strategic → review → quick) then recency. Includes all data needed to render approval cards.

### 8.4 Threshold Management

```
GET /api/approvals/thresholds
POST /api/approvals/thresholds
```

Read and update per-category autonomy thresholds. The POST endpoint handles both automatic calibration (called by the learning loop) and user overrides (called from settings).

### 8.5 Confidence Calculation

```
POST /api/approvals/confidence
```

Internal endpoint. Calculates confidence score for a pending action. Called during the approval pipeline (Step 4). Not user-facing.

---

## 9. Database Tables

Defined in CLAUDE.md. Key tables for this system:

- `kinetiks_approvals` — The approval queue and history
- `kinetiks_approval_thresholds` — Per-category autonomy thresholds and history
- `kinetiks_ledger` — Audit trail (approval events logged here)

See CLAUDE.md Database Schema > New Tables for full schemas.

---

## 10. Implementation Priority

This system is built in Phase 2 of the build plan. Dependencies:

**Requires (from Phase 1):**
- The Chat tab with left sidebar toggle (where the Approvals panel lives)
- The Cortex tab with Ledger view (where approval history is visible)
- Basic app shell and routing

**Does not require:**
- The Oracle / Analytics (Phase 5) — approvals work independently of analytics
- Cross-app command routing (Phase 4) — approvals can be submitted directly by apps
- Agent communication layer (Phase 6) — notifications can start with in-app only

### 10.1 Build Order Within Phase 2

1. **Database migration:** Create `kinetiks_approvals` and `kinetiks_approval_thresholds` tables with RLS policies.

2. **Core approval logic:**
   - `lib/approvals/classify.ts` — Approval type classification
   - `lib/approvals/confidence-gate.ts` — Confidence calculation and threshold comparison
   - `lib/approvals/learning-loop.ts` — Training signal extraction from approval decisions
   - `lib/approvals/brand-gate.ts` — Brand consistency validation
   - `lib/approvals/quality-gate.ts` — Domain-specific quality checks

3. **API routes:**
   - `api/approvals/submit/route.ts` — Approval submission from Synapses
   - `api/approvals/action/route.ts` — User approve/reject
   - `api/approvals/list/route.ts` — Pending approval list
   - `api/approvals/thresholds/route.ts` — Threshold management
   - `api/approvals/confidence/route.ts` — Confidence calculation

4. **UI components:**
   - `ApprovalPanel.tsx` — The sidebar panel
   - `ApprovalCard.tsx` — Card component with quick/review/strategic variants
   - `InlineEditor.tsx` — Edit-in-place for review approvals
   - `RejectReasonInput.tsx` — Rejection reason capture
   - `ApprovalBadge.tsx` — Badge count on sidebar toggle

5. **Learning loop integration:**
   - Wire approval decisions to Ledger logging
   - Wire edit analysis to Proposal generation
   - Wire rejection analysis to confidence recalculation
   - Wire consecutive approvals to threshold calibration

6. **Notification system:**
   - In-app badge updates (real-time via Supabase Realtime)
   - Desktop notifications (Electron API)
   - Slack notifications (existing Marcus Slack bot)

---

## 11. Edge Cases

### 11.1 Conflicting Approvals

Two approvals that contradict each other (e.g., "send follow-up email A" and "send follow-up email B" to the same prospect):

- The system detects conflicts before queuing and presents only the recommended option
- If both are already queued: approving one auto-rejects the other with reason "superseded by approved alternative"

### 11.2 Stale Approvals

An approval that was relevant when created but circumstances have changed:

- When the user opens an approval, the system checks if the context has changed materially
- If stale: the card shows a warning "Context has changed since this was generated" with a "Regenerate" option
- Example: prospect replied since the follow-up was drafted → approval shows "This prospect replied 2 hours ago. This follow-up may no longer be appropriate."

### 11.3 High-Volume Queues

If many approvals accumulate (user was away for a week):

- Group similar approvals: "12 follow-up emails ready for review" with expand-to-individual
- Batch action available for groups: "Approve all 12" or "Review individually"
- Prioritize by urgency: time-sensitive items at top with expiration warnings

### 11.4 Multi-User / Team

When multiple team members can approve (future multi-seat):

- Any team member with approval permission can act on any pending approval
- First action wins — subsequent attempts show "Already approved by [name]"
- Approval permissions are role-based (admin: all, editor: review+quick, viewer: none)

### 11.5 Offline / App Closed

When the user isn't available:

- Approvals queue up normally
- Time-sensitive approvals expire per their window
- The daily brief includes a summary of expired approvals and what the system did (or didn't do) as a result
- No action is taken on expired approvals unless the user has explicitly set an "on expire" policy for that category
