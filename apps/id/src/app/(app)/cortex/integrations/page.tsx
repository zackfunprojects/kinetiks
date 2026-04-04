import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AppsManager } from "@/components/dashboard/AppsManager";
import { ConnectionsManager } from "@/components/connections/ConnectionsManager";
import { ImportsManager } from "@/components/dashboard/ImportsManager";
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
  ]);

  const providers = listProviders();

  return (
    <div>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 8px",
        }}
      >
        Integrations
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          margin: "0 0 32px",
        }}
      >
        Kinetiks apps, external tools, and data imports
      </p>

      {/* Kinetiks Apps */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 16px",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          Apps
        </h2>
        <AppsManager
          initialActivations={(activations ?? []) as AppActivation[]}
          synapses={(synapses ?? []) as SynapseRecord[]}
        />
      </section>

      {/* External Connections */}
      <section style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 16px",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          Connections
        </h2>
        <ConnectionsManager
          initialConnections={(connections ?? []) as ConnectionPublic[]}
          providers={providers}
        />
      </section>

      {/* Data Imports */}
      <section>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 16px",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          Imports
        </h2>
        <ImportsManager initialImports={(imports ?? []) as ImportRecord[]} />
      </section>
    </div>
  );
}
