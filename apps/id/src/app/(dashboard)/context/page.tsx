import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getConfidence } from "@/lib/cortex";
import { ContextOverview } from "@/components/context/ContextOverview";
import type { ContextLayer } from "@kinetiks/types";

export const dynamic = "force-dynamic";

const LAYERS: ContextLayer[] = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
];

export default async function ContextPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/context");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, codename")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/context");

  // Fetch all 8 layers and confidence in parallel
  const [confidence, ...layerResults] = await Promise.all([
    getConfidence(admin, account.id),
    ...LAYERS.map((layer) =>
      admin
        .from(`kinetiks_context_${layer}`)
        .select("data, source, updated_at")
        .eq("account_id", account.id)
        .single()
    ),
  ]);

  const layers = {} as Record<
    ContextLayer,
    { data: Record<string, unknown> | null; source: string | null; updated_at: string | null }
  >;

  LAYERS.forEach((layer, i) => {
    const row = layerResults[i].data as {
      data: Record<string, unknown> | null;
      source: string | null;
      updated_at: string | null;
    } | null;
    layers[layer] = {
      data: row?.data ?? null,
      source: row?.source ?? null,
      updated_at: row?.updated_at ?? null,
    };
  });

  return <ContextOverview layers={layers} confidence={confidence} />;
}
