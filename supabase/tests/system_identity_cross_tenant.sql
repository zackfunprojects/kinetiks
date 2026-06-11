-- ============================================================
-- Cross-tenant isolation: kinetiks_system_identity
--
-- Backfills the suite the 2026-06-09 audit flagged as missing on a
-- credential-adjacent table (D1 touches this table: migration 00075
-- drops the plaintext email_credentials column). The single FOR ALL
-- policy ("Users manage own identity") must hold on both the read
-- and the write side:
--   - reads see only the caller's own identity row;
--   - cross-tenant UPDATE affects zero rows;
--   - INSERT for another tenant's account is denied.
-- ============================================================

BEGIN;
SELECT plan(4);

DO $$
DECLARE
  alice_user uuid := '31111111-1111-1111-1111-111111111111';
  bob_user   uuid := '32222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'si-alice');
  bob_account   := _kt_test_seed_account(bob_user,   'si-bob');
  PERFORM set_config('test.alice_account', alice_account::text, true);
  PERFORM set_config('test.bob_account',   bob_account::text,   true);

  INSERT INTO kinetiks_system_identity (account_id, email_provider, email_address)
  VALUES (alice_account, 'google',    'kit@alice.test'),
         (bob_account,   'microsoft', 'max@bob.test');
END $$;

SELECT _kt_test_set_auth_user('31111111-1111-1111-1111-111111111111');

SELECT is(
  (SELECT count(*)::int FROM kinetiks_system_identity),
  1,
  'system_identity: alice sees exactly her own identity row'
);
SELECT is(
  (SELECT account_id::text FROM kinetiks_system_identity),
  current_setting('test.alice_account'),
  'system_identity: the only visible row belongs to alice'
);

-- Cross-tenant UPDATE: RLS filters bob's row out of the UPDATE's
-- scope, so zero rows change.
UPDATE kinetiks_system_identity
SET email_address = 'hijacked@alice.test'
WHERE account_id = current_setting('test.bob_account')::uuid;

SELECT _kt_test_clear_auth();
SELECT is(
  (SELECT email_address FROM kinetiks_system_identity
   WHERE account_id = current_setting('test.bob_account')::uuid),
  'max@bob.test',
  'system_identity: cross-tenant update did not change bob''s row'
);

-- Cross-tenant INSERT: the FOR ALL policy's USING doubles as WITH
-- CHECK, so inserting an identity for bob's account as alice throws.
SELECT _kt_test_set_auth_user('31111111-1111-1111-1111-111111111111');
SELECT throws_ok(
  $$ INSERT INTO kinetiks_system_identity (account_id, email_provider)
     VALUES (current_setting('test.bob_account')::uuid, 'google') $$,
  '42501',
  NULL,
  'system_identity: alice cannot insert an identity for bob''s account'
);

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
