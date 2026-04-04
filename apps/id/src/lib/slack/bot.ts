import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get the system name for the Slack bot display name.
 */
export async function getSlackBotName(accountId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("system_name")
    .eq("id", accountId)
    .single();

  return account?.system_name ?? "Kinetiks";
}

/**
 * Update the Slack bot display name when system name changes.
 */
export async function updateSlackBotName(
  botToken: string,
  newName: string
): Promise<boolean> {
  try {
    const res = await fetch("https://slack.com/api/users.profile.set", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile: {
          display_name: newName,
          real_name: newName,
        },
      }),
    });

    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * Send a message via Slack bot.
 */
export async function sendSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  blocks?: Record<string, unknown>[]
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text,
      ...(blocks ? { blocks } : {}),
    }),
  });

  return res.json();
}
