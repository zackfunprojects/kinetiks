-- ================================================================
-- DeskOf Phase 2: Operator Profile persistence + content sources
-- ================================================================
-- Stores the Operator Profile primitive that DeskOf reads/writes via
-- @kinetiks/cortex. Each user has at most one profile. Mirror updates
-- it from imports, content ingestion, and behavioral events.
-- ================================================================

create table deskof_operator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,

  -- Mirrors the OperatorProfile shape from
  -- @kinetiks/cortex/operator-profile/types.ts. Stored as JSONB so
  -- the schema can evolve without migrations until we need indexed
  -- queries on individual fields.
  professional jsonb not null default '{
    "expertise_tiers": [],
    "products": [],
    "writing_voice": {
      "avg_sentence_length": null,
      "vocabulary_level": null,
      "tone_descriptors": [],
      "signature_phrases": []
    },
    "platform_history": []
  }'::jsonb,

  personal jsonb not null default '{
    "interests": [],
    "communities": [],
    "engagement_style": {
      "active_hours_local": [],
      "reply_length_range": {"min": 50, "max": 300},
      "enable_personal_surfacing": true
    }
  }'::jsonb,

  gate_adjustments jsonb not null default '{
    "per_check_sensitivity": {},
    "override_accuracy": 0.5,
    "personal_removal_rate": 0,
    "last_calibrated_at": "1970-01-01T00:00:00.000Z"
  }'::jsonb,

  -- 0-1 confidence the system has in this profile overall
  confidence numeric(4,3) not null default 0
    check (confidence between 0 and 1),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table deskof_operator_profiles enable row level security;

create policy "Users can read own operator profile"
  on deskof_operator_profiles for select
  using (user_id = auth.uid());

create policy "Users can insert own operator profile"
  on deskof_operator_profiles for insert
  with check (user_id = auth.uid());

create policy "Users can update own operator profile"
  on deskof_operator_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger deskof_operator_profiles_set_updated_at
  before update on deskof_operator_profiles
  for each row execute function update_updated_at();

-- ----------------------------------------------------------------
-- Content URLs the user has shared for Operator Profile enrichment
-- (Phase 2 Mirror cold start, Quality Addendum #6 Phase A)
-- ----------------------------------------------------------------

create table deskof_content_urls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  url text not null,
  source text not null
    check (source in ('blog', 'newsletter', 'linkedin', 'twitter', 'other')),
  -- Has Mirror successfully ingested + analyzed this URL?
  ingested_at timestamptz,
  ingestion_error text,
  -- Extracted topics + voice metadata, populated by Mirror
  extracted jsonb,
  created_at timestamptz default now(),
  unique (user_id, url)
);

create index idx_deskof_content_urls_user_pending
  on deskof_content_urls(user_id)
  where ingested_at is null;

alter table deskof_content_urls enable row level security;

create policy "Users can read own content URLs"
  on deskof_content_urls for select
  using (user_id = auth.uid());

create policy "Users can insert own content URLs"
  on deskof_content_urls for insert
  with check (user_id = auth.uid());

create policy "Users can delete own content URLs"
  on deskof_content_urls for delete
  using (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Calibration exercise responses (10-thread sweet-spot labeling)
-- per Quality Addendum #6 Phase B / Final Supplement #4 step 3
-- ----------------------------------------------------------------

create table deskof_calibration_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  thread_id uuid references deskof_threads on delete cascade not null,
  -- The user's classification: sweet spot / could contribute / not for me
  judgement text not null
    check (judgement in ('sweet_spot', 'could_contribute', 'not_for_me')),
  created_at timestamptz default now(),
  unique (user_id, thread_id)
);

create index idx_deskof_calibration_responses_user
  on deskof_calibration_responses(user_id, created_at);

alter table deskof_calibration_responses enable row level security;

create policy "Users can read own calibration responses"
  on deskof_calibration_responses for select
  using (user_id = auth.uid());

create policy "Users can insert own calibration responses"
  on deskof_calibration_responses for insert
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Onboarding state — tracks step completion + privacy ack
-- ----------------------------------------------------------------

create table deskof_onboarding_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  privacy_acknowledged_at timestamptz,
  privacy_disclosure_version text,
  reddit_connected_at timestamptz,
  quora_connected_at timestamptz,
  content_urls_submitted_at timestamptz,
  calibration_completed_at timestamptz,
  interests_submitted_at timestamptz,
  track_selected_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  current_step text not null default 'privacy'
    check (current_step in (
      'privacy', 'connect', 'content', 'calibration',
      'interests', 'track', 'complete'
    )),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table deskof_onboarding_state enable row level security;

create policy "Users can read own onboarding state"
  on deskof_onboarding_state for select
  using (user_id = auth.uid());

create policy "Users can upsert own onboarding state"
  on deskof_onboarding_state for insert
  with check (user_id = auth.uid());

create policy "Users can update own onboarding state"
  on deskof_onboarding_state for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger deskof_onboarding_state_set_updated_at
  before update on deskof_onboarding_state
  for each row execute function update_updated_at();
