# Pending human ops — to do later

Owner-run steps that can't be done from a code change (production env vars,
dashboard config, doc fixes). Each is independent and non-blocking — the
shipped features are live and safe without them; these activate or tidy.

Last updated: 2026-06-13 (after the adaptive-model-selection + E-phase prod activation).

Legend: **[P1]** do soon · **[P2]** when convenient · **[info]** awareness, no action.

---

## 1. [P1] Set `IDENTITY_API_URL` in Supabase Edge secrets

Several Deno crons call back into apps/id via `IDENTITY_API_URL`, which is
**not set in prod** → those crons (e.g. `oracle-analysis-cron`) fail closed
silently. The correct value is the apps/id domain (see item 4 — it's
`id.kinetiks.ai`, not `kinetiks.ai`).

```bash
supabase secrets set IDENTITY_API_URL=https://id.kinetiks.ai
```

Verify: `supabase secrets list` shows it, then check the next `oracle-analysis-cron`
run logs in the Supabase dashboard for a 200 (not the env-guard 500).

---

## 2. [P1] Set `ADMIN_BOOTSTRAP_USER_IDS` on Vercel (project: kinetiks-id)

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
