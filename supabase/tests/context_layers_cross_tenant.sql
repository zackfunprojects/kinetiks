-- ============================================================
-- Cross-tenant isolation: the 8 Context Structure layer tables
--
-- kinetiks_context_{org,products,voice,customers,narrative,
-- competitive,market,brand} share one schema (account_id, data
-- jsonb, confidence_score, source) and one RLS shape: SELECT /
-- UPDATE / INSERT scoped to the owner account. This suite proves
-- READ isolation - a user sees only their own layer rows and
-- none of another account's - which is the invariant the Phase 3
-- reads cutover (admin client -> anon+RLS) relies on.
--
-- The scalar-subquery assertions are deliberate: if isolation
-- broke and alice saw both rows, `(SELECT data->>'owner' FROM t)`
-- raises "more than one row", failing the test; if she saw none,
-- it returns NULL != 'alice', also failing.
-- ============================================================

BEGIN;
SELECT plan(16);

-- ── Arrange: two seeded accounts, one row per layer per account ──
DO $$
DECLARE
  alice_user uuid := '11111111-1111-1111-1111-111111111111';
  bob_user   uuid := '22222222-2222-2222-2222-222222222222';
  alice_account uuid;
  bob_account uuid;
  layer text;
BEGIN
  alice_account := _kt_test_seed_account(alice_user, 'copper-fox-ctx');
  bob_account   := _kt_test_seed_account(bob_user,   'bright-otter-ctx');

  FOREACH layer IN ARRAY ARRAY['org','products','voice','customers','narrative','competitive','market','brand'] LOOP
    EXECUTE format(
      'INSERT INTO %I (account_id, data, confidence_score, source) VALUES ($1,$2,50,$3),($4,$5,50,$6)',
      'kinetiks_context_' || layer
    ) USING alice_account, jsonb_build_object('owner','alice'), 'pgtap',
            bob_account,   jsonb_build_object('owner','bob'),   'pgtap';
  END LOOP;
END $$;

-- ── Act as alice ────────────────────────────────────────────
SELECT _kt_test_set_auth_user('11111111-1111-1111-1111-111111111111');

-- org
SELECT is((SELECT data->>'owner' FROM kinetiks_context_org), 'alice',
  'context_org: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_org WHERE data->>'owner' = 'bob' $$,
  'context_org: alice cannot read bob''s row');

-- products
SELECT is((SELECT data->>'owner' FROM kinetiks_context_products), 'alice',
  'context_products: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_products WHERE data->>'owner' = 'bob' $$,
  'context_products: alice cannot read bob''s row');

-- voice
SELECT is((SELECT data->>'owner' FROM kinetiks_context_voice), 'alice',
  'context_voice: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_voice WHERE data->>'owner' = 'bob' $$,
  'context_voice: alice cannot read bob''s row');

-- customers
SELECT is((SELECT data->>'owner' FROM kinetiks_context_customers), 'alice',
  'context_customers: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_customers WHERE data->>'owner' = 'bob' $$,
  'context_customers: alice cannot read bob''s row');

-- narrative
SELECT is((SELECT data->>'owner' FROM kinetiks_context_narrative), 'alice',
  'context_narrative: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_narrative WHERE data->>'owner' = 'bob' $$,
  'context_narrative: alice cannot read bob''s row');

-- competitive
SELECT is((SELECT data->>'owner' FROM kinetiks_context_competitive), 'alice',
  'context_competitive: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_competitive WHERE data->>'owner' = 'bob' $$,
  'context_competitive: alice cannot read bob''s row');

-- market
SELECT is((SELECT data->>'owner' FROM kinetiks_context_market), 'alice',
  'context_market: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_market WHERE data->>'owner' = 'bob' $$,
  'context_market: alice cannot read bob''s row');

-- brand
SELECT is((SELECT data->>'owner' FROM kinetiks_context_brand), 'alice',
  'context_brand: alice sees only her own row');
SELECT is_empty($$ SELECT 1 FROM kinetiks_context_brand WHERE data->>'owner' = 'bob' $$,
  'context_brand: alice cannot read bob''s row');

SELECT _kt_test_clear_auth();
SELECT * FROM finish();
ROLLBACK;
