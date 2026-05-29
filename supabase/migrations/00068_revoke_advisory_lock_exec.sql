-- 00068_revoke_advisory_lock_exec.sql
--
-- The metric-cache advisory-lock helpers (_kt_try_advisory_lock /
-- _kt_release_advisory_lock) are intended to be service_role-only, but
-- migration 00034 only did `REVOKE EXECUTE ... FROM public`. Supabase's
-- default privileges separately grant EXECUTE on public-schema functions
-- to anon and authenticated, so those roles retained access despite the
-- intent. Revoke it explicitly so the helpers are truly service_role-only.
--
-- Surfaced by supabase/tests/metric_cache_isolation.sql (test 4), which
-- now asserts the grant state via has_function_privilege. No schema
-- change, so generated types are unaffected.

REVOKE EXECUTE ON FUNCTION _kt_try_advisory_lock(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION _kt_release_advisory_lock(text) FROM anon, authenticated;
