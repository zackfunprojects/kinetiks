import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ChatLayout } from "@/components/chat/ChatLayout";
import type { MarcusThread, MarcusMessage } from "@kinetiks/types";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) redirect(`/login?redirect=/chat/${threadId}`);

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id, system_name")
    .eq("user_id", user.id)
    .single();

  if (!account) redirect("/login");

  const [{ data: threads }, { data: messages }] = await Promise.all([
    admin
      .from("kinetiks_marcus_threads")
      .select()
      .eq("account_id", account.id)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(30),
    admin
      .from("kinetiks_marcus_messages")
      .select()
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <ChatLayout
      initialThreads={(threads ?? []) as MarcusThread[]}
      initialThreadId={threadId}
      initialMessages={(messages ?? []) as MarcusMessage[]}
      systemName={account.system_name}
    />
  );
}
