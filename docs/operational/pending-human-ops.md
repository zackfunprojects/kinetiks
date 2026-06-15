# Pending human ops — to do later

Owner-run steps that can't be done from a code change (production env vars,
dashboard config, doc fixes). Each is independent and non-blocking — the
shipped features are live and safe without them; these activate or tidy.

Last updated: 2026-06-14 (Phase F complete; JWT cutover 00084-00086 applied to
prod + db:types regenerated this session).

**Remaining human-only steps (need the Vercel/Supabase dashboard):** item 2
(`ADMIN_BOOTSTRAP_USER_IDS` to open `/admin`), the Sentry prod config and the
other unset prod env vars in the broader backlog below, and item 6 (GA4 OAuth).
Everything I could do from the CLI this session is done (items 0, 1, 5).

Legend: **[P1]** do soon · **[P2]** when convenient · **[info]** awareness, no action.

---

## 0. [DONE 2026-06-14] Apply the JWT RLS cutover to production (00084-00086)

**Done this session.** Phase F1 migrated all 88 account-scoped RLS policies to
the `kinetiks_account_id()` resolver (`coalesce(JWT account_id claim, the old
subquery)`). All three migrations were applied to prod with
`bash scripts/db-push.sh --allow-dirty` (the `--allow-dirty` is required only
because of the owner-intentional `apps/dm` untracked drift; the migrations
themselves were merged + pushed). Verified: `supabase migration list --linked`
shows 00084/00085/00086 with a Remote version, and `pnpm health` step 4
(migration parity) is now green.

The cutover is behavior-preserving: the prod custom-access-token hook is live,
so the migrated policies read the `account_id` claim, which equals the old
subquery result (`kinetiks_accounts.user_id` is UNIQUE). **Rollback if ever
needed:** disable the hook in the Supabase dashboard — every policy falls back
to the subquery with no code change (the coalesce design). See
`docs/operational/jwt-cutover-runbook.md`.

Post-cutover follow-up done same session: `pnpm db:types` regenerated (adds
`kinetiks_account_id`; the `_kt_reserve_daily_counter` `Returns: number | null`
surgical edit was re-applied — the generator reverts it every time).

> Note: preview-project verification (the runbook's step 1-2) was not run —
> there is no preview project wired up. The owner authorized the direct prod
> push knowing the cutover is CI-proven on both the claim and fallback paths
> and reversible via the hook toggle.

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

## 5. [DONE] `pnpm db:types` is current as of migration 00086

The model tables (`kinetiks_model_assignments`, `kinetiks_model_flip_proposals`
from 00082) were typed in #107, and the 2026-06-14 regen after the JWT cutover
push added `kinetiks_account_id`. `packages/supabase/src/types.ts` now matches
prod through 00086. Reminder for the next migration: the generator reverts the
`_kt_reserve_daily_counter` `Returns: number | null` surgical edit on every
run — re-apply it (it carries an inline comment saying so).

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
