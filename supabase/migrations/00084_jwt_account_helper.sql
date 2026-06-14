-- 00084_jwt_account_helper.sql
--
-- F1 (JWT staged cutover) — foundation migration. Two changes, both
-- reversible and behavior-preserving. NO RLS policy is touched here; the
-- ~108 account-scoped policy rewrites ship in later batches
-- (feat/jwt-rls-cutover-core, feat/jwt-rls-cutover-platform).
--
-- ── 1. public.kinetiks_account_id() — the canonical account resolver ──
--
-- coalesce(claim, subquery): when the custom_access_token_hook has
-- injected the account_id claim (the prod hook is live), RLS reads it
-- straight off auth.jwt() — a fast top-level claim lookup, no subquery.
-- When the claim is absent (hook disabled, or a token minted before the
-- hook was registered), it falls back to the EXACT subquery every
-- account-scoped policy uses today.
--
-- This coalesce is the staging mechanism for the cutover:
--   * A policy migrated to `<col> = (select kinetiks_account_id())` is a
--     fast equality when the claim is present, and identical to today's
--     `<col> IN (SELECT id FROM kinetiks_accounts WHERE user_id =
--     auth.uid())` when the claim is absent.
--   * A policy NOT yet migrated keeps its inline subquery.
-- Both resolve the same account, so a partially-migrated schema and a
-- toggled-off hook are BOTH non-breaking — a missed policy cannot brick a
-- tenant, and disabling the hook cannot lock anyone out.
--
-- SECURITY INVOKER (the default) is deliberate: the fallback subquery
-- runs as the calling role, so it is subject to kinetiks_accounts' own
-- RLS exactly as the inline subquery is. No kinetiks_accounts policy
-- calls this helper (those scope directly on auth.uid() = user_id), so
-- there is no recursion. search_path is pinned and every reference is
-- schema-qualified.
create or replace function public.kinetiks_account_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'account_id', '')::uuid,
    (
      select a.id
      from public.kinetiks_accounts a
      where a.user_id = auth.uid()
      order by a.created_at, a.id
      limit 1
    )
  );
$$;

comment on function public.kinetiks_account_id() is
  'Resolves the caller''s Kinetiks account_id: the JWT account_id claim '
  '(minted by custom_access_token_hook) when present, else the '
  'kinetiks_accounts subquery on auth.uid(). SECURITY INVOKER so the '
  'fallback subquery stays subject to kinetiks_accounts RLS, identical to '
  'the inline subquery it replaces. Use as '
  '`<col> = (select public.kinetiks_account_id())` in RLS so the planner '
  'evaluates it once per statement (initplan), not once per row.';

-- Policies invoke the resolver as the querying role.
grant execute on function public.kinetiks_account_id() to authenticated, anon, service_role;

-- ── 2. custom_access_token_hook — made multi-account-deterministic ──
--
-- 00069's hook did `select id into v_account_id ... where user_id = ?`
-- with no ORDER BY/LIMIT. kinetiks_accounts.user_id is UNIQUE today, so a
-- user can own at most one account and the claim is unambiguous — but the
-- query shape was latently non-deterministic and would silently pick an
-- arbitrary row if the v2 multi-account/team work ever relaxes that
-- constraint. Adding `order by created_at, id limit 1` makes the choice
-- explicit and matches kinetiks_account_id()'s fallback ordering exactly,
-- so the claim and the subquery can never disagree. Behavior is unchanged
-- under the current UNIQUE(user_id) constraint. `create or replace`
-- preserves the function; grants are re-asserted for clarity.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_account_id uuid;
  claims jsonb;
begin
  select a.id into v_account_id
  from public.kinetiks_accounts a
  where a.user_id = (event->>'user_id')::uuid
  order by a.created_at, a.id
  limit 1;

  claims := coalesce(event->'claims', '{}'::jsonb);

  if v_account_id is not null then
    claims := jsonb_set(claims, '{account_id}', to_jsonb(v_account_id::text));
  else
    -- Pre-onboarding (no account row yet): ensure no stale claim leaks.
    claims := claims - 'account_id';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- GoTrue invokes the hook as supabase_auth_admin (re-asserted from 00069).
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
