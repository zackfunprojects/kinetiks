# JWT account-claim RLS cutover — runbook (F1)

How the account scope moves from a per-request `kinetiks_accounts` subquery
to the JWT `account_id` claim, why it cannot brick tenants, and how to
verify it on a preview project before prod.

Last updated: 2026-06-14 (F1a foundation).

---

## What the cutover is

Today every account-scoped RLS policy resolves the tenant with an inline
subquery:

```sql
USING (account_id IN (SELECT id FROM kinetiks_accounts WHERE user_id = auth.uid()))
```

The custom access token hook (`00069`, live in prod) already injects the
account id as a top-level JWT claim. F1 migrates the ~108 account-scoped
policies to read that claim through one helper:

```sql
USING (account_id = (select public.kinetiks_account_id()))
```

where (migration `00084`):

```sql
kinetiks_account_id() :=
  coalesce(
    nullif(auth.jwt() ->> 'account_id', '')::uuid,   -- the claim, when present
    (select id from kinetiks_accounts                 -- else the subquery
       where user_id = auth.uid()
       order by created_at, id limit 1)
  )
```

## Why it cannot brick a tenant (the safety architecture)

The `coalesce(claim, subquery)` is the entire staging mechanism:

- **Claim present** (the prod state — the hook is registered): RLS reads the
  claim directly. Fast, no subquery. The claim is derived from the same
  `user_id → kinetiks_accounts.id` lookup, so it equals the subquery result.
- **Claim absent** (hook disabled, or a token minted before registration):
  the helper falls back to the exact subquery used today. Identical behavior.
- **A policy not yet migrated**: keeps its inline subquery. Still correct.
- **A policy migrated but the claim somehow missing**: the fallback resolves
  the same account. No lockout.

So a partially-migrated schema and a toggled-off hook are **both**
non-breaking, in both directions. `kinetiks_accounts.user_id` is `UNIQUE`,
so a user owns exactly one account — claim and subquery can never disagree.
`/api/health` surfaces the invariant directly: `jwt.claim_matches_db`.

The helper is `SECURITY INVOKER`, so its fallback subquery stays subject to
`kinetiks_accounts` RLS exactly as the inline form is, and no
`kinetiks_accounts` policy calls the helper (those scope on
`auth.uid() = user_id`), so there is no recursion.

## PR sequence

1. **`feat/jwt-account-helper-and-health` (F1a — this PR).** Adds the helper
   and the multi-account-safe hook (`00084`), commits `supabase/config.toml`
   with the hook enabled for local/CI parity, adds the `/api/health` claim
   assertion, and ships `jwt_account_resolver.sql` pgTAP + the hook
   multi-account assertion. **No policy is changed** — fully reversible,
   zero tenant risk.
2. **`feat/jwt-rls-cutover-core` (F1b).** Rewrites the core + marcus + infra
   account-scoped policies (~49) to the helper; each touched table's
   cross-tenant pgTAP gains a claim-path assertion alongside the fallback.
3. **`feat/jwt-rls-cutover-platform` (F1c).** Rewrites the remaining
   `kinetiks_*` platform policies (~44), including the `ai_calls`/`tool_calls`
   `IS NULL OR` variants and the `marcus_messages`/`webhook_deliveries`/
   `budget_allocations` parent-join inner subqueries.

Out of scope: `hv_*` (Harvest is outdated; v2 unspecced), `deskof_*` (scope by
`user_id`, not account), the identity tables (`kinetiks_accounts`,
`kinetiks_user_preferences`, `kinetiks_thread_memory`), and all service-role /
`supabase_auth_admin` policies.

## Verify on a preview/staging project before prod

The prod hook is already live, so prod tokens already carry the claim. Still,
prove the toggle on a non-prod project first:

1. Deploy the branch to a preview Supabase project with the hook **registered**
   (Dashboard → Authentication → Hooks → Custom Access Token →
   `public.custom_access_token_hook`), or rely on the committed `config.toml`
   for a local `supabase start`.
2. Sign in, call `GET /api/health` (session cookie). Expect:
   `jwt: { applicable: true, claim_present: true, claim_matches_db: true }`.
3. After F1b/F1c land on the preview, confirm normal app use still isolates
   tenants (open another account's data → denied).
4. **Toggle the hook OFF** in that project (Dashboard → unregister the hook,
   or `enabled = false`), sign in again. Expect `claim_present: false` — and
   the app **still works** (every migrated policy falls back to the subquery).
   This is the reversibility proof.
5. Re-enable the hook before promoting.

## Prod cutover + rollback

- **Cutover:** merge F1a → F1b → F1c in order; `pnpm db:push` each migration.
  The prod hook is already registered, so `claim_matches_db` is `true`
  throughout. No auth/hook change is needed at cutover time.
- **Rollback:** the `coalesce` fallback **is** the rollback — disabling the
  hook (Dashboard) returns every migrated policy to the subquery path with no
  code change. If a specific batch must be reverted, revert its migration
  (`ALTER POLICY ... USING (<col> IN (SELECT id FROM kinetiks_accounts ...))`);
  the helper and inline subquery are interchangeable.

## Notes

- `supabase/config.toml` is committed (generated from the CI-pinned CLI
  `2.105.0` default + only the `[auth.hook.custom_access_token]` block). CI's
  `rls-tests.yml` now uses the committed config instead of `supabase init`;
  `supabase/config.toml` is in the workflow's path filter so config changes
  re-run the gate.
- pgTAP injects JWT claims via `set_config('request.jwt.claims', ...)` (see
  `_setup.sql`), never through GoTrue, so the RLS gate exercises the resolver
  SQL directly; enabling the hook in `config.toml` does not change pgTAP
  pass/fail — its value is local-dev sign-in parity with prod.
