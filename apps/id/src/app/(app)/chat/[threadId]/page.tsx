import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ChatLayout } from "@/components/chat/ChatLayout";
import {
  loadThreadView,
  supabaseThreadViewReader,
} from "@/lib/marcus/thread-view";

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

  // Ownership is verified before any of the thread's messages are read. The
  // admin client bypasses RLS, so a thread id from the URL that does not belong
  // to this account must never resolve to another tenant's conversation.
  const view = await loadThreadView(
    supabaseThreadViewReader(admin),
    account.id,
    threadId,
  );

  if (!view.owned) redirect("/chat");

  return (
    <ChatLayout
      initialThreads={view.threads}
      initialThreadId={threadId}
      initialMessages={view.messages}
      systemName={account.system_name}
    />
  );
}
