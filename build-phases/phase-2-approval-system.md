# Phase 2: Approval System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confidence-based approval system — the trust architecture that determines what agents can do autonomously and what requires human sign-off.

**Architecture:** A pipeline that intercepts agent work products, validates them against brand and quality gates, classifies approval type, checks confidence against thresholds, and either auto-approves or queues for human review. Every approval interaction feeds back into the system as a learning signal. The approval UI lives in the Chat tab's left sidebar as a toggleable panel.

**Tech Stack:** Next.js 14, TypeScript, Supabase (Postgres + Realtime), Anthropic Claude API (Haiku for classification/analysis)

**Spec Reference:** `docs/specs/approval-system-spec.md` — read the ENTIRE spec before starting.

**Architectural Principles:**
- The approval module is self-contained. It exports interfaces that other systems call. It never reaches into Cortex, Marcus, or app code directly.
- All learning loop logic is event-driven. Approval actions emit events. Listeners process them. No tight coupling.
- Confidence calculations are pure functions. Given inputs, they produce deterministic outputs. Easy to test, easy to tune.
- Every approval state change is logged to the Ledger. No silent mutations.

---

## File Structure

```
apps/id/src/
  lib/
    approvals/
      types.ts                      # All approval-related types
      classify.ts                   # Classify approval type (quick/review/strategic)
      confidence.ts                 # Confidence score calculation (pure function)
      threshold.ts                  # Threshold management (read, calibrate, override)
      brand-gate.ts                 # Brand consistency check (calls Claude Haiku)
      quality-gate.ts               # Domain-specific quality checks
      learning-loop.ts              # Extract training signals from approval decisions
      edit-analyzer.ts              # Analyze diffs between original and user-edited versions
      pipeline.ts                   # The full approval pipeline (orchestrates all steps)
      events.ts                     # Event emitter for approval state changes
  app/
    api/
      approvals/
        submit/route.ts             # POST — Synapse submits work for approval
        action/route.ts             # POST — User approves/rejects
        list/route.ts               # GET — List pending approvals
        thresholds/route.ts         # GET/POST — Read/update thresholds
        batch/route.ts              # POST — Batch approve quick approvals
        flag/route.ts               # POST — Flag a previously approved/auto-approved action as wrong
  components/
    approvals/
      ApprovalPanel.tsx             # The sidebar panel (replaces Phase 1 placeholder)
      ApprovalCard.tsx              # Card component with type variants
      QuickApprovalCard.tsx         # Compact card for quick approvals
      ReviewApprovalCard.tsx        # Expanded card with content preview + inline editing
      StrategicApprovalCard.tsx     # Detailed card with reasoning + impact analysis
      InlineEditor.tsx              # Edit-in-place within review cards
      RejectModal.tsx               # Rejection reason modal
      ApprovalBadge.tsx             # Badge count on sidebar toggle
      BatchApproveBar.tsx           # "Approve all quick" action bar
      EmptyApprovals.tsx            # Empty state when no pending approvals

supabase/
  migrations/
    000XX_approval_system.sql       # New tables: kinetiks_approvals, kinetiks_approval_thresholds
```

---

## Database Migration

**Tables to create:**

```sql
-- Approval queue and history
CREATE TABLE kinetiks_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  source_app text NOT NULL,
  source_operator text,
  action_category text NOT NULL,
  approval_type text NOT NULL CHECK (approval_type IN ('quick', 'review', 'strategic')),
  title text NOT NULL,
  description text,
  preview jsonb NOT NULL,
  deep_link text,
  status text DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'expired', 'auto_approved', 'flagged'
  )),
  confidence_score numeric(5,2),
  auto_approved boolean DEFAULT false,
  user_edits jsonb,
  rejection_reason text,
  edit_classification jsonb,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  acted_at timestamptz
);

-- RLS
ALTER TABLE kinetiks_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own approvals" ON kinetiks_approvals
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_approvals_account_status ON kinetiks_approvals(account_id, status);
CREATE INDEX idx_approvals_account_category ON kinetiks_approvals(account_id, action_category);

-- Autonomy thresholds per action category
CREATE TABLE kinetiks_approval_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts NOT NULL,
  action_category text NOT NULL,
  auto_approve_threshold numeric(5,2) DEFAULT 100,
  override_rule text CHECK (override_rule IN ('always_approve', 'always_ask', 'confidence_based')),
  consecutive_approvals integer DEFAULT 0,
  approval_rate numeric(5,2) DEFAULT 0,
  edit_rate numeric(5,2) DEFAULT 0,
  last_rejection_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(account_id, action_category)
);

ALTER TABLE kinetiks_approval_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own thresholds" ON kinetiks_approval_thresholds
  FOR ALL USING (account_id IN (
    SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()
  ));
```

