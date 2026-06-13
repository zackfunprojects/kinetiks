import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { ModelManager } from "@/components/admin/ModelManager";
import type {
  AdminAssignment,
  AdminProposal,
} from "@/components/admin/ModelManager";

export const dynamic = "force-dynamic";

/**
 * /admin/models — the v1 admin surface. The route layout already gated
 * admin access; this reads the platform model state with the service-role
 * client (these tables are service-role-only by design).
 */
export default async function AdminModelsPage() {
  const db = createAdminClient() as unknown as SupabaseClient;

  const [assignmentsRes, pendingRes, historyRes] = await Promise.all([
    db
      .from("kinetiks_model_assignments")
      .select("role, assigned_model_id, family, source, frozen, released_at, updated_at")
      .order("role"),
    db
      .from("kinetiks_model_flip_proposals")
      .select("id, role, from_model, to_model, family, released_at, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    db
      .from("kinetiks_model_flip_proposals")
      .select("id, role, from_model, to_model, family, status, decided_at, reject_reason")
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(20),
  ]);

  const assignments = (assignmentsRes.data ?? []) as AdminAssignment[];
  const pending = (pendingRes.data ?? []) as AdminProposal[];
  const history = (historyRes.data ?? []) as AdminProposal[];

  return (
    <ModelManager
      assignments={assignments}
      pending={pending}
      history={history}
      loadError={Boolean(assignmentsRes.error || pendingRes.error || historyRes.error)}
    />
  );
}
