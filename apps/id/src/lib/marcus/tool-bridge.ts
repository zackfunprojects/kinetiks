import "server-only";

import { buildCapabilityManifest, type AvailabilityContext } from "@kinetiks/tools";
import { platformAvailabilityResolvers } from "@/lib/tools/availability";

/**
 * Build a short, LLM-readable inventory of the tools / action classes /
 * operators currently registered for the account asking. Injected into
 * Marcus's pre-analysis brief so the engine can correctly answer
 * "what tools do you have?" without inventing tools that don't exist.
 *
 * Kept compact (one bullet per tool, no schemas) so it doesn't blow the
 * brief's token budget. Marcus is expected to reference these names
 * verbatim when listing capabilities.
 */
export async function buildToolInventoryForBrief(
  ctx: AvailabilityContext,
): Promise<string> {
  const manifest = await buildCapabilityManifest(ctx, platformAvailabilityResolvers);
  const tools = manifest.tools;
  const actionClasses = manifest.action_classes;
  const operators = manifest.operators;

  if (tools.length === 0 && actionClasses.length === 0 && operators.length === 0) {
    return "- No tools, action classes, or operators registered yet.";
  }

  const lines: string[] = [];
  lines.push("Tools you can call (read-only unless flagged consequential):");
  for (const t of tools) {
    const flag = t.isConsequential ? " [consequential]" : "";
    const cls = t.actionClass ? ` (action_class=${t.actionClass})` : "";
    lines.push(`- ${t.name}${flag}${cls}: ${t.description.split(/\n/)[0]}`);
  }
  if (actionClasses.length > 0) {
    lines.push("");
    lines.push("Action classes the platform recognizes:");
    for (const ac of actionClasses) {
      lines.push(`- ${ac.action_class}: ${ac.description.split(/\n/)[0]}`);
    }
  }
  if (operators.length > 0) {
    lines.push("");
    lines.push("Per-app operators registered:");
    for (const op of operators) {
      lines.push(`- ${op.app}.${op.key}: ${op.description.split(/\n/)[0]}`);
    }
  }
  return lines.join("\n");
}
