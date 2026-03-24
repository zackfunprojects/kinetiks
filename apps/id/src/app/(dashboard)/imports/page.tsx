import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ImportsManager } from "@/components/dashboard/ImportsManager";
import type { ImportRecord } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/imports");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/imports");

  const { data: imports } = await admin
    .from("kinetiks_imports")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          Imports
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
          Upload data to enrich your Kinetiks ID
        </p>
      </div>
      <ImportsManager initialImports={(imports ?? []) as ImportRecord[]} />
    </div>
  );
}
