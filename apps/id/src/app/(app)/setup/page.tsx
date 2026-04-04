import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { SetupFlow } from "@/components/setup/SetupFlow";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/setup");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, kinetiks_connected, system_name")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login");

  // Already connected - go to chat
  if (account.kinetiks_connected) {
    redirect("/chat");
  }

  return (
    <SetupFlow
      accountId={account.id}
      existingName={account.system_name}
    />
  );
}
