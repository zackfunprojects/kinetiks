-- ============================================================
-- kinetiks_insights.dedup_key column + index from migration 00037.
--
-- The dedup contract is enforced application-side (24h window), but we
-- want pgTAP to assert:
--   - dedup_key column exists, is text, is nullable
--   - idx_kinetiks_insights_dedup exists
--   - Cross-tenant read posture (already in insights_cross_tenant) is
--     unchanged after the new column lands
-- ============================================================

BEGIN;
SELECT plan(4);

-- Column shape
SELECT has_column(
  'kinetiks_insights', 'dedup_key',
  'kinetiks_insights.dedup_key exists'
);

SELECT col_type_is(
  'kinetiks_insights', 'dedup_key', 'text',
  'kinetiks_insights.dedup_key is text'
);

SELECT col_is_null(
  'kinetiks_insights', 'dedup_key',
  'kinetiks_insights.dedup_key is nullable (legacy writers may omit it)'
);

-- Index exists
SELECT has_index(
  'kinetiks_insights', 'idx_kinetiks_insights_dedup',
  'idx_kinetiks_insights_dedup exists for the writer''s dedup lookup'
);

SELECT * FROM finish();
ROLLBACK;
