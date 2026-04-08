-- ================================================================
-- DeskOf Phase 2.5: deduplicate concurrent account-deletion requests
-- ================================================================
-- Address CodeRabbit critical finding on PR #42:
--
--   requestAccountDeletion() does .select().maybeSingle() then a
--   plain .insert(), which is logically idempotent but not atomically
--   so. Two concurrent webhook retries can both miss the SELECT and
--   both INSERT, creating duplicate rows in
--   deskof_data_deletion_requests. The 503-with-Retry-After loop in
--   /api/privacy/deletion-webhook makes concurrent retries highly
--   likely.
--
-- Fix: a partial unique index on (user_id) WHERE status IN
-- ('pending', 'in_progress'). Postgres enforces this atomically —
-- the second concurrent insert raises a unique-violation, the
-- service-side helper catches it and re-reads the existing row.
--
-- The 'complete' / 'failed' rows are NOT covered by the index so a
-- user who deletes, re-onboards, and deletes again can still create
-- a fresh request. Only in-flight rows are deduped.
-- ================================================================

create unique index if not exists
  deskof_data_deletion_requests_user_pending_unique
  on deskof_data_deletion_requests (user_id)
  where status in ('pending', 'in_progress');
