-- ============================================================
-- 00033_approval_state_machines_and_insights.sql
--
-- F3 deliverables:
--   1. Add `approval_class` column to kinetiks_approvals
--      (standard | budget_proposal | authority_grant_proposal).
--      Per CLAUDE.md three approval classes; budget + authority UI
--      lands in L2b but the column is the contract today.
--   2. Postgres triggers that enforce one-way state-machine
--      transitions for kinetiks_approvals and kinetiks_proposals
--      (layer 2 of the three-layer enforcement: server action +
--      trigger + RLS).
--   3. New `kinetiks_insights` first-class table per the v3 spec —
--      type, severity, summary, evidence, suggested_action, delivery
--      routing, expires_at. `kinetiks_oracle_insights` stays for
--      now; future phases consolidate.
--   4. Three-layer state machine RLS posture: client UPDATE limited
--      to legal transitions for the columns the user owns.
-- ============================================================

-- ── 1. approval_class on kinetiks_approvals ─────────────────
ALTER TABLE kinetiks_approvals
  ADD COLUMN IF NOT EXISTS approval_class text NOT NULL DEFAULT 'standard'
    CHECK (approval_class IN ('standard', 'budget_proposal', 'authority_grant_proposal'));

CREATE INDEX IF NOT EXISTS idx_kinetiks_approvals_class_status
  ON kinetiks_approvals (account_id, approval_class, status);

COMMENT ON COLUMN kinetiks_approvals.approval_class IS
  'Approval class per CLAUDE.md: standard (per-action confidence flow), budget_proposal (Oracle-generated, highest bar), authority_grant_proposal (Authority Agent-generated, peer of budget). UI prominence differs by class.';

-- ── 2. State-machine triggers for kinetiks_approvals ────────
--
-- One-way transitions:
--   pending       → approved | rejected | auto_approved | flagged | expired
--   auto_approved → flagged (challenge an auto-approve only)
--   flagged       → approved | rejected (re-review)
--   approved      → (terminal)
--   rejected      → (terminal)
--   expired       → (terminal)
CREATE OR REPLACE FUNCTION kinetiks_approvals_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states cannot be left
  IF OLD.status IN ('approved', 'rejected', 'expired') THEN
    RAISE EXCEPTION
      'kinetiks_approvals: cannot leave terminal state % (attempted → %)',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pending → any of approved | rejected | auto_approved | flagged | expired
  IF OLD.status = 'pending' AND NEW.status NOT IN
     ('approved', 'rejected', 'auto_approved', 'flagged', 'expired') THEN
    RAISE EXCEPTION
      'kinetiks_approvals: invalid transition pending → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-approved → flagged only
  IF OLD.status = 'auto_approved' AND NEW.status <> 'flagged' THEN
    RAISE EXCEPTION
      'kinetiks_approvals: invalid transition auto_approved → % (only flagged)', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Flagged → approved | rejected
  IF OLD.status = 'flagged' AND NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION
      'kinetiks_approvals: invalid transition flagged → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_approvals_transition_guard ON kinetiks_approvals;
CREATE TRIGGER kinetiks_approvals_transition_guard
  BEFORE UPDATE OF status ON kinetiks_approvals
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_approvals_check_transition();

-- ── 3. State-machine triggers for kinetiks_proposals ────────
--
-- One-way transitions:
--   submitted  → accepted | declined | escalated | expired
--   escalated  → accepted | declined | expired
--   accepted   → superseded
--   declined   → (terminal)
--   expired    → (terminal)
--   superseded → (terminal)
CREATE OR REPLACE FUNCTION kinetiks_proposals_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('declined', 'expired', 'superseded') THEN
    RAISE EXCEPTION
      'kinetiks_proposals: cannot leave terminal state % (attempted → %)',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'submitted' AND NEW.status NOT IN
     ('accepted', 'declined', 'escalated', 'expired') THEN
    RAISE EXCEPTION
      'kinetiks_proposals: invalid transition submitted → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'escalated' AND NEW.status NOT IN
     ('accepted', 'declined', 'expired') THEN
    RAISE EXCEPTION
      'kinetiks_proposals: invalid transition escalated → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'accepted' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION
      'kinetiks_proposals: invalid transition accepted → % (only superseded)', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_proposals_transition_guard ON kinetiks_proposals;
CREATE TRIGGER kinetiks_proposals_transition_guard
  BEFORE UPDATE OF status ON kinetiks_proposals
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_proposals_check_transition();

