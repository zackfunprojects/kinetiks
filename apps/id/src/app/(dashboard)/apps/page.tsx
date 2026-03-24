import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AppsManager } from "@/components/dashboard/AppsManager";
import type { AppActivation, SynapseRecord } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/apps");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/apps");

  const [{ data: activations }, { data: synapses }] = await Promise.all([
    admin
      .from("kinetiks_app_activations")
      .select("*")
      .eq("account_id", account.id),
    admin
      .from("kinetiks_synapses")
      .select("*")
      .eq("account_id", account.id),
  ]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          Apps
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
          Manage your Kinetiks ecosystem. Activate apps to connect them with your ID.
        </p>
      </div>
      <AppsManager
        initialActivations={(activations ?? []) as AppActivation[]}
        synapses={(synapses ?? []) as SynapseRecord[]}
      />
    </div>
  );
}
