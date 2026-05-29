import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AppsManager } from "@/components/dashboard/AppsManager";
import { ConnectionsManager } from "@/components/connections/ConnectionsManager";
import { ImportsManager } from "@/components/dashboard/ImportsManager";
import { SystemConnectionCard } from "@/components/cortex/SystemConnectionCard";
import { listProviders } from "@/lib/connections/providers";
import type { AppActivation, SynapseRecord, ConnectionPublic, ImportRecord } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/cortex/integrations");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/cortex/integrations");

  const [
    { data: activations },
    { data: synapses },
    { data: connections },
    { data: imports },
    { data: identity },
  ] = await Promise.all([
    admin
      .from("kinetiks_app_activations")
      .select("*")
      .eq("account_id", account.id),
    admin
      .from("kinetiks_synapses")
      .select("*")
      .eq("account_id", account.id),
    admin
      .from("kinetiks_connections")
      .select("id, account_id, provider, status, last_sync_at, metadata, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: true }),
    admin
      .from("kinetiks_imports")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false }),
    admin
      .from("kinetiks_system_identity")
      .select("email_provider, email_address, slack_workspace_id, calendar_connected")
      .eq("account_id", account.id)
      .maybeSingle(),
  ]);

  const providers = listProviders();

  return (
    <div>
      <h1 className="kt-page-title" style={{ margin: "0 0 var(--kt-s-2)" }}>Integrations</h1>
      <p className="kt-body" style={{ margin: "0 0 var(--kt-s-6)" }}>
        Kinetiks apps, external tools, and data imports
      </p>

      {/* Kinetiks Apps */}
      <section style={{ marginBottom: 40 }}>
        <h2 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>
          Apps
        </h2>
        <AppsManager
          initialActivations={(activations ?? []) as AppActivation[]}
          synapses={(synapses ?? []) as SynapseRecord[]}
        />
      </section>

      {/* External Connections */}
      <section style={{ marginBottom: 40 }}>
        <h2 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>
          Connections
        </h2>
        <ConnectionsManager
          initialConnections={(connections ?? []) as ConnectionPublic[]}
          providers={providers}
        />
      </section>

      {/* System Connections */}
      <section style={{ marginBottom: 40 }}>
        <h2 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>
          System Connections
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--kt-s-3)" }}>
          <SystemConnectionCard
            label="Email"
            connected={!!identity?.email_provider}
            detail={identity?.email_address ? `${identity.email_provider}: ${identity.email_address}` : identity?.email_provider}
            description="Connect Google Workspace or Microsoft 365"
          />
          <SystemConnectionCard
            label="Slack"
            connected={!!identity?.slack_workspace_id}
            detail="Workspace linked"
            description="Connect your team workspace"
          />
          <SystemConnectionCard
            label="Calendar"
            connected={!!identity?.calendar_connected}
            detail="Calendar linked"
            description="Connect for meeting prep briefs"
          />
        </div>
      </section>

      {/* Data Imports */}
      <section>
        <h2 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>
          Imports
        </h2>
        <ImportsManager initialImports={(imports ?? []) as ImportRecord[]} />
      </section>
    </div>
  );
}
