-- ============================================================
-- 00040_nango_connection_unique.sql
--
-- Fix for environments where 00036 was applied before the partial
-- UNIQUE constraint landed. Drops the old non-unique
-- idx_kinetiks_connections_nango and replaces it with a partial
-- UNIQUE index on the same column.
--
-- Pre-clean check: nango_connection_id was introduced in 00036 and is
-- only ever populated by the Nango webhook handler. Production has had
-- the column for a few hours with no Nango deploy yet, so the column is
-- universally null. Still, the CREATE UNIQUE INDEX will fail loudly on
-- any environment where a duplicate snuck in.
-- ============================================================

DROP INDEX IF EXISTS idx_kinetiks_connections_nango;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kinetiks_connections_nango_unique
  ON kinetiks_connections (nango_connection_id)
  WHERE nango_connection_id IS NOT NULL;
