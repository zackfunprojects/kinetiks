import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getConfidence } from "@/lib/cortex/confidence";
import { detectGaps } from "@/lib/archivist/gap-detect";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import type { Proposal, LedgerEntry, AppActivation, ConnectionPublic } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/");

  // Fetch all dashboard data in parallel
  const [
    confidence,
    { data: escalatedProposals },
    { data: recentLedger },
    { data: connections },
    { data: appActivations },
    gapResult,
  ] = await Promise.all([
    getConfidence(admin, account.id),
    admin
      .from("kinetiks_proposals")
      .select("*")
      .eq("account_id", account.id)
      .eq("status", "escalated")
      .order("submitted_at", { ascending: false })
      .limit(10),
    admin
      .from("kinetiks_ledger")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("kinetiks_connections")
      .select("id, account_id, provider, status, last_sync_at, metadata, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: true }),
    admin
      .from("kinetiks_app_activations")
      .select("*")
      .eq("account_id", account.id),
    detectGaps(admin, account.id),
  ]);

  return (
    <DashboardHome
      codename={account.codename}
      confidence={confidence}
      escalatedProposals={(escalatedProposals ?? []) as Proposal[]}
      recentActivity={(recentLedger ?? []) as LedgerEntry[]}
      suggestions={gapResult.findings}
      connections={(connections ?? []) as ConnectionPublic[]}
      appActivations={(appActivations ?? []) as AppActivation[]}
    />
  );
}
