import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { SettingsPage } from "@/components/dashboard/SettingsPage";

export const dynamic = "force-dynamic";

export default async function SettingsRoute() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/settings");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename, display_name, from_app")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/settings");

  // Check which API keys are set by querying connections directly
  const { data: byokConnections } = await admin
    .from("kinetiks_connections")
    .select("provider, status")
    .eq("account_id", account.id)
    .in("provider", ["anthropic", "firecrawl", "pdl"]);

  const apiKeysSet = { anthropic: false, firecrawl: false, pdl: false };
  for (const conn of byokConnections ?? []) {
    if (conn.provider in apiKeysSet) {
      apiKeysSet[conn.provider as keyof typeof apiKeysSet] = conn.status === "active";
    }
  }

  return (
    <SettingsPage
      account={{
        id: account.id,
        codename: account.codename,
        display_name: account.display_name,
        from_app: account.from_app,
      }}
      email={user.email || ""}
      apiKeysSet={apiKeysSet}
    />
  );
}
