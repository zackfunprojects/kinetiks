-- Phase 1b: Marcus Operator tables
-- Third Cortex Operator - conversational intelligence.
-- All tables use RLS. Service role used by Marcus engine and CRON Edge Functions.

-- ============================================================
-- Marcus Conversation Threads
-- ============================================================
create table kinetiks_marcus_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  title text,
  channel text default 'web' check (channel in ('web', 'slack', 'pill')),
  slack_thread_ts text,
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_marcus_threads enable row level security;

create policy "Users can read own threads"
  on kinetiks_marcus_threads for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own threads"
  on kinetiks_marcus_threads for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Insert handled by service role (Marcus engine creates threads)

-- ============================================================
-- Marcus Messages
-- ============================================================
create table kinetiks_marcus_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references kinetiks_marcus_threads not null,
  role text not null check (role in ('user', 'marcus')),
  content text not null,
  channel text default 'web' check (channel in ('web', 'slack', 'pill')),
  extracted_actions jsonb,
  context_used jsonb,
  created_at timestamptz default now()
);

alter table kinetiks_marcus_messages enable row level security;

create policy "Users can read own messages"
  on kinetiks_marcus_messages for select
  using (thread_id in (
    select id from kinetiks_marcus_threads
    where account_id in (select id from kinetiks_accounts where user_id = auth.uid())
  ));

-- Insert/update handled by service role (Marcus engine writes messages)

-- ============================================================
-- Marcus Scheduled Communications
-- ============================================================
create table kinetiks_marcus_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  type text not null check (type in ('daily_brief', 'weekly_digest', 'monthly_review')),
  channel text default 'slack' check (channel in ('slack', 'email', 'both')),
  schedule text not null,
  timezone text default 'America/New_York',
  enabled boolean default true,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_marcus_schedules enable row level security;

create policy "Users can read own schedules"
  on kinetiks_marcus_schedules for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own schedules"
  on kinetiks_marcus_schedules for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Insert handled by service role (default schedules created on account setup)

-- ============================================================
-- Marcus Alerts (proactive notifications)
-- ============================================================
create table kinetiks_marcus_alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  trigger_type text not null check (trigger_type in (
    'kpi_shift', 'crisis', 'deal_outcome', 'anomaly', 'gap'
  )),
  severity text default 'info' check (severity in ('info', 'warning', 'urgent')),
  title text not null,
  body text not null,
  source_app text,
  read boolean default false,
  delivered_via text[] default '{}',
  created_at timestamptz default now()
);

alter table kinetiks_marcus_alerts enable row level security;

create policy "Users can read own alerts"
  on kinetiks_marcus_alerts for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own alerts"
  on kinetiks_marcus_alerts for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Insert handled by service role (Marcus generates alerts)

-- ============================================================
-- Marcus Follow-ups (self-scheduled reminders)
-- ============================================================
create table kinetiks_marcus_follow_ups (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  thread_id uuid references kinetiks_marcus_threads,
  message text not null,
  scheduled_for timestamptz not null,
  delivered boolean default false,
  created_at timestamptz default now()
);

alter table kinetiks_marcus_follow_ups enable row level security;

create policy "Users can read own follow-ups"
  on kinetiks_marcus_follow_ups for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Insert/update handled by service role (Marcus schedules and delivers)

-- ============================================================
-- Indexes
-- ============================================================
create index idx_marcus_threads_account on kinetiks_marcus_threads(account_id);
create index idx_marcus_threads_updated on kinetiks_marcus_threads(updated_at desc);
create index idx_marcus_messages_thread on kinetiks_marcus_messages(thread_id);
create index idx_marcus_messages_created on kinetiks_marcus_messages(created_at);
create index idx_marcus_schedules_account on kinetiks_marcus_schedules(account_id);
create index idx_marcus_schedules_due on kinetiks_marcus_schedules(next_send_at)
  where enabled = true;
create index idx_marcus_alerts_account on kinetiks_marcus_alerts(account_id);
create index idx_marcus_alerts_unread on kinetiks_marcus_alerts(account_id)
  where read = false;
create index idx_marcus_followups_due on kinetiks_marcus_follow_ups(scheduled_for)
  where delivered = false;
create index idx_marcus_followups_account on kinetiks_marcus_follow_ups(account_id);

-- ============================================================
-- Updated_at triggers (reuse existing function from 00001)
-- ============================================================
create trigger set_updated_at before update on kinetiks_marcus_threads
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_marcus_schedules
  for each row execute function update_updated_at();
