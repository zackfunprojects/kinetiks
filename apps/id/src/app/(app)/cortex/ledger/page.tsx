import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { LedgerViewer } from "@/components/dashboard/LedgerViewer";
import type { LedgerEntry } from "@kinetiks/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/cortex/ledger");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/cortex/ledger");

  const page = Math.max(1, parseInt(params.page || "1", 10));
  const typeFilter = params.type || null;
  const appFilter = params.app || null;
  const layerFilter = params.layer || null;

  let query = admin
    .from("kinetiks_ledger")
    .select("*", { count: "exact" })
    .eq("account_id", account.id);

  if (typeFilter) {
    query = query.eq("event_type", typeFilter);
  }
  if (appFilter) {
    query = query.eq("source_app", appFilter);
  }
  if (layerFilter) {
    query = query.eq("target_layer", layerFilter);
  }

  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: entries, count } = await query;

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          Learning Ledger
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
          Complete audit trail of every change to your Kinetiks ID
        </p>
      </div>
      <LedgerViewer
        entries={(entries ?? []) as LedgerEntry[]}
        page={page}
        totalPages={totalPages}
        filters={{ type: typeFilter, app: appFilter, layer: layerFilter }}
      />
    </div>
  );
}
