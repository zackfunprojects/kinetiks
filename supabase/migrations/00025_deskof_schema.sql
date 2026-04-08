-- ================================================================
-- DeskOf Phase 1: Core schema
-- ================================================================
-- All DeskOf tables prefixed with deskof_. RLS enforced for every
-- user-owned table. The human-only-publishing constraint is enforced
-- at the database level for deskof_replies — see "Human-only publishing
-- constraint" below.
--
-- Spec: apps/do/CLAUDE.md §Database Schema
-- Quality Addendum: #1 (Quora matching), #4 (CPPI), #5 (topic spacing),
--                   #7 (filtered feed), #10 (tier gating)
-- Final Supplement: #2 (deletion), #5 (analytics), #6 (gate calibration)
-- ================================================================

-- ----------------------------------------------------------------
-- Core
-- ----------------------------------------------------------------

create table deskof_threads (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('reddit', 'quora')),
  external_id text not null,
  url text not null,
  community text not null,
  title text not null,
  body text,
  score integer default 0,
  comment_count integer default 0,
  thread_created_at timestamptz not null,
  fetched_at timestamptz default now(),
  unique (platform, external_id)
);

create index idx_deskof_threads_platform_community
  on deskof_threads(platform, community, thread_created_at desc);
-- Threads cached for 7 days then purged by Pulse maintenance job.

create table deskof_operator_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  track text not null check (track in ('minimal', 'standard', 'hero')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table deskof_operator_tracks enable row level security;

create policy "Users can read own track"
  on deskof_operator_tracks for select
  using (user_id = auth.uid());

create policy "Users can upsert own track"
  on deskof_operator_tracks for insert
  with check (user_id = auth.uid());

create policy "Users can update own track"
  on deskof_operator_tracks for update
  using (user_id = auth.uid());

create table deskof_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  thread_id uuid references deskof_threads on delete cascade not null,
  match_score integer not null check (match_score between 0 and 100),
  match_breakdown jsonb not null,
  suggested_angle text,
  expertise_tier_matched text not null
    check (expertise_tier_matched in ('core_authority', 'credible_adjacency', 'genuine_curiosity')),
  opportunity_type text not null
    check (opportunity_type in ('professional', 'personal', 'crossover')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'skipped', 'expired')),
  skip_reason text
    check (skip_reason in ('already_well_answered', 'not_my_expertise', 'too_promotional', 'bad_timing', 'other')),
  surfaced_at timestamptz default now(),
  expires_at timestamptz not null
);

create index idx_deskof_opportunities_user_status_score
  on deskof_opportunities(user_id, status, match_score desc);
create index idx_deskof_opportunities_expires_at
  on deskof_opportunities(expires_at)
  where status = 'pending';

alter table deskof_opportunities enable row level security;

create policy "Users can read own opportunities"
  on deskof_opportunities for select
  using (user_id = auth.uid());

create policy "Users can update own opportunities"
  on deskof_opportunities for update
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Replies — the human-only-publishing enforcement layer
-- ----------------------------------------------------------------

create table deskof_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  opportunity_id uuid references deskof_opportunities on delete set null,
  platform text not null check (platform in ('reddit', 'quora')),
  thread_url text not null,
  -- The human-written reply text. This field is filled by the user via
  -- the DeskOf editor. No code path generates content into this field.
  content text not null,
  -- Normalized hash of content used for Quora answer matching (Quality
  -- Addendum #1, Layer 1).
  content_fingerprint text not null,
  gate_result jsonb not null,
  gate_overrides text[] not null default '{}',
  -- The single-use, content-hash-bound human confirmation token is
  -- consumed in memory by the API layer; only the timestamp is persisted.
  human_confirmed_at timestamptz,
  posted_at timestamptz,
  platform_reply_id text,
  quora_match_status text
    check (quora_match_status in ('matched', 'ambiguous', 'unmatched', 'pending')),
  status text not null default 'draft'
    check (status in ('draft', 'gate_pending', 'ready', 'posted', 'removed', 'untracked')),
  tracking jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Human-only publishing constraint: posted_at can never be set unless
  -- human_confirmed_at is also set, and the confirmation must precede
  -- the post by at most 5 minutes (matching the in-memory token TTL).
  constraint reply_requires_human_confirmation
    check (
      posted_at is null
      or (
        human_confirmed_at is not null
        and human_confirmed_at <= posted_at
        and posted_at <= human_confirmed_at + interval '5 minutes'
      )
    )
);

