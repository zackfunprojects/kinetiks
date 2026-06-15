import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Account-scoped collaborative Realtime channels (collaborative-workspace-spec
 * §12). Three channels per session, all scoped `:{account_id}:{thread_id}`:
 *
 *   presence:{account}:{thread}     cursors, focus, hover, selection, typing
 *   annotations:{account}:{thread}  annotation CRUD / replies / dismissals
 *   workspace:{account}:{thread}    undo stack, delegation, tempo changes
 *
 * SECURITY (CLAUDE.md §Realtime, plan D4): Supabase broadcast/presence channels
 * have NO built-in RLS — the channel name is a convention, not an access
 * boundary. Every publish therefore runs through `publishAccountScoped`, which
 * refuses to send on a channel the caller's account does not own. (Full
 * Realtime Authorization via RLS on `realtime.messages` is layered on when
 * presence ships; this guard is the boundary inside our own code.)
 */

export const COLLABORATIVE_CHANNEL_PREFIXES = [
  "presence",
  "annotations",
  "workspace",
] as const;

export type CollaborativeChannelPrefix =
  (typeof COLLABORATIVE_CHANNEL_PREFIXES)[number];

export function presenceChannel(accountId: string, threadId: string): string {
  return `presence:${accountId}:${threadId}`;
}

export function annotationsChannel(accountId: string, threadId: string): string {
  return `annotations:${accountId}:${threadId}`;
}

export function workspaceChannel(accountId: string, threadId: string): string {
  return `workspace:${accountId}:${threadId}`;
}

/**
 * Extract the account_id segment from a collaborative channel name, or null if
 * the name is not a recognized `prefix:account:thread` shape.
 */
export function channelAccountId(channelName: string): string | null {
  const parts = channelName.split(":");
  if (parts.length < 3) return null;
  if (!COLLABORATIVE_CHANNEL_PREFIXES.includes(parts[0] as CollaborativeChannelPrefix)) {
    return null;
  }
  return parts[1] || null;
}

/** Thrown when a publish targets a channel the caller's account does not own. */
export class AccountScopeError extends Error {
  constructor(channelName: string, accountId: string) {
    super(
      `Refusing to publish on "${channelName}": account ${accountId} does not own this channel.`
    );
    this.name = "AccountScopeError";
  }
}

/**
 * Publish a broadcast event on an account-scoped collaborative channel, after
 * asserting the caller's account owns it. Throws `AccountScopeError` otherwise,
 * before any send happens — cross-account leakage is a critical bug.
 */
export async function publishAccountScoped(
  client: SupabaseClient,
  accountId: string,
  channelName: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const owner = channelAccountId(channelName);
  if (owner === null || owner !== accountId) {
    throw new AccountScopeError(channelName, accountId);
  }
  const channel = client.channel(channelName);
  await channel.send({ type: "broadcast", event, payload });
}
