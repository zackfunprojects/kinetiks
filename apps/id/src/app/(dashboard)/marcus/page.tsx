import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarcusChat } from "@/components/marcus/MarcusChat";
import { redirect } from "next/navigation";
import type { MarcusThread } from "@kinetiks/types";

export default async function MarcusPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/marcus");

  const admin = createAdminClient();

  // Get account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login");

  // Load threads
  const { data: threads } = await admin
    .from("kinetiks_marcus_threads")
    .select()
    .eq("account_id", account.id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(30);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Marcus</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
          Your strategic advisor - {account.codename}
        </p>
      </div>
      <MarcusChat initialThreads={(threads ?? []) as MarcusThread[]} />
    </div>
  );
}
