-- Phase 0b: Core Kinetiks tables
-- All tables use RLS. Service role used only by Edge Functions.

-- ============================================================
-- Kinetiks Accounts
-- ============================================================
create table kinetiks_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  codename text not null unique,
  display_name text,
  from_app text,
  onboarding_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_accounts enable row level security;

create policy "Users can read own account"
  on kinetiks_accounts for select
  using (auth.uid() = user_id);

create policy "Users can update own account"
  on kinetiks_accounts for update
  using (auth.uid() = user_id);

-- Insert handled by service role during signup

-- ============================================================
-- Context Structure: 8 Layer Tables (same pattern)
-- ============================================================

-- Org Layer
create table kinetiks_context_org (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_org enable row level security;

create policy "Users can read own org context"
  on kinetiks_context_org for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own org context"
  on kinetiks_context_org for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own org context"
  on kinetiks_context_org for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Products Layer
create table kinetiks_context_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_products enable row level security;

create policy "Users can read own products context"
  on kinetiks_context_products for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own products context"
  on kinetiks_context_products for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own products context"
  on kinetiks_context_products for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Voice Layer
create table kinetiks_context_voice (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_voice enable row level security;

create policy "Users can read own voice context"
  on kinetiks_context_voice for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own voice context"
  on kinetiks_context_voice for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own voice context"
  on kinetiks_context_voice for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Customers Layer
create table kinetiks_context_customers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_customers enable row level security;

create policy "Users can read own customers context"
  on kinetiks_context_customers for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own customers context"
  on kinetiks_context_customers for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own customers context"
  on kinetiks_context_customers for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Narrative Layer
create table kinetiks_context_narrative (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_narrative enable row level security;

create policy "Users can read own narrative context"
  on kinetiks_context_narrative for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own narrative context"
  on kinetiks_context_narrative for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own narrative context"
  on kinetiks_context_narrative for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Competitive Layer
create table kinetiks_context_competitive (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_competitive enable row level security;

create policy "Users can read own competitive context"
  on kinetiks_context_competitive for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own competitive context"
  on kinetiks_context_competitive for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own competitive context"
  on kinetiks_context_competitive for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Market Layer
create table kinetiks_context_market (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_market enable row level security;

create policy "Users can read own market context"
  on kinetiks_context_market for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own market context"
  on kinetiks_context_market for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own market context"
  on kinetiks_context_market for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Brand Layer
create table kinetiks_context_brand (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  data jsonb not null default '{}',
  confidence_score numeric(5,2) default 0,
  source text not null,
  source_detail text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_context_brand enable row level security;

create policy "Users can read own brand context"
  on kinetiks_context_brand for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own brand context"
  on kinetiks_context_brand for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own brand context"
  on kinetiks_context_brand for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Proposals
-- ============================================================
create table kinetiks_proposals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  source_app text not null,
  source_operator text,
  target_layer text not null,
  action text not null check (action in ('add', 'update', 'escalate')),
  confidence text not null check (confidence in ('validated', 'inferred', 'speculative')),
  payload jsonb not null,
  evidence jsonb default '[]',
  status text not null default 'submitted' check (status in (
    'submitted', 'accepted', 'declined', 'escalated', 'expired', 'superseded'
  )),
  decline_reason text,
  expires_at timestamptz,
  submitted_at timestamptz default now(),
  evaluated_at timestamptz,
  evaluated_by text
);

alter table kinetiks_proposals enable row level security;

create policy "Users can read own proposals"
  on kinetiks_proposals for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Service role handles insert/update (Cortex, Synapses)

-- ============================================================
-- Learning Ledger (append-only)
-- ============================================================
create table kinetiks_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  event_type text not null,
  source_app text,
  source_operator text,
  target_layer text,
  detail jsonb not null,
  created_at timestamptz default now()
);

alter table kinetiks_ledger enable row level security;

create policy "Users can read own ledger"
  on kinetiks_ledger for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- Append-only: no update/delete policies. Service role inserts.

-- ============================================================
-- Routing Events
-- ============================================================
create table kinetiks_routing_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  target_app text not null,
  source_proposal_id uuid references kinetiks_proposals,
  payload jsonb not null,
  relevance_note text,
  delivered boolean default false,
  created_at timestamptz default now()
);

alter table kinetiks_routing_events enable row level security;

create policy "Users can read own routing events"
  on kinetiks_routing_events for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Data Connections
-- ============================================================
create table kinetiks_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  provider text not null,
  status text default 'pending',
  credentials jsonb,
  last_sync_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table kinetiks_connections enable row level security;

create policy "Users can read own connections"
  on kinetiks_connections for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own connections"
  on kinetiks_connections for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own connections"
  on kinetiks_connections for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can delete own connections"
  on kinetiks_connections for delete
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Imports
-- ============================================================
create table kinetiks_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  import_type text not null,
  file_path text,
  status text default 'pending',
  stats jsonb default '{}',
  target_app text,
  created_at timestamptz default now()
);

alter table kinetiks_imports enable row level security;

create policy "Users can read own imports"
  on kinetiks_imports for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own imports"
  on kinetiks_imports for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Confidence Scores (cached)
-- ============================================================
create table kinetiks_confidence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null unique,
  org numeric(5,2) default 0,
  products numeric(5,2) default 0,
  voice numeric(5,2) default 0,
  customers numeric(5,2) default 0,
  narrative numeric(5,2) default 0,
  competitive numeric(5,2) default 0,
  market numeric(5,2) default 0,
  brand numeric(5,2) default 0,
  aggregate numeric(5,2) default 0,
  updated_at timestamptz default now()
);

alter table kinetiks_confidence enable row level security;

create policy "Users can read own confidence"
  on kinetiks_confidence for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Registered Synapses
-- ============================================================
create table kinetiks_synapses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  app_name text not null,
  app_url text,
  status text default 'active',
  read_layers text[] default '{}',
  write_layers text[] default '{}',
  realtime_channel text,
  activated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table kinetiks_synapses enable row level security;

create policy "Users can read own synapses"
  on kinetiks_synapses for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Billing
-- ============================================================
create table kinetiks_billing (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null unique,
  stripe_customer_id text,
  plan text default 'free',
  plan_status text default 'active',
  current_period_end timestamptz,
  seeds_balance integer default 0,
  payment_method_last4 text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table kinetiks_billing enable row level security;

create policy "Users can read own billing"
  on kinetiks_billing for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- App Activations
-- ============================================================
create table kinetiks_app_activations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references kinetiks_accounts not null,
  app_name text not null,
  status text default 'active',
  activated_at timestamptz default now(),
  unique(account_id, app_name)
);

alter table kinetiks_app_activations enable row level security;

create policy "Users can read own app activations"
  on kinetiks_app_activations for select
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can insert own app activations"
  on kinetiks_app_activations for insert
  with check (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

create policy "Users can update own app activations"
  on kinetiks_app_activations for update
  using (account_id in (select id from kinetiks_accounts where user_id = auth.uid()));

-- ============================================================
-- Indexes
-- ============================================================
create index idx_accounts_user_id on kinetiks_accounts(user_id);
create index idx_proposals_account_status on kinetiks_proposals(account_id, status);
create index idx_proposals_submitted_at on kinetiks_proposals(submitted_at);
create index idx_ledger_account_id on kinetiks_ledger(account_id);
create index idx_ledger_created_at on kinetiks_ledger(created_at);
create index idx_routing_account_app on kinetiks_routing_events(account_id, target_app);
create index idx_routing_delivered on kinetiks_routing_events(delivered) where delivered = false;
create index idx_connections_account on kinetiks_connections(account_id);
create index idx_synapses_account on kinetiks_synapses(account_id);
create index idx_app_activations_account on kinetiks_app_activations(account_id);

-- Context layer indexes
create index idx_context_org_account on kinetiks_context_org(account_id);
create index idx_context_products_account on kinetiks_context_products(account_id);
create index idx_context_voice_account on kinetiks_context_voice(account_id);
create index idx_context_customers_account on kinetiks_context_customers(account_id);
create index idx_context_narrative_account on kinetiks_context_narrative(account_id);
create index idx_context_competitive_account on kinetiks_context_competitive(account_id);
create index idx_context_market_account on kinetiks_context_market(account_id);
create index idx_context_brand_account on kinetiks_context_brand(account_id);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to tables with updated_at
create trigger set_updated_at before update on kinetiks_accounts
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_org
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_products
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_voice
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_customers
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_narrative
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_competitive
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_market
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_context_brand
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_confidence
  for each row execute function update_updated_at();
create trigger set_updated_at before update on kinetiks_billing
  for each row execute function update_updated_at();
