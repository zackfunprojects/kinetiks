import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { BillingPage } from "@/components/billing/BillingPage";
import type { BillingRecord } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function BillingRoute() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/billing");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login?redirect=/billing");

  const { data: billing } = await admin
    .from("kinetiks_billing")
    .select("*")
    .eq("account_id", account.id)
    .single();

  return <BillingPage billing={(billing as BillingRecord) ?? null} />;
}