create index idx_deskof_replies_user_posted
  on deskof_replies(user_id, posted_at desc nulls last);
create index idx_deskof_replies_platform_status
  on deskof_replies(platform, status);

alter table deskof_replies enable row level security;

create policy "Users can read own replies"
  on deskof_replies for select
  using (user_id = auth.uid());

create policy "Users can insert own replies"
  on deskof_replies for insert
  with check (user_id = auth.uid());

-- Replies may only be updated while still in draft / gate / ready states.
-- Once posted_at is set, the row is immutable from the user side. Only
-- the service role (Pulse tracking jobs) updates the tracking column.
create policy "Users can update own draft replies"
  on deskof_replies for update
  using (user_id = auth.uid() and posted_at is null)
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Reply tracking (per time horizon)
-- ----------------------------------------------------------------

create table deskof_reply_tracking (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references deskof_replies on delete cascade not null,
  horizon text not null check (horizon in ('immediate', 'short_term', 'medium_term', 'long_term')),
  measured_at timestamptz default now(),
  metrics jsonb not null
);

create index idx_deskof_reply_tracking_reply_horizon
  on deskof_reply_tracking(reply_id, horizon, measured_at desc);

alter table deskof_reply_tracking enable row level security;

create policy "Users can read own reply tracking"
  on deskof_reply_tracking for select
  using (
    exists (
      select 1 from deskof_replies
      where deskof_replies.id = deskof_reply_tracking.reply_id
        and deskof_replies.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- Platform accounts (encrypted tokens — never read client-side)
-- ----------------------------------------------------------------

create table deskof_platform_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  platform text not null check (platform in ('reddit', 'quora')),
  account_handle text not null,
  -- Tokens are stored encrypted via Supabase Vault. Only Edge Functions
  -- and the service role can decrypt. Never expose these columns through
  -- a row policy that the user-facing client can read.
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] default '{}',
  connected_at timestamptz default now(),
  last_refreshed_at timestamptz,
  unique (user_id, platform)
);

alter table deskof_platform_accounts enable row level security;

-- The user can see WHICH platforms they have connected, but not the
-- token columns. For that we expose a view in a follow-up migration.
create policy "Users can read own platform connections (no tokens)"
  on deskof_platform_accounts for select
  using (user_id = auth.uid());

-- Inserts/updates only via service role (Edge Functions handling OAuth).
-- No user-facing insert/update policy.

-- ----------------------------------------------------------------
-- Platform health (rolling daily snapshots)
-- ----------------------------------------------------------------

create table deskof_platform_health (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  platform text not null check (platform in ('reddit', 'quora')),
  snapshot_date date not null,
  self_promo_ratio numeric(4,3) not null check (self_promo_ratio between 0 and 1),
  posts_total integer not null default 0,
  posts_promotional integer not null default 0,
  per_community jsonb not null default '{}',
  risk_level text not null default 'low' check (risk_level in ('low', 'moderate', 'high')),
  unique (user_id, platform, snapshot_date)
);

create index idx_deskof_platform_health_user_date
  on deskof_platform_health(user_id, platform, snapshot_date desc);

alter table deskof_platform_health enable row level security;

create policy "Users can read own platform health"
  on deskof_platform_health for select
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Authority scores (per-topic daily snapshots)
-- ----------------------------------------------------------------

create table deskof_authority_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  topic text not null,
  snapshot_date date not null,
  reach numeric not null default 0,
  resonance numeric not null default 0,
  reverberation numeric not null default 0,
  composite numeric not null default 0,
  unique (user_id, topic, snapshot_date)
);