---

## Task 1: Types and Interfaces

Define all approval-related types. These are the contracts that every other piece depends on.

**File:** `apps/id/src/lib/approvals/types.ts`

```typescript
// Key types to define:

export type ApprovalType = 'quick' | 'review' | 'strategic';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved' | 'flagged';
export type ActionCategory = string; // 'outbound_email_followup' | 'content_publish' | etc.
export type OverrideRule = 'always_approve' | 'always_ask' | 'confidence_based';

export interface ApprovalSubmission {
  source_app: string;
  source_operator: string;
  action_category: ActionCategory;
  title: string;
  description: string;
  preview: ApprovalPreview;
  deep_link: string;
  agent_confidence: number;
  changes_strategy: boolean;
  affects_multiple_outputs: boolean;
  content_length: number;
  expires_in_hours: number | null;
}

export interface ApprovalPreview {
  type: 'email' | 'content' | 'sequence' | 'prospect_list' | 'pitch' | 'social_post' | 'config_change' | 'budget';
  content: Record<string, unknown>;
}

export interface ApprovalRecord { /* full DB record shape */ }
export interface ApprovalAction { approval_id: string; action: 'approve' | 'reject'; edits: Record<string, unknown> | null; rejection_reason: string | null; }
export interface ApprovalThreshold { /* threshold record shape */ }
export interface ConfidenceInputs { cortex_confidence: number; category_history: CategoryHistory; action_specificity: number; agent_confidence: number; }
export interface CategoryHistory { approval_count: number; approval_rate: number; edit_rate: number; consecutive_clean: number; last_rejection_at: string | null; }
export interface ConfidenceResult { score: number; breakdown: Record<string, number>; auto_approve: boolean; reason: string; }
export interface EditAnalysis { edit_type: string; description: string; proposal_generated: boolean; }
export interface ApprovalEvent { type: string; approval: ApprovalRecord; metadata: Record<string, unknown>; }
```

**Steps:**
- [ ] Create `types.ts` with all interfaces fully defined
- [ ] Ensure all types are exported and importable
- [ ] Commit: `feat(approvals): define approval system types and interfaces`

---

## Task 2: Confidence Calculation

Build the pure function that calculates confidence for an action.

**File:** `apps/id/src/lib/approvals/confidence.ts`

**Logic:** Weighted calculation from four signals:
- Cortex confidence (40%): aggregate confidence from kinetiks_confidence
- Category history (30%): approval rate, edit rate, rejection recency
- Action specificity (20%): from the submission's agent_confidence + novelty assessment
- Source agent confidence (10%): the agent's self-assessment

**Key behaviors:**
- Recent rejections (within 7 days) apply a heavy penalty
- High edit rates (>50%) cap the category history component at 50% of max
- New categories with no history default to 30 for category component
- Output: 0-100 score + breakdown + auto_approve boolean

**Steps:**
- [ ] Write tests for confidence calculation covering: new category (no history), established category (high approval rate), recently rejected category, high edit rate category
- [ ] Implement `calculateConfidence(inputs: ConfidenceInputs): ConfidenceResult`
- [ ] Run tests, verify all pass
- [ ] Commit: `feat(approvals): add confidence score calculation`

---

## Task 3: Classification

Build the function that classifies approval type.

**File:** `apps/id/src/lib/approvals/classify.ts`

**Logic (from spec Section 3):**
- Strategic if: changes_strategy, affects_multiple_outputs, involves budget, or confidence < 40
- Quick if: content_length < 500, category has >5 prior approvals, no strategic implications
- Default: review

**Steps:**
- [ ] Write tests for each classification path
- [ ] Implement `classifyApproval(submission: ApprovalSubmission, history: CategoryHistory, cortexConfidence: number): ApprovalType`
- [ ] Run tests, verify
- [ ] Commit: `feat(approvals): add approval type classification`

---

## Task 4: Threshold Management

Build threshold reading, calibration, and override logic.

**File:** `apps/id/src/lib/approvals/threshold.ts`

**Functions:**
- `getThreshold(accountId, category)` — read from DB, return default if none exists
- `calibrateThreshold(accountId, category, event)` — adjust based on approval events (consecutive approvals → lower threshold, rejection → raise threshold)
- `setOverride(accountId, category, rule)` — user explicitly sets always_approve/always_ask/confidence_based

**Key behaviors:**
- Default thresholds per category (from spec Section 2.3 table)
- Auto-calibration: 20 consecutive clean approvals → -5 points, 50 consecutive → another -5
- Trust contraction: single rejection → +10, two in 7 days → +20, three in 7 days → reset to 100
- Override rules always take precedence over calculated thresholds

