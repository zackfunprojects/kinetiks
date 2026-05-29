-- 00069_custom_access_token_hook.sql
--
-- Supabase Custom Access Token Hook: injects the Kinetiks account_id into
-- every issued JWT as a top-level claim. This lets RLS policies read the
-- account scope cheaply from auth.jwt() instead of a per-request subquery
-- to kinetiks_accounts (policies migrate to the claim in a follow-up).
--
-- REGISTRATION IS A SEPARATE, OUT-OF-REPO STEP (see CLAUDE.md Lessons 8/10):
--   - Local/CI: add to supabase/config.toml
--       [auth.hook.custom_access_token]
--       enabled = true
--       uri = "pg-functions://postgres/public/custom_access_token_hook"
--   - Production: Supabase Dashboard -> Authentication -> Hooks ->
--       Custom Access Token -> select public.custom_access_token_hook.
-- The function logic itself is covered by
-- supabase/tests/custom_access_token_hook.sql and applies regardless of
-- registration; until it is registered, JWTs simply carry no account_id
-- claim and the transitional RLS policies fall back to the subquery path.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_account_id uuid;
  claims jsonb;
begin
  select id into v_account_id
  from public.kinetiks_accounts
  where user_id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if v_account_id is not null then
    claims := jsonb_set(claims, '{account_id}', to_jsonb(v_account_id::text));
  else
    -- Pre-onboarding (no account row yet): make sure no stale claim leaks.
    claims := claims - 'account_id';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- GoTrue invokes the hook as supabase_auth_admin.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook reads kinetiks_accounts during token generation. kinetiks_accounts
-- has RLS enabled, so grant the auth-admin role read access plus a policy.
grant usage on schema public to supabase_auth_admin;
grant select on public.kinetiks_accounts to supabase_auth_admin;

drop policy if exists "Auth admin can read accounts for token hook" on public.kinetiks_accounts;
create policy "Auth admin can read accounts for token hook"
  on public.kinetiks_accounts
  as permissive
  for select
  to supabase_auth_admin
  using (true);
