-- ============================================================
-- 00071_ledger_immutable.sql
--
-- Audit remediation (Finding 2.7): the Learning Ledger is the trust
-- architecture's append-only audit trail, and CLAUDE.md promises its
-- entries are "denied at three layers (server action, trigger, RLS)."
-- Only two existed: a SELECT-only RLS policy and application discipline.
-- The sole writer is the service role, which bypasses RLS — so a buggy
-- or malicious service-role path could UPDATE or DELETE history with
-- nothing stopping it. This adds the missing trigger layer.
--
-- Design: UPDATE is never permitted (history is immutable). DELETE is
-- denied too — EXCEPT inside a transaction that has explicitly opted in
-- via the transaction-local GUC `kinetiks.allow_ledger_erase = 'on'`.
-- Full-account erasure (GDPR / DELETE /api/account) genuinely must be
-- able to remove a customer's ledger rows; it does so through the
-- kinetiks_erase_account_ledger() function below, which sets the flag
-- and deletes in one transaction. No other path can delete a ledger row.
-- ============================================================

CREATE OR REPLACE FUNCTION kinetiks_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'kinetiks_ledger is append-only: UPDATE is not permitted'
      USING ERRCODE = 'check_violation';
  END IF;

  -- TG_OP = 'DELETE': only the explicit account-erasure path may delete.
  IF COALESCE(
       current_setting('kinetiks.allow_ledger_erase', true), ''
     ) <> 'on' THEN
    RAISE EXCEPTION
      'kinetiks_ledger is append-only: DELETE is only permitted during account erasure'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS kinetiks_ledger_immutable_guard ON kinetiks_ledger;
CREATE TRIGGER kinetiks_ledger_immutable_guard
  BEFORE UPDATE OR DELETE ON kinetiks_ledger
  FOR EACH ROW
  EXECUTE FUNCTION kinetiks_ledger_immutable();

-- ------------------------------------------------------------
-- Guarded full-account erasure. Sets the transaction-local opt-in flag,
-- then deletes every ledger row for the account in the same transaction
-- so the immutability trigger permits exactly this deletion and nothing
-- else. Returns the number of rows removed.
--
-- SECURITY DEFINER + pinned search_path + service_role-only EXECUTE,
-- matching the convention of the authority/decay RPCs.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION kinetiks_erase_account_ledger(p_account_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  PERFORM set_config('kinetiks.allow_ledger_erase', 'on', true);
  DELETE FROM kinetiks_ledger WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION kinetiks_erase_account_ledger(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kinetiks_erase_account_ledger(uuid) TO service_role;
