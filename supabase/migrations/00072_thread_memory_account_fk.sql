-- ============================================================
-- 00072_thread_memory_account_fk.sql
--
-- Audit remediation (Finding 2.2): kinetiks_thread_memory.account_id
-- referenced auth.users(id) and its RLS compared `auth.uid() = account_id`.
-- But the Marcus engine scopes by kinetiks_accounts.id (≠ auth.users.id),
-- so every memory insert violated the foreign key and memory persistence
-- was silently broken (the engine swallows the error). This is the exact
-- auth.users.id vs kinetiks_accounts.id confusion CLAUDE.md names as the
-- most common Cortex bug.
--
-- Repoint the FK to kinetiks_accounts(id) and rewrite RLS to the standard
-- account subquery so the engine's writes land and isolation is correct.
-- ============================================================

ALTER TABLE kinetiks_thread_memory
  DROP CONSTRAINT IF EXISTS kinetiks_thread_memory_account_id_fkey;

-- Backfill before delete: legacy rows stored account_id as the auth.users.id
-- (the old FK target). Remap those to the owning kinetiks_accounts.id so the
-- memory data survives the FK repoint. Only rows whose account_id is NOT
-- already a valid account id are remapped (don't clobber correct rows).
UPDATE kinetiks_thread_memory tm
  SET account_id = a.id
  FROM kinetiks_accounts a
  WHERE a.user_id = tm.account_id
    AND NOT EXISTS (
      SELECT 1 FROM kinetiks_accounts a2 WHERE a2.id = tm.account_id
    );

-- Anything still unmappable (account_id matches neither an account id nor a
-- user_id) is genuinely orphaned and must go before the corrected FK is added
-- (otherwise the ADD CONSTRAINT fails validation).
DELETE FROM kinetiks_thread_memory tm
  WHERE NOT EXISTS (
    SELECT 1 FROM kinetiks_accounts a WHERE a.id = tm.account_id
  );

ALTER TABLE kinetiks_thread_memory
  ADD CONSTRAINT kinetiks_thread_memory_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES kinetiks_accounts(id) ON DELETE CASCADE;

-- RLS: scope by kinetiks_accounts.id via the standard subquery (the prior
-- `auth.uid() = account_id` compared a user id to an account id, so it
-- matched nothing for correctly-scoped rows).
DROP POLICY IF EXISTS "Users can read own thread memories" ON kinetiks_thread_memory;
CREATE POLICY "Users can read own thread memories"
  ON kinetiks_thread_memory FOR SELECT
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own thread memories" ON kinetiks_thread_memory;
CREATE POLICY "Users can insert own thread memories"
  ON kinetiks_thread_memory FOR INSERT
  WITH CHECK (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own thread memories" ON kinetiks_thread_memory;
CREATE POLICY "Users can update own thread memories"
  ON kinetiks_thread_memory FOR UPDATE
  USING (
    account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid())
  );

-- The service-role full-access policy is unchanged.
