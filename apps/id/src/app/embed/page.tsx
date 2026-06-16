import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { EmbedSurface } from "@/components/embed/EmbedSurface";

export const dynamic = "force-dynamic";

/**
 * The reference collaborative surface (Phase 8.0 scaffold).
 *
 * Mounts at `/embed?entity=&mode=collaborative&thread=&account=`. Same-origin
 * with the shell (id.kinetiks.ai), so the shared session cookie authenticates
 * automatically — no re-auth (spec §4.4). When `mode=collaborative`, the
 * surface renders inside CollaborativeProvider with nav hidden.
 *
 * This is the substrate stand-in for a real suite app's `/embed` route: it
 * flows through the same Synapse/Realtime APIs real apps will use. The
 * minimal-but-representative content (fields, step list, selectable entities)
 * is fleshed out in Phase 8.2; this slice wires auth, the provider, and the
 * postMessage handshake.
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: { entity?: string; mode?: string; thread?: string };
}) {
  const collaborative = searchParams.mode === "collaborative";

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]
    ).toString();
    redirect(`/login?redirect=${encodeURIComponent(`/embed?${qs}`)}`);
  }

  const admin = createAdminClient();
  const { data: account, error: accountError } = await admin
    .from("kinetiks_accounts")
    .select("id, system_name")
    .eq("user_id", user.id)
    .maybeSingle();
  // A real query failure must hit the route error boundary, not look like
  // "not signed in" (CLAUDE.md: distinguish no-row from query-failed).
  if (accountError) throw accountError;
  if (!account) redirect("/login");

  return (
    <EmbedSurface
      accountId={account.id}
      systemName={account.system_name}
      threadId={searchParams.thread ?? null}
      entityId={searchParams.entity ?? null}
      collaborative={collaborative}
    />
  );
}
