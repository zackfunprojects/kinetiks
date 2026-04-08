-- ================================================================
-- DeskOf Phase 2: Optimistic concurrency for profile + draft replies
-- ================================================================
-- Address CodeRabbit critical/major findings on PR #41:
--
-- 1. updateOperatorProfile() does a read/merge/write over JSONB columns
--    (professional, personal, gate_adjustments). Two concurrent callers
--    can both read the same snapshot, both compute their merged result,
--    and both write — the second write silently drops the first.
--
--    Fix: add an integer lock_version column. updateOperatorProfile
--    reads it, computes the merged value, and writes with
--    WHERE lock_version = expected. If the row count is 0 we lost the
--    race; the service layer re-reads and retries up to N times.
--
-- 2. ReplyEditor autosaves are debounced and overlap. If an older draft
--    request lands after a newer one, the server has no way to reject
--    it and stale text overwrites the newer state. Add a draft_revision
--    integer column on deskof_replies and reject any draft upsert
--    whose incoming revision is < the persisted revision.
-- ================================================================

alter table deskof_operator_profiles
  add column if not exists lock_version integer not null default 0;

alter table deskof_replies
  add column if not exists draft_revision integer not null default 0;