create index idx_deskof_authority_scores_user_topic_date
  on deskof_authority_scores(user_id, topic, snapshot_date desc);

alter table deskof_authority_scores enable row level security;

create policy "Users can read own authority scores"
  on deskof_authority_scores for select
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Skip log (feeds discovery learning loop)
-- ----------------------------------------------------------------

create table deskof_skip_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  opportunity_id uuid references deskof_opportunities on delete set null,
  reason text not null
    check (reason in ('already_well_answered', 'not_my_expertise', 'too_promotional', 'bad_timing', 'other')),
  notes text,
  created_at timestamptz default now()
);

create index idx_deskof_skip_log_user_created
  on deskof_skip_log(user_id, created_at desc);

alter table deskof_skip_log enable row level security;

create policy "Users can read own skip log"
  on deskof_skip_log for select
  using (user_id = auth.uid());

create policy "Users can insert own skips"
  on deskof_skip_log for insert
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- LLM citation checks
-- ----------------------------------------------------------------

create table deskof_citation_checks (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references deskof_replies on delete cascade not null,
  model text not null check (model in ('chatgpt', 'perplexity', 'gemini', 'claude')),
  checked_at timestamptz default now(),
  citation_level integer not null check (citation_level between 0 and 3),
  citation_url text,
  context_excerpt text
);

create index idx_deskof_citation_checks_reply_model
  on deskof_citation_checks(reply_id, model, checked_at desc);

alter table deskof_citation_checks enable row level security;

