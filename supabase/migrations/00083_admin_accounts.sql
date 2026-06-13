-- ============================================================
-- 00083_admin_accounts.sql  (Admin panel v1 — operator boundary)
--
-- The platform has had NO admin/operator concept: kinetiks_accounts is
-- customer-only (no role/is_admin), and "operator" was just an
-- env-named account that model-flip proposals were routed to via the
-- customer Approval queue. This introduces a first-class admin boundary.
--
-- 1. kinetiks_admins — who may reach the /admin surface and run operator
--    actions. Keyed by auth.users.id (the login identity, not a Kinetiks
--    account). Service-role plumbing: RLS enabled with NO user policies
--    (default deny — same posture as kinetiks_daily_counters /
--    kinetiks_model_assignments). The isAdmin() gate + admin server
--    actions read/write it through the service-role client; customer RLS
--    is never touched or weakened.
--
-- 2. Extend kinetiks_model_assignments.source to allow 'admin_override'
--    (an admin directly setting a role's model from the panel, distinct
--    from a 'seed' default or a 'discovery_approved' flip).
-- ============================================================

-- 1. Admin membership.
CREATE TABLE kinetiks_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superuser')),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  -- Soft revoke: isAdmin() filters revoked_at IS NULL, so history is
  -- preserved and a revoke is reversible by clearing the timestamp.
  revoked_at timestamptz
);

ALTER TABLE kinetiks_admins ENABLE ROW LEVEL SECURITY;
-- Deliberately NO user policies: admin membership is service-role-only
-- platform state. Default-deny for authenticated users is intended.

-- Active-admin lookup (the isAdmin hot path).
CREATE INDEX idx_kinetiks_admins_active
  ON kinetiks_admins (user_id)
  WHERE revoked_at IS NULL;

-- 2. Allow admin overrides as a model-assignment source.
ALTER TABLE kinetiks_model_assignments
  DROP CONSTRAINT IF EXISTS kinetiks_model_assignments_source_check;
ALTER TABLE kinetiks_model_assignments
  ADD CONSTRAINT kinetiks_model_assignments_source_check
  CHECK (source IN ('seed', 'discovery_approved', 'admin_override'));

-- 3. approved_by now records the ADMIN who set the assignment, and an
--    admin is an auth.users login (kinetiks_admins.user_id) — not a
--    customer kinetiks_accounts row. 00082 pointed this FK at
--    kinetiks_accounts back when the reviewer was the env-named operator
--    account; repoint it to auth.users. (No rows reference it yet —
--    every seed row has approved_by NULL — so this is a clean swap.)
ALTER TABLE kinetiks_model_assignments
  DROP CONSTRAINT IF EXISTS kinetiks_model_assignments_approved_by_fkey;
ALTER TABLE kinetiks_model_assignments
  ADD CONSTRAINT kinetiks_model_assignments_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id);
