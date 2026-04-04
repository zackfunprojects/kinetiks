import { sendSlackMessage } from "./bot";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProactiveMessageType = "daily_brief" | "alert" | "approval" | "milestone" | "reminder";

interface ProactiveMessage {
  type: ProactiveMessageType;
  text: string;
  blocks?: Record<string, unknown>[];
}

/**
 * Send a proactive message to a user via Slack DM.
 */
export async function sendProactiveMessage(
  accountId: string,
  message: ProactiveMessage
): Promise<boolean> {
  const admin = createAdminClient();

  // Get Slack credentials
  const { data: identity } = await admin
    .from("kinetiks_system_identity")
    .select("slack_bot_user_id")
    .eq("account_id", accountId)
    .single();

  if (!identity?.slack_bot_user_id) return false;

  // Get Slack connection with bot token and user's Slack ID
  const { data: connection } = await admin
    .from("kinetiks_connections")
    .select("metadata")
    .eq("account_id", accountId)
    .eq("provider", "slack")
    .eq("status", "active")
    .single();

  const metadata = connection?.metadata as Record<string, unknown> | undefined;
  const botToken = metadata?.bot_token as string | undefined;
  const userSlackId = metadata?.authed_user_id as string | undefined;
  if (!botToken || !userSlackId) return false;

  try {
    // Open DM with the USER (not the bot) - pass the user's Slack ID
    const dmRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: userSlackId }),
    });
    const dm = await dmRes.json();

    if (!dm.ok || !dm.channel?.id) return false;

    const result = await sendSlackMessage(
      botToken,
      dm.channel.id,
      message.text,
      message.blocks
    );

    return result.ok;
  } catch {
    return false;
  }
}
