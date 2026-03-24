-- Agent-Native Architecture: API Keys for programmatic access
-- These are Kinetiks platform API keys (kntk_*) for authenticating users/agents.
-- Separate from BYOK keys (Anthropic, Firecrawl, PDL) stored in kinetiks_connections.

create table kinetiks_api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references kinetiks_accounts(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  name text not null,
  permissions text not null default 'read-write'
    check (permissions in ('read-only', 'read-write', 'admin')),
  scope text[] not null default '{}',
  rate_limit_per_minute integer not null default 60,
  rate_limit_per_day integer not null default 10000,
  expires_at timestamptz,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for fast key lookup during auth resolution
create index idx_api_keys_account on kinetiks_api_keys(account_id);

-- RLS
alter table kinetiks_api_keys enable row level security;

-- Users can read their own keys
create policy "Users can read own API keys"
  on kinetiks_api_keys for select
  using (
    account_id in (
      select id from kinetiks_accounts where user_id = auth.uid()
    )
  );

-- Users can create keys for their own account
create policy "Users can create own API keys"
  on kinetiks_api_keys for insert
  with check (
    account_id in (
      select id from kinetiks_accounts where user_id = auth.uid()
    )
  );

-- Users can update their own keys (revoke, rename, etc.)
create policy "Users can update own API keys"
  on kinetiks_api_keys for update
  using (
    account_id in (
      select id from kinetiks_accounts where user_id = auth.uid()
    )
  );

-- Users can delete their own keys
create policy "Users can delete own API keys"
  on kinetiks_api_keys for delete
  using (
    account_id in (
      select id from kinetiks_accounts where user_id = auth.uid()
    )
  );

-- Service role has full access (for auth resolution during API key lookup)
create policy "Service role full access to API keys"
  on kinetiks_api_keys for all
  using (auth.role() = 'service_role');
