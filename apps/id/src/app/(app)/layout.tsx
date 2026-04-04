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

  // Query only columns that are guaranteed to exist.
  // system_name and kinetiks_connected were added in migration 00019
  // and may not exist yet on all environments.
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename, display_name, onboarding_complete")
    .eq("user_id", user.id)
    .single();

  if (!account || !account.onboarding_complete) {
    redirect("/onboarding");
  }

  // Try to fetch new columns separately - graceful if they don't exist
  let systemName: string | null = null;
  let kineticsConnected: boolean | null = null;
  try {
    const { data: extra } = await admin
      .from("kinetiks_accounts")
      .select("system_name, kinetiks_connected")
      .eq("id", account.id)
      .single();
    if (extra) {
      systemName = (extra as Record<string, unknown>).system_name as string | null;
      kineticsConnected = (extra as Record<string, unknown>).kinetiks_connected as boolean | null;
    }
  } catch {
    // Columns don't exist yet - that's fine
  }

  return (
    <AppShell
      account={{
        id: account.id,
        codename: account.codename,
        displayName: account.display_name,
        systemName,
        kineticsConnected,
      }}
      userEmail={user.email || ""}
    >
      {children}
    </AppShell>
  );
}
