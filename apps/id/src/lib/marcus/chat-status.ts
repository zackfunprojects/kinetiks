/**
 * B2 — typed status events for the Marcus chat SSE protocol.
 *
 * The streaming pipeline emits one of these at each pre-stream boundary
 * (intent classification, evidence brief, tool decision, per-tool
 * execution, response start) so the 1.5-3s of silent agent work before
 * the first token renders as visible progress ("Checking GA4...")
 * instead of a dead spinner.
 *
 * The wire shape is `{ type: "status", stage, label, tool_name? }`.
 * `label` is the customer-facing string, written server-side so every
 * channel (web, desktop, future Slack thread sync) narrates identically.
 */

export type MarcusStatusStage =
  /** Classifying the user's question. */
  | "intent"
  /** Building the pre-analysis evidence brief. */
  | "brief"
  /** Choosing which data sources (tools) to consult. */
  | "tool_decision"
  /** A specific tool is running; `tool_name` is set. */
  | "tool_exec"
  /** Evidence assembled; the response is being written. */
  | "responding";

export interface MarcusStatusEvent {
  type: "status";
  stage: MarcusStatusStage;
  /** Customer-facing progress label. Plain language, no tool jargon. */
  label: string;
  /** Registry tool name, present only for stage="tool_exec". */
  tool_name?: string;
}

export function statusEvent(
  stage: Exclude<MarcusStatusStage, "tool_exec">,
  label: string,
): MarcusStatusEvent {
  return { type: "status", stage, label };
}

export function toolExecStatusEvent(toolName: string): MarcusStatusEvent {
  return {
    type: "status",
    stage: "tool_exec",
    label: friendlyToolStatusLabel(toolName),
    tool_name: toolName,
  };
}

/**
 * Customer-facing labels per registry tool. Presentation copy only —
 * the registry's tool descriptions remain the canonical LLM-facing
 * contract. Read tools narrate as "Checking <source>"; consequential
 * tools narrate as "Preparing..." because the action may queue for the
 * customer's approval rather than run (the label must never imply the
 * action happened). Tools not listed fall back to a humanized
 * "Checking <name>", so a new tool gets a sane label with no change
 * required here.
 */
const TOOL_STATUS_LABELS: Record<string, string> = {
  ga4_query: "Checking GA4",
  gsc_query: "Checking Search Console",
  stripe_query: "Checking Stripe",
  google_ads_query: "Checking Google Ads",
  meta_ads_query: "Checking Meta Ads",
  hubspot_query: "Checking HubSpot",
  twitter_query: "Checking Twitter",
  linkedin_query: "Checking LinkedIn",
  instagram_query: "Checking Instagram",
  tiktok_query: "Checking TikTok",
  query_patterns: "Checking your pattern library",
  query_insights: "Checking recent insights",
  query_active_authority: "Checking current authority",
  query_actions_authority: "Checking recent authorized actions",
  list_capabilities: "Checking connected capabilities",
  draft_email: "Preparing an email draft",
  add_calendar_event: "Preparing a calendar event",
  send_slack_notification: "Preparing a Slack notification",
};

export function friendlyToolStatusLabel(toolName: string): string {
  return (
    TOOL_STATUS_LABELS[toolName] ?? `Checking ${humanizeToolName(toolName)}`
  );
}

function humanizeToolName(toolName: string): string {
  const words = toolName
    .replace(/_query$/, "")
    .split("_")
    .filter(Boolean);
  if (words.length === 0) return toolName;
  return words.join(" ");
}
