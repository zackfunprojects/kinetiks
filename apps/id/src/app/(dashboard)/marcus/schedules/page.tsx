import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SchedulesConfig } from "@/components/marcus/SchedulesConfig";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { MarcusSchedule } from "@kinetiks/types";

export default async function MarcusSchedulesPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/marcus/schedules");

  const admin = createAdminClient();

  // Get account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login");

  // Load schedules
  const { data: schedules } = await admin
    .from("kinetiks_marcus_schedules")
    .select()
    .eq("account_id", account.id)
    .order("type");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <Link
            href="/marcus"
            style={{ color: "#6C5CE7", textDecoration: "none", fontSize: 13 }}
          >
            Marcus
          </Link>
          <span style={{ color: "#999", fontSize: 13 }}>/</span>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Schedules</h1>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
          Configure when Marcus sends you briefs and digests.
        </p>
      </div>
      <SchedulesConfig schedules={(schedules ?? []) as MarcusSchedule[]} />
    </div>
  );
}
