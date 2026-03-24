import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ConnectionsManager } from "@/components/connections/ConnectionsManager";
import { listProviders } from "@/lib/connections/providers";
import type { ConnectionPublic } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/connections");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/connections");

  const { data: connections } = await admin
    .from("kinetiks_connections")
    .select(
      "id, account_id, provider, status, last_sync_at, metadata, created_at"
    )
    .eq("account_id", account.id)
    .order("created_at", { ascending: true });

  const providers = listProviders();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          Connections
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
          Connect your data sources to enrich your Kinetiks ID
        </p>
      </div>
      <ConnectionsManager
        initialConnections={(connections ?? []) as ConnectionPublic[]}
        providers={providers}
      />
    </div>
  );
}
