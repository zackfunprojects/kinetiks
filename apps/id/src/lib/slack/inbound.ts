/**
 * Slack inbound event processing — Phase D3.
 *
 * The worker behind /api/slack/events. The route verifies the
 * signature and acks within 3 seconds; this module does the real
 * work afterwards (via runAfterResponse):
 *
 *   - team_id → account resolution through the D1 slack connection
 *   - exactly-once claims (kinetiks_inbound_events UNIQUE; Slack
 *     retries lose with 23505 and skip)
 *   - mention / DM → Marcus turn on a synced thread
 *     (kinetiks_marcus_threads keyed by account + channel +
 *     thread_ts, per comms spec §3.5) → threaded reply through the
 *     @kinetiks/ai slack-dispatcher as the named identity
 *
 * Slack is never critical-path: every failure here is captured and
 * swallowed — the ack already went out, and a failed reply must not
 * take a webhook handler down with it. Raw message text is processed
 * in-flight and persisted only as the Marcus conversation the
 * customer owns (their own thread), never as bulk channel storage
 * (spec §3.2 privacy posture).
 */

import "server-only";

import { dispatchSlackMessage } from "@kinetiks/ai/slack-dispatcher";

import { processMarcusMessage } from "@/lib/marcus/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/observability/sentry";
import { marcusReplyBlocks } from "@/lib/slack/blocks";

/** The subset of Slack event fields the worker consumes. */
export interface SlackInboundEvent {
  type: string;
  /** Message subtype (bot_message, message_changed, ...). */
  subtype?: string;
  user?: string;
  /** Present on messages posted by bots (including ourselves). */
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
}

export interface ProcessSlackEventArgs {
  teamId: string;
  eventId: string;
  event: SlackInboundEvent;
}

export type ProcessSlackEventOutcome =
  | "replied"
  | "duplicate"
  | "no_account"
  | "ignored"
  | "failed";

const PG_UNIQUE_VIOLATION = "23505";

/**
 * team_id → account via the live slack connection's metadata. Null
 * when no active connection claims the workspace.
 */
export async function resolveAccountBySlackTeam(teamId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kinetiks_connections")
    .select("account_id, status")
    .eq("provider", "slack")
    .eq("status", "active")
    .filter("metadata->>team_id", "eq", teamId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`slack team resolution failed: ${error.message}`);
  }
  return (data?.account_id as string | undefined) ?? null;
}

/**
 * Claim an inbound event. True = first delivery, process it. False =
 * a retry of something already claimed, skip.
 */
export async function claimSlackEvent(args: {
  accountId: string;
  eventKey: string;
  eventType: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("kinetiks_inbound_events").insert({
    account_id: args.accountId,
    source: "slack",
    event_key: args.eventKey,
    event_type: args.eventType,
  });
  if (!error) return true;
  if (error.code === PG_UNIQUE_VIOLATION) return false;
  throw new Error(`slack event claim failed: ${error.message}`);
}

/**
 * Find or create the Kinetiks thread for a Slack thread. The partial
 * unique index on (account_id, slack_channel_id, slack_thread_ts)
 * makes the concurrent first-message race safe: the losing insert
 * retries as a lookup.
 */
export async function findOrCreateSlackThread(args: {
  accountId: string;
  channelId: string;
  threadTs: string;
}): Promise<string> {
  const admin = createAdminClient();

  const lookup = async (): Promise<string | null> => {
    const { data, error } = await admin
      .from("kinetiks_marcus_threads")
      .select("id")
      .eq("account_id", args.accountId)
      .eq("slack_channel_id", args.channelId)
      .eq("slack_thread_ts", args.threadTs)
      .maybeSingle();
    if (error) throw new Error(`slack thread lookup failed: ${error.message}`);
    return (data?.id as string | undefined) ?? null;
  };

  const existing = await lookup();
  if (existing) return existing;

  const { data: created, error: insertError } = await admin
    .from("kinetiks_marcus_threads")
    .insert({
      account_id: args.accountId,
      title: "Slack conversation",
      channel: "slack",
      slack_channel_id: args.channelId,
      slack_thread_ts: args.threadTs,
    })
    .select("id")
    .maybeSingle();
  if (insertError) {
    if (insertError.code === PG_UNIQUE_VIOLATION) {
      const raced = await lookup();
      if (raced) return raced;
    }
    throw new Error(`slack thread create failed: ${insertError.message}`);
  }
  if (!created?.id) throw new Error("slack thread create returned no id");
  return created.id as string;
}

/**
 * Strip the leading bot mention from an app_mention text
 * ("<@U0BOT> how's pipeline?" → "how's pipeline?"). Falls back to
 * removing every mention token when the leading-strip leaves nothing.
 */
export function stripBotMention(text: string): string {
  const leading = text.replace(/^\s*<@[A-Z0-9]+>\s*/i, "").trim();
  if (leading.length > 0) return leading;
  return text.replace(/<@[A-Z0-9]+>/gi, "").trim();
}

/**
 * Route one verified inbound event. Never throws — outcomes are
 * returned for the route's structured logging and failures are
 * captured here with the canonical shape.
 */
export async function processSlackEvent(
  args: ProcessSlackEventArgs,
): Promise<ProcessSlackEventOutcome> {
  const { event } = args;
  try {
    // Only humans: drop bot messages (including our own replies) and
    // non-message subtypes (edits, deletes, joins).
    if (event.bot_id || (event.subtype && event.subtype !== "file_share")) {
      return "ignored";
    }
    const isMention = event.type === "app_mention";
    const isDirectMessage = event.type === "message" && event.channel_type === "im";
    if (!isMention && !isDirectMessage) return "ignored";
    if (!event.channel || !event.ts || !event.user) return "ignored";

    const accountId = await resolveAccountBySlackTeam(args.teamId);
    if (!accountId) return "no_account";

    const claimed = await claimSlackEvent({
      accountId,
      eventKey: `${args.teamId}:${args.eventId}`,
      eventType: event.type,
    });
    if (!claimed) return "duplicate";

    const rawText = event.text ?? "";
    const message = isMention ? stripBotMention(rawText) : rawText.trim();
    if (!message) return "ignored";

    // Thread root: replies continue the same Kinetiks thread; a
    // top-level mention starts one rooted at its own ts.
    const threadTs = event.thread_ts ?? event.ts;
    const threadId = await findOrCreateSlackThread({
      accountId,
      channelId: event.channel,
      threadTs,
    });

    const admin = createAdminClient();
    const response = await processMarcusMessage(
      admin,
      accountId,
      message,
      threadId,
      "slack",
    );

    // Reply in-thread (spec §3.3: in-thread, concise, link back).
    await dispatchSlackMessage({
      account_id: accountId,
      channel: event.channel,
      body: response.message,
      thread_ts: threadTs,
      blocks: marcusReplyBlocks({ body: response.message, threadId }),
    });

    return "replied";
  } catch (err) {
    await captureException(err, {
      tags: {
        route: "/api/slack/events",
        action: "slack.inbound",
        stage: "process_event",
        app: "id",
      },
      extra: {
        team_id: args.teamId,
        event_type: event.type,
        event_id: args.eventId,
      },
    });
    return "failed";
  }
}
