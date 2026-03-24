import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getConfidence } from "@/lib/cortex/confidence";
import { LayerDetail } from "@/components/context/LayerDetail";
import type { ContextLayer, Proposal } from "@kinetiks/types";

export const dynamic = "force-dynamic";

const VALID_LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

export default async function LayerPage({
  params,
}: {
  params: Promise<{ layer: string }>;
}) {
  const { layer: layerParam } = await params;

  if (!VALID_LAYERS.includes(layerParam as ContextLayer)) {
    redirect("/context");
  }

  const layer = layerParam as ContextLayer;

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect(`/login?redirect=/context/${layer}`);

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect(`/login?redirect=/context/${layer}`);

  const [confidence, { data: layerRow }, { data: proposals }] = await Promise.all([
    getConfidence(admin, account.id),
    admin
      .from(`kinetiks_context_${layer}`)
      .select("data, source, updated_at")
      .eq("account_id", account.id)
      .single(),
    admin
      .from("kinetiks_proposals")
      .select("*")
      .eq("account_id", account.id)
      .eq("target_layer", layer)
      .order("submitted_at", { ascending: false })
      .limit(10),
  ]);

  const row = layerRow as {
    data: Record<string, unknown> | null;
    source: string | null;
    updated_at: string | null;
  } | null;

  return (
    <LayerDetail
      layer={layer}
      data={row?.data ?? null}
      confidence={confidence[layer]}
      source={row?.source ?? null}
      updatedAt={row?.updated_at ?? null}
      recentProposals={(proposals ?? []) as Proposal[]}
    />
  );
}
