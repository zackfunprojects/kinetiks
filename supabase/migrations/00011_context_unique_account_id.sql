-- Add UNIQUE constraint on account_id for all 8 context layer tables.
-- Required for the upsert({ onConflict: "account_id" }) pattern used by
-- the context PATCH/PUT endpoints and the Cortex merge step.
--
-- Each account should have exactly one row per context layer table.
-- If duplicates exist, keep only the most recently updated row.

-- Helper: deduplicate a context table before adding the constraint.
-- Keeps the row with the latest updated_at for each account_id.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'kinetiks_context_org',
    'kinetiks_context_products',
    'kinetiks_context_voice',
    'kinetiks_context_customers',
    'kinetiks_context_narrative',
    'kinetiks_context_competitive',
    'kinetiks_context_market',
    'kinetiks_context_brand'
  ]
  loop
    execute format(
      'DELETE FROM %I a USING %I b
       WHERE a.account_id = b.account_id
         AND a.updated_at < b.updated_at',
      tbl, tbl
    );
  end loop;
end $$;

-- Now add the unique constraints (IF NOT EXISTS for idempotency)
do $$
declare
  tbl text;
  cname text;
begin
  foreach tbl in array array[
    'kinetiks_context_org',
    'kinetiks_context_products',
    'kinetiks_context_voice',
    'kinetiks_context_customers',
    'kinetiks_context_narrative',
    'kinetiks_context_competitive',
    'kinetiks_context_market',
    'kinetiks_context_brand'
  ]
  loop
    cname := tbl || '_account_id_key';
    if not exists (
      select 1 from pg_constraint where conname = cname
    ) then
      execute format(
        'alter table %I add constraint %I unique (account_id)',
        tbl, cname
      );
    end if;
  end loop;
end $$;
