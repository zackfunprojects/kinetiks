-- Agent-Native Architecture: Rate limiting for API keys
-- Tracks request counts per key per time window using atomic upsert.

create table kinetiks_rate_limits (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references kinetiks_api_keys(id) on delete cascade,
  window_start timestamptz not null,
  window_type text not null check (window_type in ('minute', 'day')),
  request_count integer not null default 1,
  unique(key_id, window_start, window_type)
);

create index idx_rate_limits_lookup
  on kinetiks_rate_limits(key_id, window_type, window_start);

-- RLS - only service role accesses this table (auth middleware)
alter table kinetiks_rate_limits enable row level security;

create policy "Service role full access to rate limits"
  on kinetiks_rate_limits for all
  using (auth.role() = 'service_role');