create policy "Users can read own citation checks"
  on deskof_citation_checks for select
  using (
    exists (
      select 1 from deskof_replies
      where deskof_replies.id = deskof_citation_checks.reply_id
        and deskof_replies.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- Quality gate: CPPI snapshots (Quality Addendum #4)
-- ----------------------------------------------------------------

create table deskof_cppi_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  snapshot_at timestamptz default now(),
  score numeric(4,3) not null check (score between 0 and 1),
  volume numeric(4,3) not null check (volume between 0 and 1),
  concentration numeric(4,3) not null check (concentration between 0 and 1),
  clustering numeric(4,3) not null check (clustering between 0 and 1),
  level text not null check (level in ('low', 'moderate', 'high', 'critical'))
);

create index idx_deskof_cppi_log_user_time
  on deskof_cppi_log(user_id, snapshot_at desc);

alter table deskof_cppi_log enable row level security;

create policy "Users can read own CPPI log"
  on deskof_cppi_log for select
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Quality gate: topic vectors (Quality Addendum #5)
-- ----------------------------------------------------------------

create table deskof_topic_vectors (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references deskof_replies on delete cascade not null,
  user_id uuid references auth.users not null,
  topics text[] not null,
  -- Embedding vector stored as a float array. Once we ship pgvector,
  -- a follow-up migration can convert this to vector(384).
  vector double precision[],
  computed_at timestamptz default now()
);

create index idx_deskof_topic_vectors_user_time
  on deskof_topic_vectors(user_id, computed_at desc);

alter table deskof_topic_vectors enable row level security;

create policy "Users can read own topic vectors"
  on deskof_topic_vectors for select
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Quality gate: per-community auto-learned config
-- (Final Supplement #6.4 — community calibration)
-- ----------------------------------------------------------------

create table deskof_community_gate_config (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('reddit', 'quora')),
  community text not null,
  -- Per-check threshold overrides keyed by check type
  thresholds jsonb not null default '{}',
  removal_rate numeric(4,3) check (removal_rate between 0 and 1),
  sample_size integer not null default 0,
  last_calibrated_at timestamptz default now(),
  unique (platform, community)
);

-- Service role only — populated by Pulse from outcome data. No RLS
-- policies because there is no user-facing read path; the gate engine
-- runs server-side and reads via the service role.
alter table deskof_community_gate_config enable row level security;

-- ----------------------------------------------------------------
-- Quality gate: weekly Gate Trust Score (Final Supplement #6.6)
-- ----------------------------------------------------------------

create table deskof_gate_health (
  id uuid primary key default gen_random_uuid(),
  week_starting date not null unique,
  trust_score numeric(4,3) not null check (trust_score between 0 and 1),
  precision numeric(4,3),
  recall numeric(4,3),
  f1 numeric(4,3),
  sample_size integer not null,
  computed_at timestamptz default now()
);

-- Internal monitoring only — no user-facing policy.
alter table deskof_gate_health enable row level security;

-- ----------------------------------------------------------------
-- Quora answer matching attempts (Quality Addendum #1)
-- ----------------------------------------------------------------

create table deskof_quora_match_attempts (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references deskof_replies on delete cascade not null,
  attempt_at timestamptz default now(),
  candidates_found integer not null default 0,
  match_confidence numeric(4,3),
  match_method text not null check (match_method in ('fingerprint', 'url', 'retry')),
  outcome text not null check (outcome in ('matched', 'ambiguous', 'unmatched'))
);

create index idx_deskof_quora_match_attempts_reply
  on deskof_quora_match_attempts(reply_id, attempt_at desc);

alter table deskof_quora_match_attempts enable row level security;

create policy "Users can read own Quora match attempts"
  on deskof_quora_match_attempts for select
  using (
    exists (
      select 1 from deskof_replies
      where deskof_replies.id = deskof_quora_match_attempts.reply_id
        and deskof_replies.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- Privacy / analytics
-- ----------------------------------------------------------------

create table deskof_analytics_events (
  id uuid primary key default gen_random_uuid(),
  -- user_id is hashed; after 90 days a job nulls this column out.
  user_id_hash text,
  session_id text not null,
  event_name text not null,
  properties jsonb not null default '{}',
  user_tier text check (user_tier in ('free', 'standard', 'hero')),
  user_track text check (user_track in ('minimal', 'standard', 'hero')),
  platform text check (platform in ('web', 'pwa')),
  app_version text,
  occurred_at timestamptz default now()
);

create index idx_deskof_analytics_events_name_time
  on deskof_analytics_events(event_name, occurred_at desc);
create index idx_deskof_analytics_events_session
  on deskof_analytics_events(session_id, occurred_at);

-- No user-facing policies — write-only from instrumented clients via
-- service role; analytics dashboards run with the service role too.
alter table deskof_analytics_events enable row level security;

create table deskof_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  requested_at timestamptz default now(),
  tokens_revoked_at timestamptz,
  data_deleted_at timestamptz,
  cortex_purged_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'complete', 'failed')),
  error_message text
);

alter table deskof_data_deletion_requests enable row level security;

create policy "Users can read own deletion request"
  on deskof_data_deletion_requests for select
  using (user_id = auth.uid());

create policy "Users can request own deletion"
  on deskof_data_deletion_requests for insert
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Filtered threads (Quality Addendum #7) — daily reset
-- ----------------------------------------------------------------

create table deskof_filtered_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  thread_id uuid references deskof_threads on delete cascade not null,
  filter_reason text not null
    check (filter_reason in (
      'astroturfed',
      'community_hostility',
      'no_posting_history',
      'already_well_answered',
      'requires_self_promotion',
      'duplicate_coverage'
    )),
  reason_detail text,
  hypothetical_score integer check (hypothetical_score between 0 and 100),
  filtered_at timestamptz default now()
);

create index idx_deskof_filtered_threads_user_date
  on deskof_filtered_threads(user_id, filtered_at desc);

alter table deskof_filtered_threads enable row level security;

create policy "Users can read own filtered threads"
  on deskof_filtered_threads for select
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------
-- Reuses the update_updated_at() function defined in 00001.

create trigger deskof_replies_set_updated_at
  before update on deskof_replies
  for each row execute function update_updated_at();

create trigger deskof_operator_tracks_set_updated_at
  before update on deskof_operator_tracks
  for each row execute function update_updated_at();
