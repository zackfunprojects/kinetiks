-- ============================================================
-- One live connection per (account, provider) — migration 00075.
--
-- The partial unique index idx_kinetiks_connections_account_provider_live
-- backstops the invariant every connect path assumes: a second
-- non-revoked row for the same (account_id, provider) is rejected,
-- while revoked history rows may accumulate freely and a revoked +
-- live pair coexists (the disconnect → reconnect cycle).
-- ============================================================

BEGIN;
SELECT plan(3);

DO $$
DECLARE
  carol_user uuid := '33333333-3333-3333-3333-333333333333';
  carol_account uuid;
BEGIN
  carol_account := _kt_test_seed_account(carol_user, 'clu-carol');
  PERFORM set_config('test.carol_account', carol_account::text, true);

  -- History: a revoked google_workspace row from a prior connect.
  INSERT INTO kinetiks_connections (account_id, provider, status)
  VALUES (carol_account, 'google_workspace', 'revoked');
END $$;

-- A live row coexists with revoked history.
SELECT lives_ok(
  $$ INSERT INTO kinetiks_connections (account_id, provider, status)
     VALUES (current_setting('test.carol_account')::uuid, 'google_workspace', 'active') $$,
  'live row inserts beside revoked history for the same provider'
);

-- A second live row for the same (account, provider) is rejected,
-- regardless of which non-revoked status it carries.
SELECT throws_ok(
  $$ INSERT INTO kinetiks_connections (account_id, provider, status)
     VALUES (current_setting('test.carol_account')::uuid, 'google_workspace', 'pending') $$,
  '23505',
  NULL,
  'second live row for the same (account, provider) violates the partial unique index'
);

-- A different provider is unaffected.
SELECT lives_ok(
  $$ INSERT INTO kinetiks_connections (account_id, provider, status)
     VALUES (current_setting('test.carol_account')::uuid, 'slack', 'active') $$,
  'a different provider gets its own live row'
);

SELECT * FROM finish();
ROLLBACK;
