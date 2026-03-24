-- Agent-Native Architecture: Webhook infrastructure
-- Configurable webhooks with HMAC signing, delivery logging, and retry.

create table kinetiks_webhooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references kinetiks_accounts(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_webhooks_account on kinetiks_webhooks(account_id);

create table kinetiks_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references kinetiks_webhooks(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status_code integer,
  response_body text,
  attempt integer not null default 1,
  success boolean not null default false,
  delivered_at timestamptz not null default now(),
  next_retry_at timestamptz
);

create index idx_webhook_deliveries_webhook on kinetiks_webhook_deliveries(webhook_id);
create index idx_webhook_deliveries_retry
  on kinetiks_webhook_deliveries(success, next_retry_at)
  where success = false and next_retry_at is not null;

-- RLS
alter table kinetiks_webhooks enable row level security;
alter table kinetiks_webhook_deliveries enable row level security;

-- Users can manage their own webhooks
create policy "Users can read own webhooks"
  on kinetiks_webhooks for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can create own webhooks"
  on kinetiks_webhooks for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own webhooks"
  on kinetiks_webhooks for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can delete own webhooks"
  on kinetiks_webhooks for delete
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Service role full access (for delivery engine)
create policy "Service role full access to webhooks"
  on kinetiks_webhooks for all
  using (auth.role() = 'service_role');

-- Users can read their own webhook deliveries
create policy "Users can read own webhook deliveries"
  on kinetiks_webhook_deliveries for select
  using (
    webhook_id in (
      select id from kinetiks_webhooks
      where account_id in (select id from kinetiks_accounts where user_id = auth.uid())
    )
  );

-- Service role full access to deliveries (for delivery engine and retry)
create policy "Service role full access to webhook deliveries"
  on kinetiks_webhook_deliveries for all
  using (auth.role() = 'service_role');

-- Updated_at trigger
create trigger update_webhooks_updated_at
  before update on kinetiks_webhooks
  for each row execute function update_updated_at();
