-- Phase 1b fixes: composite index, unique constraint, delete policies

-- Composite index for the most common query: messages by thread ordered by time
create index idx_marcus_messages_thread_created
  on kinetiks_marcus_messages(thread_id, created_at);

-- Prevent duplicate schedule types per account (e.g. two daily_brief entries)
alter table kinetiks_marcus_schedules
  add constraint uq_schedules_account_type unique (account_id, type);

-- Delete policies for user-facing tables
create policy "Users can delete own threads"
  on kinetiks_marcus_threads for delete
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can delete own alerts"
  on kinetiks_marcus_alerts for delete
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));
