-- Thread memory: durable facts extracted from conversation
-- Corrections ("seed stage, NOT Series A/B"), decisions ("targeting 3 calls/week"),
-- preferences ("pricing is $15k"), and constraints the user has established.
-- These are ALWAYS loaded into Marcus context for the thread, regardless of token budget.

create table if not exists kinetiks_thread_memory (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  memory_type text not null check (memory_type in (
    'correction',   -- User corrected Marcus: "not Series A, seed stage"
    'decision',     -- User made a decision: "targeting 3 calls/week"
    'preference',   -- User stated a preference: "pricing is $15k"
    'constraint',   -- User set a constraint: "no cold calling"
    'fact'          -- User shared a fact: "we have 2 April cohort spots"
  )),
  content text not null,            -- Human-readable: "User targets seed stage, NOT Series A/B"
  source_message_index int,         -- Which message in the thread this was extracted from
  confidence float not null default 0.8 check (confidence >= 0 and confidence <= 1),
  active boolean not null default true,  -- False if superseded by a later memory
  superseded_by uuid references kinetiks_thread_memory(id),
  created_at timestamptz not null default now()
);

-- Index for fast loading: get all active memories for a thread
create index idx_thread_memory_lookup
  on kinetiks_thread_memory(account_id, thread_id, active)
  where active = true;

-- RLS: users can only access their own thread memories
alter table kinetiks_thread_memory enable row level security;

create policy "Users can read own thread memories"
  on kinetiks_thread_memory for select
  using (auth.uid() = account_id);

create policy "Users can insert own thread memories"
  on kinetiks_thread_memory for insert
  with check (auth.uid() = account_id);

create policy "Users can update own thread memories"
  on kinetiks_thread_memory for update
  using (auth.uid() = account_id);

-- Service role bypass for Marcus engine (Edge Functions)
create policy "Service role full access to thread memories"
  on kinetiks_thread_memory for all
  using (auth.role() = 'service_role');