**Steps:**
- [ ] Write tests for: default thresholds, auto-calibration, trust contraction, override behavior
- [ ] Implement all three functions
- [ ] Run tests, verify
- [ ] Commit: `feat(approvals): add threshold management with auto-calibration and trust contraction`

---

## Task 5: Brand and Quality Gates

Build the pre-approval quality checks.

**Files:**
- `apps/id/src/lib/approvals/brand-gate.ts`
- `apps/id/src/lib/approvals/quality-gate.ts`

**Brand gate:** Takes content + Voice layer data from Cortex. Calls Claude Haiku to evaluate tone, vocabulary, and messaging consistency. Returns pass/fail with feedback. On fail, returns specific revision instructions. Up to 3 retry cycles before marginal pass.

**Quality gate:** Takes content + source_app. Applies domain-specific checks based on which app generated it:
- Harvest: CAN-SPAM basics, cadence checks, personalization validation
- Dark Madder: factual accuracy flag, readability, SEO basics
- Litmus: journalist relevance, pitch tone
- Generic fallback for unknown apps

**Important:** These gates are pluggable. Each app can register its own quality checks. Phase 2 builds the framework + Harvest checks. Other app checks are added when those apps integrate.

**Steps:**
- [ ] Write tests for brand gate: passing content, failing content (tone mismatch), marginal content
- [ ] Implement brand gate with Claude Haiku integration
- [ ] Write tests for quality gate: Harvest email checks, generic fallback
- [ ] Implement quality gate with pluggable app-specific checks
- [ ] Run tests, verify
- [ ] Commit: `feat(approvals): add brand consistency and quality gates`

---

## Task 6: The Approval Pipeline

Orchestrate all pieces into the full pipeline.

**File:** `apps/id/src/lib/approvals/pipeline.ts`

**Pipeline steps:**
1. Brand gate → pass or revise
2. Quality gate → pass or revise
3. Classify (quick/review/strategic)
4. Calculate confidence
5. Check against threshold
6. Auto-approve or create pending record
7. Emit event (for Realtime, notifications, Ledger)

**Function:** `processApproval(submission: ApprovalSubmission, accountId: string): Promise<{ approval_id: string; auto_approved: boolean; approval_type: ApprovalType }>`

**Steps:**
- [ ] Write integration tests for: full pipeline happy path (auto-approved), full pipeline queued, brand gate failure and revision
- [ ] Implement `processApproval` orchestrating all steps
- [ ] Wire to Supabase for record creation
- [ ] Wire Ledger logging for every approval creation
- [ ] Run tests, verify
- [ ] Commit: `feat(approvals): add full approval pipeline orchestration`

---

## Task 7: Learning Loop

Build the system that extracts training signals from approval decisions.

**Files:**
- `apps/id/src/lib/approvals/learning-loop.ts`
- `apps/id/src/lib/approvals/edit-analyzer.ts`

**Learning loop functions:**
- `processApprovalDecision(approval: ApprovalRecord, action: ApprovalAction)` — the main handler called when a user approves/rejects
  - Updates threshold statistics (consecutive count, approval rate, edit rate)
  - Calls `calibrateThreshold` for threshold adjustment
  - If edits exist: calls `analyzeEdits`
  - If rejection: classifies rejection reason
  - Logs to Ledger
  - Generates Cortex Proposals when edits reveal systematic patterns

**Edit analyzer:**
- `analyzeEdits(original: Record<string, unknown>, edited: Record<string, unknown>, context: ApprovalRecord): Promise<EditAnalysis[]>`
- Computes diff between original and edited content
- Calls Claude Haiku to classify each edit: tone adjustment, factual correction, targeting adjustment, structural change, minor polish
- Returns classifications that feed into the learning loop

**Steps:**
- [ ] Write tests for: approval without edits (counter increments), approval with edits (counter resets, edits analyzed), rejection (trust contraction triggers)
- [ ] Implement `processApprovalDecision`
- [ ] Implement `analyzeEdits` with Claude Haiku classification
- [ ] Wire Proposal generation for systematic edit patterns
- [ ] Run tests, verify
- [ ] Commit: `feat(approvals): add learning loop with edit analysis and Proposal generation`

---

## Task 8: API Routes

Build all approval API endpoints.

**Files:**
- `apps/id/src/app/api/approvals/submit/route.ts`
- `apps/id/src/app/api/approvals/action/route.ts`
- `apps/id/src/app/api/approvals/list/route.ts`
- `apps/id/src/app/api/approvals/thresholds/route.ts`
- `apps/id/src/app/api/approvals/batch/route.ts`
- `apps/id/src/app/api/approvals/flag/route.ts`

Each route: auth check → validate input → call the appropriate lib function → return response.

