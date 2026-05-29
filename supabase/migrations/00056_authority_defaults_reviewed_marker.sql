-- ============================================================
-- 00056_authority_defaults_reviewed_marker.sql
--
-- Phase 5 — Kinetiks Contract Addendum §2.6.
--
-- Onboarding completion marker for the new Permissions step (step 6
-- of 7 in `apps/id/src/components/onboarding/OnboardingFlow.tsx`). The
-- column is set by the acceptOnboardingDefaults Server Action
-- (`apps/id/src/app/onboarding/authority-defaults/actions.ts`) once
-- the customer has made a decision — accept, reject, or skip — and
-- gates two things downstream:
--
--   1. The OnboardingFlow resume `useEffect`: a returning customer
--      whose authority_defaults_reviewed_at is null re-enters the
--      Permissions step; whose marker is non-null skips past it.
--
--   2. The authority-defaults-diff-cron at
--      `supabase/functions/authority-defaults-diff-cron/index.ts`:
--      runs only against accounts whose marker is non-null. Accounts
--      mid-onboarding never see the cron propose a manifest default —
--      that races the signup flow.
--
-- The marker is set even on Skip: the customer made a decision
-- (defer), the Ledger captures it as `authority_default_skipped` per
-- manifest key, and the cron honors the 30-day cooldown before
-- re-proposing. Setting the marker is what distinguishes "the customer
-- chose to defer" from "the customer never reached the step."
-- ============================================================

ALTER TABLE kinetiks_accounts
  ADD COLUMN IF NOT EXISTS authority_defaults_reviewed_at timestamptz;

COMMENT ON COLUMN kinetiks_accounts.authority_defaults_reviewed_at IS
  'Timestamp the customer first made a decision on the manifest-declared default standing grants at signup (accept / reject / skip). Set by the acceptOnboardingDefaults Server Action. Null means the Permissions step has not been completed; the OnboardingFlow resume routes the customer back to it, and the manifest-diff cron excludes the account from its pass.';
