# Pending human ops — to do later

Owner-run steps that can't be done from a code change (production env vars,
dashboard config, doc fixes). Each is independent and non-blocking — the
shipped features are live and safe without them; these activate or tidy.

Last updated: 2026-06-14 (after Phase F — JWT cutover + test depth + docs).

Legend: **[P1]** do soon · **[P2]** when convenient · **[info]** awareness, no action.

---

## 0. [P1] Apply the JWT RLS cutover to production (migrations 00084-00086)

Phase F1 migrated all 88 account-scoped RLS policies to the
`kinetiks_account_id()` resolver (`coalesce(JWT account_id claim, the old
subquery)`). The migrations are **merged to main but not yet `db:push`'d to
prod** — prod is at `00083`. The new `pnpm health` step 4 (migration parity)
is **intentionally red until this is applied** (it reports 00084/00085/00086
as drift), and that is the correct signal.

This is the one consequential, gated step of Phase F. The cutover is
behavior-preserving (the coalesce fallback means a present claim resolves to
the same account as the old subquery, and `kinetiks_accounts.user_id` is
UNIQUE), but the spec mandates preview verification before flipping prod RLS.

Procedure (full detail in `docs/operational/jwt-cutover-runbook.md`):
1. On a preview/staging Supabase project, apply the migrations and hit
   `GET /api/health` (session cookie): expect `jwt.claim_matches_db: true`.
2. Toggle the hook **off** there and confirm the app still works (the
   subquery fallback) — the reversibility proof.
3. Then apply to prod: `pnpm db:push` (the prod hook is already live, so
   `claim_matches_db` stays true throughout; rollback = disable the hook).

```bash
pnpm db:push   # applies 00084-00086 after the git-sync gate passes
```

Verify: `supabase migration list --linked` shows 00084-00086 with a Remote
version; `pnpm health` step 4 goes green.

---

## 1. [DONE 2026-06-14] Set `IDENTITY_API_URL` in Supabase Edge secrets

**Done this session** (`supabase secrets set IDENTITY_API_URL=https://id.kinetiks.ai`;
confirmed in `supabase secrets list`). Several Deno crons (e.g.
`oracle-analysis-cron`) call back into apps/id via `IDENTITY_API_URL` and were
failing closed silently without it. Verify on the next `oracle-analysis-cron`
run logs in the Supabase dashboard that it returns 200 (not the env-guard 500).

---

## 2. [P1] Set `ADMIN_BOOTSTRAP_USER_IDS` on Vercel (project: kinetiks-id)

**This is the ONLY remaining step to open the admin panel.** Everything else
is already done: migration 00083 is applied to prod (`kinetiks_admins` exists,
verified), the `/admin` routes are deployed and gated (unauth → `/login`,
non-admin → 404), and the generated types are in PR #107. Until this var is
set, nobody is an admin, so `/admin` 404s for everyone (the safe default).

The admin panel (`/admin`) gates on membership in `kinetiks_admins`. Boot
seeds the first admin(s) from this env var so you can reach the panel without
a manual SQL insert; after that, admins are managed in-table.

(This replaces the old `PLATFORM_OPERATOR_ACCOUNT_ID` — model-flip review moved
off the customer Approvals queue into the admin panel, so that var is gone.)

- Vercel → kinetiks-id → Settings → Environment Variables → add
  `ADMIN_BOOTSTRAP_USER_IDS` = your `auth.users.id` (comma-separated for
  multiple). Production. Redeploy.

Find your auth user id:
```sql
select u.id, u.email, a.codename
from auth.users u left join kinetiks_accounts a on a.user_id = u.id
order by u.created_at;
```

---

## 3. [info] `authority-defaults-diff-cron` is now active

This session set `KINETIKS_ID_API_URL=https://id.kinetiks.ai` (a Supabase Edge
secret), which `authority-defaults-diff-cron` also reads. It had been dormant
(fail-closed) and will now run: it proposes manifest-declared default standing
grants the customer hasn't accepted. No action — just be aware proposals may
start appearing in the Approvals queue. Revert by unsetting the secret if you
want it dormant again.

---

## 4. [P2] Fix stale docs: apps/id production domain

apps/id is served at **`https://id.kinetiks.ai`**, NOT `https://kinetiks.ai`
(verified 2026-06-13: `kinetiks.ai/api/health` → 404; `id.kinetiks.ai/api/health`
→ 401). Two docs are wrong and will mislead the next cron/URL config:

- `CLAUDE.md` → "apps/id -> kinetiks.ai" (Vercel deployment section).
- `docs/operational/env-vars.md` → `KINETIKS_ID_API_URL` / `IDENTITY_API_URL`
  "Default `https://kinetiks.ai`" — should be `https://id.kinetiks.ai`.

Small docs-only PR.

---

## 5. [P2] Regenerate `pnpm db:types` for the two new model tables

Migration 00082 added `kinetiks_model_assignments` and
`kinetiks_model_flip_proposals`. The feature code uses the service-role client
(untyped), so it compiles and runs without regenerated types — but the
generated `packages/supabase/src/types.ts` doesn't yet include the two tables.

```bash
pnpm db:types   # then commit packages/supabase/src/types.ts on a branch + PR
```

Expect the diff to add only the two table types (behavior no-op).

---

## 6. [P2] (Reminder) Deferred GA4 OAuth env vars on Vercel

Skipped 2026-05-17. Set the GA4 OAuth client env vars on Vercel before any
real-user GA4 connection testing. (Tracked separately; included here so it's
in one place.)

---

## Broader prod-config backlog (reference, not this session)

The 2026-06-09 audit (`docs/operational/comprehensive-audit-2026-06-09.md` §2.1)
found many prod env vars unset — **Sentry first** (prod error reporting is
blind without it), then Nango / Slack / Resend / Workspace / PostHog / PDL.
That's the larger "make prod fully configured" effort; the items above are the
ones surfaced by recent work. Run `pnpm health` after any env change.
