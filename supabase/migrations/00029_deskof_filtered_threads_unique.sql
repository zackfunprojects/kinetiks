-- Phase 4 (Scout v2) — make filtered-thread inserts idempotent.
--
-- The Phase 2 schema in 00025 created `deskof_filtered_threads`
-- without a uniqueness constraint, so re-running Scout for the same
-- user + thread + filter reason creates duplicate rows. The Scout v2
-- orchestrator in `apps/do/src/lib/opportunities/filtered.ts` upserts
-- with `onConflict: "user_id,thread_id,filter_reason"` and needs the
-- supporting unique index to be present.
--
-- Defensive cleanup: drop any pre-existing duplicates first so the
-- unique index can be created on already-populated databases.

with ranked as (
  select id,
         row_number() over (
           partition by user_id, thread_id, filter_reason
           order by filtered_at desc
         ) as rn
  from deskof_filtered_threads
)
delete from deskof_filtered_threads
 where id in (select id from ranked where rn > 1);

create unique index if not exists deskof_filtered_threads_user_thread_reason_uniq
  on deskof_filtered_threads(user_id, thread_id, filter_reason);
