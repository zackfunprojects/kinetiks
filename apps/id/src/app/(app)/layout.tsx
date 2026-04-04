import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename, display_name, onboarding_complete, system_name, kinetiks_connected")
    .eq("user_id", user.id)
    .single();

  if (!account || !account.onboarding_complete) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      account={{
        id: account.id,
        codename: account.codename,
        displayName: account.display_name,
        systemName: account.system_name,
        kineticsConnected: account.kinetiks_connected,
      }}
      userEmail={user.email || ""}
    >
      {children}
    </AppShell>
  );
}
