import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ChatLayout } from "@/components/chat/ChatLayout";
import type { MarcusThread } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect("/login?redirect=/chat");

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, system_name")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login");

  const { data: threads } = await admin
    .from("kinetiks_marcus_threads")
    .select()
    .eq("account_id", account.id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(30);

  return (
    <ChatLayout
      initialThreads={(threads ?? []) as MarcusThread[]}
      systemName={account.system_name}
    />
  );
}