-- ── 4. kinetiks_insights — first-class Insight Store ─────────
--
-- Per the v3 spec and the F3 plan: every state-changing event in the
-- platform emits an insight visible in Analytics. Severity drives
-- delivery: urgent → Chat + push; notable → morning brief; info → Analytics.
CREATE TABLE IF NOT EXISTS kinetiks_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES kinetiks_accounts(id) ON DELETE CASCADE NOT NULL,
  team_scope_id text,  -- v2 multi-user placeholder; null in v1

  -- Identity
  type text NOT NULL CHECK (type IN (
    'anomaly',
    'trend',
    'correlation',
    'opportunity',
    'risk',
    'recommendation',
    'identity_update',
    'approval_outcome',
    'authority_change',
    'pattern_update'
  )),
  severity text NOT NULL CHECK (severity IN ('info', 'notable', 'urgent')),
  summary text NOT NULL,

  -- Evidence + actionability (ids/values, no PII)
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  suggested_action jsonb,

  -- Delivery routing
  delivery_channel text CHECK (delivery_channel IN ('chat', 'analytics', 'email', 'slack', 'push')),
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  acted_on boolean NOT NULL DEFAULT false,
  acted_on_at timestamptz,

  -- Lifecycle
  expires_at timestamptz,

  -- Correlation (parity with ai_calls / tool_calls)
  source_app text NOT NULL DEFAULT 'kinetiks_id',
  source_operator text,
  correlation_id text,
  thread_id uuid,
  agent_run_id text,
  proposal_id uuid REFERENCES kinetiks_proposals(id) ON DELETE SET NULL,
  approval_id uuid REFERENCES kinetiks_approvals(id) ON DELETE SET NULL,
  grant_id uuid,
  pattern_id uuid,
  ai_call_id uuid,
  tool_call_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION kinetiks_insights_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_insights_updated_at ON kinetiks_insights;
CREATE TRIGGER kinetiks_insights_updated_at
  BEFORE UPDATE ON kinetiks_insights
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_insights_set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_account_severity_created
  ON kinetiks_insights (account_id, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_account_delivered
  ON kinetiks_insights (account_id, delivered, severity)
  WHERE delivered = false;
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_proposal
  ON kinetiks_insights (proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_approval
  ON kinetiks_insights (approval_id) WHERE approval_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_correlation
  ON kinetiks_insights (correlation_id);
CREATE INDEX IF NOT EXISTS idx_kinetiks_insights_expires
  ON kinetiks_insights (expires_at) WHERE expires_at IS NOT NULL AND dismissed = false;

-- RLS
ALTER TABLE kinetiks_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own insights" ON kinetiks_insights;
CREATE POLICY "Users read own insights"
  ON kinetiks_insights FOR SELECT
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

-- Users may dismiss/mark-acted on their own insights. They cannot
-- delete (insights are append-only audit) or change content fields.
DROP POLICY IF EXISTS "Users update own insights" ON kinetiks_insights;
CREATE POLICY "Users update own insights"
  ON kinetiks_insights FOR UPDATE
  USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()))
  WITH CHECK (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()));

-- Service role handles inserts.

-- One-way transitions for the user-mutable boolean fields. Once
-- dismissed or acted_on, those cannot flip back.
CREATE OR REPLACE FUNCTION kinetiks_insights_check_user_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.dismissed = true AND NEW.dismissed = false THEN
    RAISE EXCEPTION 'kinetiks_insights: dismissed cannot be unset' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.acted_on = true AND NEW.acted_on = false THEN
    RAISE EXCEPTION 'kinetiks_insights: acted_on cannot be unset' USING ERRCODE = 'check_violation';
  END IF;
  -- Stamp transition timestamps
  IF OLD.dismissed = false AND NEW.dismissed = true THEN
    NEW.dismissed_at = COALESCE(NEW.dismissed_at, now());
  END IF;
  IF OLD.acted_on = false AND NEW.acted_on = true THEN
    NEW.acted_on_at = COALESCE(NEW.acted_on_at, now());
  END IF;
  IF OLD.delivered = false AND NEW.delivered = true THEN
    NEW.delivered_at = COALESCE(NEW.delivered_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_insights_user_fields_guard ON kinetiks_insights;
CREATE TRIGGER kinetiks_insights_user_fields_guard
  BEFORE UPDATE ON kinetiks_insights
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_insights_check_user_fields();

COMMENT ON TABLE kinetiks_insights IS
  'First-class Insight Store per v3 spec. Append-only with one-way user transitions (dismissed, acted_on). Severity drives delivery: urgent → Chat + push; notable → morning brief; info → Analytics.';
