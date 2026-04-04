import type { CommandResponse } from "@kinetiks/synapse";

/**
 * Aggregate responses from multiple app commands into a unified Chat response.
 */
export function aggregateResponses(
  responses: CommandResponse[],
  userMessage: string
): AggregatedResult {
  const successes = responses.filter((r) => r.status === "success");
  const errors = responses.filter((r) => r.status === "error");
  const timeouts = responses.filter((r) => r.status === "timeout");

  // Build response text
  const parts: string[] = [];

  // Successful responses
  for (const response of successes) {
    if (response.data) {
      parts.push(formatAppResponse(response));
    }
  }

  // Errors and timeouts
  if (errors.length > 0) {
    const errorApps = errors.map((e) => e.app_name).join(", ");
    parts.push(`\n---\nSome requests failed (${errorApps}). ${errors[0].error}`);
  }

  if (timeouts.length > 0) {
    const timeoutApps = timeouts.map((t) => t.app_name).join(", ");
    parts.push(`\n---\n${timeoutApps} took too long to respond. Try again or check the app directly.`);
  }

  // If everything failed
  if (successes.length === 0 && responses.length > 0) {
    return {
      text: "I wasn't able to complete that command. " +
        (errors[0]?.error ?? "The target app didn't respond.") +
        "\n\nTry being more specific, or check if the app is connected.",
      has_errors: true,
      approval_ids: [],
      data: {},
    };
  }

  // Collect any approval IDs
  const approvalIds = responses
    .filter((r) => r.approval_id)
    .map((r) => r.approval_id as string);

  // Collect all data
  const mergedData: Record<string, unknown> = {};
  for (const response of successes) {
    if (response.data) {
      mergedData[response.app_name] = response.data;
    }
  }

  return {
    text: parts.join("\n\n") || "Done.",
    has_errors: errors.length > 0 || timeouts.length > 0,
    approval_ids: approvalIds,
    data: mergedData,
  };
}

function formatAppResponse(response: CommandResponse): string {
  const data = response.data;
  if (!data) return "";

  // If the response has a formatted message, use it
  if (typeof data.message === "string") return data.message;

  // If it has a summary, use that
  if (typeof data.summary === "string") return data.summary;

  // If it has results array, format as list
  if (Array.isArray(data.results)) {
    const items = data.results.slice(0, 10);
    const lines = items.map((item: Record<string, unknown>, i: number) => {
      const label = item.name ?? item.title ?? item.email ?? `Item ${i + 1}`;
      return `${i + 1}. ${label}`;
    });
    const countNote = data.results.length > 10
      ? `\n...and ${data.results.length - 10} more`
      : "";
    return `**${response.app_name}**:\n${lines.join("\n")}${countNote}`;
  }

  // If it has a count
  if (typeof data.count === "number") {
    return `**${response.app_name}**: ${data.count} result${data.count !== 1 ? "s" : ""}`;
  }

  // Fallback: stringify data
  return `**${response.app_name}**: ${JSON.stringify(data).slice(0, 500)}`;
}

export interface AggregatedResult {
  text: string;
  has_errors: boolean;
  approval_ids: string[];
  data: Record<string, unknown>;
}
