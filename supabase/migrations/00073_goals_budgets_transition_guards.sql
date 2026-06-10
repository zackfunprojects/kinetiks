-- ============================================================
-- 00073_goals_budgets_transition_guards.sql
--
-- Audit remediation (Finding 3, state-machine gap): kinetiks_goals.status
-- and kinetiks_budgets.approval_status carried CHECK constraints (valid
-- values) but no transition trigger, unlike approvals/proposals/patterns/
-- grants. CLAUDE.md mandates three-layer enforcement for status-bearing
-- entities; budget approval_status in particular is security-relevant
-- (budget approval is the highest bar in the spec). These triggers add the
-- DB layer; the server layer registers matching machines in
-- state-machines-init.ts and calls assertTransition before writes.
--
-- progress_status on goals is intentionally NOT guarded: it is a derived
-- health indicator (on_track/behind/.../critical) that legitimately moves
-- in any direction as metrics change.
-- ============================================================

-- ── kinetiks_goals.status lifecycle ──────────────────────────
CREATE OR REPLACE FUNCTION kinetiks_goals_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION
      'kinetiks_goals: archived is terminal (attempted → %)', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'active' AND NEW.status NOT IN ('paused', 'completed', 'archived') THEN
    RAISE EXCEPTION
      'kinetiks_goals: invalid transition active → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'paused' AND NEW.status NOT IN ('active', 'completed', 'archived') THEN
    RAISE EXCEPTION
      'kinetiks_goals: invalid transition paused → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'completed' AND NEW.status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION
      'kinetiks_goals: invalid transition completed → %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_goals_transition_guard ON kinetiks_goals;
CREATE TRIGGER kinetiks_goals_transition_guard
  BEFORE UPDATE OF status ON kinetiks_goals
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_goals_check_transition();

-- ── kinetiks_budgets.approval_status lifecycle ───────────────
CREATE OR REPLACE FUNCTION kinetiks_budgets_check_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.approval_status = OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF OLD.approval_status = 'closed' THEN
    RAISE EXCEPTION
      'kinetiks_budgets: closed is terminal (attempted → %)', NEW.approval_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approval_status = 'draft' AND NEW.approval_status NOT IN ('proposed', 'closed') THEN
    RAISE EXCEPTION
      'kinetiks_budgets: invalid transition draft → %', NEW.approval_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approval_status = 'proposed' AND NEW.approval_status NOT IN ('approved', 'draft', 'closed') THEN
    RAISE EXCEPTION
      'kinetiks_budgets: invalid transition proposed → %', NEW.approval_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approval_status = 'approved' AND NEW.approval_status NOT IN ('active', 'closed') THEN
    RAISE EXCEPTION
      'kinetiks_budgets: invalid transition approved → %', NEW.approval_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approval_status = 'active' AND NEW.approval_status <> 'closed' THEN
    RAISE EXCEPTION
      'kinetiks_budgets: invalid transition active → %', NEW.approval_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_budgets_transition_guard ON kinetiks_budgets;
CREATE TRIGGER kinetiks_budgets_transition_guard
  BEFORE UPDATE OF approval_status ON kinetiks_budgets
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_budgets_check_transition();
