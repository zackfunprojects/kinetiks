/**
 * Admin (platform-operator) authorization — the boundary the codebase
 * lacked. Admin identity is membership in `kinetiks_admins` (keyed by the
 * auth.users login id, not a Kinetiks account). Admin surfaces and
 * actions run as service-role server code gated by these checks; customer
 * RLS is never touched.
 *
 * - getAdminContext(): resolve the current session user and their admin
 *   role, or null. Server components (the /admin layout) use it to gate.
 * - requireAdmin(): throw if the caller isn't an active admin. Server
 *   actions / admin routes use it before any mutation.
 * - bootstrapAdmins(): boot-time idempotent seed of the first admin(s)
 *   from ADMIN_BOOTSTRAP_USER_IDS.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@kinetiks/lib/env";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";

export type AdminRole = "admin" | "superuser";

export interface AdminContext {
  userId: string;
  role: AdminRole;
}

/** Is this auth.users id an active (non-revoked) admin? Service-role read. */
export async function isAdmin(
  userId: string,
): Promise<{ ok: boolean; role?: AdminRole }> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("kinetiks_admins")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data) return { ok: false };
  const role = (data as { role: string }).role;
  if (role !== "admin" && role !== "superuser") return { ok: false };
  return { ok: true, role };
}

/**
 * Resolve the current session user's admin context, or null when there is
 * no session or the user is not an active admin. Never throws — the /admin
 * layout calls notFound() on null so the panel isn't advertised.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return null;
  const { ok, role } = await isAdmin(user.id);
  if (!ok || !role) return null;
  return { userId: user.id, role };
}

/** Server-action / route guard: returns the admin context or throws. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("forbidden: admin access required");
  return ctx;
}

/**
 * Idempotently seed the first admin(s) from ADMIN_BOOTSTRAP_USER_IDS
 * (comma-separated auth.users ids). ON CONFLICT DO NOTHING: it never
 * resurrects a revoked admin or downgrades an existing one — the table is
 * the source of truth once seeded. Runs at boot; failures are logged, not
 * fatal (a missing-table during a pre-migration deploy must not crash boot).
 */
export async function bootstrapAdmins(): Promise<void> {
  const raw = serverEnv().ADMIN_BOOTSTRAP_USER_IDS;
  if (!raw) return;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) return;

  const admin = createAdminClient() as unknown as SupabaseClient;
  for (const userId of ids) {
    const { error } = await admin
      .from("kinetiks_admins")
      .upsert(
        { user_id: userId, role: "superuser", granted_by: userId },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (error) {
      await captureException(new Error(`admin bootstrap seed failed: ${error.message}`), {
        tags: { route: "boot", action: "admin_bootstrap", stage: "upsert", app: "id" },
        user: { id: userId },
        extra: {},
      });
    }
  }
}
