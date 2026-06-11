import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { serverEnv } from "@kinetiks/lib/env";
import { AppsManager } from "@/components/dashboard/AppsManager";
import { ConnectionsManager } from "@/components/connections/ConnectionsManager";
import { ImportsManager } from "@/components/dashboard/ImportsManager";
import { SystemConnectionCard } from "@/components/cortex/SystemConnectionCard";
import { SystemConnectBanner } from "@/components/cortex/SystemConnectBanner";
import { listProviders } from "@/lib/connections/providers";
import {
  isSystemProviderConfigured,
  listSystemProviders,
} from "@/lib/connections/system-providers";
import type {
  AppActivation,
  SynapseRecord,
  ConnectionPublic,
  ConnectionStatus,
  ImportRecord,
  SystemConnectionProvider,
} from "@kinetiks/types";

export const dynamic = "force-dynamic";

interface IntegrationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The live (non-revoked) system connection for a provider, reduced to
 * the card's props. Latest row wins if history exists.
 */
function liveSystemConnection(
  connections: ConnectionPublic[],
  provider: SystemConnectionProvider,
): { id: string; status: ConnectionStatus; detail: string | null } | null {
  const live = connections
    .filter((c) => c.provider === provider && c.status !== "revoked")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!live) return null;
  const meta = live.metadata ?? {};
  const detail =
    provider === "slack"
      ? typeof meta.team_name === "string"
        ? `Workspace: ${meta.team_name}`
        : "Workspace linked"
      : typeof meta.connected_email === "string"
        ? meta.connected_email
        : null;
  return { id: live.id, status: live.status, detail };
}

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
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

  const [{ data: activations }, { data: synapses }, { data: connections }, { data: imports }] =
    await Promise.all([
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
  const allConnections = (connections ?? []) as ConnectionPublic[];
  const env = serverEnv();
  const systemProviders = listSystemProviders();

  const params = await searchParams;
  const bannerOutcome =
    typeof params.system_connect === "string" ? params.system_connect : null;
  const bannerProvider =
    typeof params.provider === "string" ? params.provider : null;

  return (
    <div>
      <h1 className="kt-page-title" style={{ margin: "0 0 var(--kt-s-2)" }}>Integrations</h1>
      <p className="kt-body" style={{ margin: "0 0 var(--kt-s-6)" }}>
        Kinetiks apps, external tools, and data imports
      </p>

      {bannerOutcome ? (
        <SystemConnectBanner outcome={bannerOutcome} provider={bannerProvider} />
      ) : null}

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
          initialConnections={allConnections}
          providers={providers}
        />
      </section>

      {/* System Connections — the channels the named system speaks
          through (comms spec). Backed by kinetiks_connections rows
          with encrypted credential custody, NOT Nango. */}
      <section style={{ marginBottom: 40 }}>
        <h2 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-4)" }}>
          System Connections
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--kt-s-3)" }}>
          {systemProviders.map((def) => (
            <SystemConnectionCard
              key={def.provider}
              provider={def.provider}
              label={def.displayName}
              description={def.description}
              configured={isSystemProviderConfigured(def.provider, env)}
              connection={liveSystemConnection(allConnections, def.provider)}
            />
          ))}
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
