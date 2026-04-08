-- Phase 4 (Scout v2) — velocity + enrichment columns on deskof_threads.
--
-- Scout v2's timing model blends freshness with velocity
-- (upvotes_per_hour / comments_per_hour), and the anti-signal
-- detectors read existing_reply_count, contains_question, and
-- mod_removal_rate. The Phase 4 PR added these as optional fields
-- on the ThreadSnapshot type so callers without the data keep
-- working, but the refresh route (POST /api/opportunities/refresh)
-- needs the underlying columns to exist so ingest paths can
-- persist them and Scout v2 can consume them end-to-end.
--
-- All columns are nullable with no default so pre-Phase-4 rows
-- are untouched and subsequent ingests can write opt-in.

alter table deskof_threads
  add column if not exists upvotes_per_hour double precision,
  add column if not exists comments_per_hour double precision,
  add column if not exists existing_reply_count integer,
  add column if not exists contains_question boolean,
  add column if not exists mod_removal_rate double precision
    check (mod_removal_rate is null or (mod_removal_rate >= 0 and mod_removal_rate <= 1));