**Key route behaviors:**
- `submit`: calls `processApproval`, returns approval_id + auto_approved status
- `action`: calls `processApprovalDecision`, returns updated record
- `list`: queries kinetiks_approvals with status filter, sorted by type then recency
- `thresholds`: GET returns all thresholds, POST updates a specific one
- `batch`: approves all pending quick approvals for the account
- `flag`: marks an approved/auto_approved action as wrong, triggers trust contraction

**Steps:**
- [ ] Implement submit route with pipeline integration
- [ ] Implement action route with learning loop integration
- [ ] Implement list route with sorting logic (strategic → review → quick)
- [ ] Implement thresholds route (GET + POST)
- [ ] Implement batch route
- [ ] Implement flag route
- [ ] Verify: all routes work with test data
- [ ] Commit: `feat(approvals): add all approval API routes`

---

## Task 9: Approval Panel UI

Build the approval panel that lives in the Chat sidebar.

**Files:** All components in `components/approvals/`

**ApprovalPanel.tsx:** Fetches pending approvals, renders list of cards. Subscribes to Supabase Realtime for live updates (new approvals appear without refresh). Shows empty state when queue is clear.

**ApprovalCard.tsx:** Factory component that renders the correct variant based on `approval_type`.

**QuickApprovalCard.tsx:** Compact. Shows title, source app badge, content preview (full text visible), approve/reject buttons. Reject opens RejectModal.

**ReviewApprovalCard.tsx:** Expanded. Shows title, source app, full content preview with scroll. InlineEditor for editable fields. "View in [App]" link. Approve/reject buttons.

**StrategicApprovalCard.tsx:** Detailed. Shows title, source app, full context, Oracle reasoning, impact analysis. "Discuss with [System Name]" link that opens a Chat thread. Approve/reject buttons.

**BatchApproveBar.tsx:** Appears at top of panel when there are >3 quick approvals. "Approve all X quick approvals" button.

**ApprovalBadge.tsx:** Badge on the SidebarToggle showing count of pending approvals. Updates in real-time via Supabase Realtime subscription.

**Steps:**
- [ ] Replace Phase 1 ApprovalPanel placeholder with real component
- [ ] Build QuickApprovalCard with approve/reject actions
- [ ] Build RejectModal with reason input
- [ ] Build ReviewApprovalCard with InlineEditor
- [ ] Build StrategicApprovalCard with reasoning display
- [ ] Build ApprovalCard factory
- [ ] Build BatchApproveBar
- [ ] Wire ApprovalBadge to real-time count from Supabase
- [ ] Wire all card actions to API routes
- [ ] Verify: approval cards render correctly for each type, approve/reject works, badge updates
- [ ] Commit: `feat(approvals): add approval panel UI with card variants`

---

## Task 10: Real-Time Updates

Wire Supabase Realtime so approvals appear instantly.

**What to wire:**
- New approval inserted → ApprovalPanel adds the card, badge increments
- Approval status changed → card updates or removes from pending list
- Threshold changed → any open threshold management UI updates

**Implementation:**
- Subscribe to `kinetiks_approvals` table changes filtered by account_id and status='pending'
- Subscribe to `kinetiks_approval_thresholds` table changes filtered by account_id

**Steps:**
- [ ] Set up Realtime subscriptions in ApprovalPanel
- [ ] Set up Realtime subscription for ApprovalBadge
- [ ] Verify: create a test approval via API, confirm it appears in the panel immediately
- [ ] Verify: approve an item, confirm it disappears from the panel immediately
- [ ] Commit: `feat(approvals): add real-time updates for approval panel`

---

## Task 11: End-to-End Verification

**Verification checklist:**
- [ ] Submit an approval via API → it appears in the panel with correct type
- [ ] Quick approval: approve inline → status updates, Ledger entry created, threshold stats update
- [ ] Quick approval: reject with reason → reason saved, trust contraction triggers, Ledger entry
- [ ] Review approval: edit content before approving → edit diff saved, edit analysis runs, Ledger entry
- [ ] Strategic approval: appears with reasoning, "Discuss" link works
- [ ] Batch approve: multiple quick approvals approved at once
- [ ] Auto-approval: submit with confidence above threshold → auto_approved, no card in panel, Ledger entry
- [ ] Flag: flag an auto-approved action → status changes to flagged, trust contracts
- [ ] Threshold override: set "always ask" for a category → subsequent submissions are never auto-approved
- [ ] Real-time: approval appears in panel within 1 second of submission
- [ ] Badge count: accurate and updates in real-time
- [ ] Brand gate: submit off-brand content → pipeline retries before creating approval
- [ ] `pnpm build` passes
- [ ] Commit: `chore: phase 2 complete — approval system verified`
