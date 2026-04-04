import { askClaude } from "@kinetiks/ai";
import type { SynapseCommand, CommandContext } from "@kinetiks/synapse";
import type { CapabilityMatch, ParsedCommandIntent } from "./command-router";

/**
 * Translate a parsed intent into structured SynapseCommand(s).
 * Uses Claude Sonnet for complex translation.
 */
export async function translateCommand(
  intent: ParsedCommandIntent,
  matches: CapabilityMatch[],
  context: CommandContext
): Promise<SynapseCommand[]> {
  if (matches.length === 0) return [];

  // For single, clear match - build directly
  if (matches.length === 1 && matches[0].score > 0.7) {
    return [buildCommand(matches[0], intent, context)];
  }

  // For ambiguous or multi-app - use Claude to resolve
  try {
    const capabilitySchema = matches.map((m) => ({
      app: m.app_name,
      capability: m.capability.name,
      type: m.capability.type,
      description: m.capability.description,
      parameters: m.capability.parameters,
      score: m.score,
    }));

    const result = await askClaude(
      `User intent: "${intent.raw_text}"\nParsed type: ${intent.type}\nSubject: ${intent.subject}\nParameters: ${JSON.stringify(intent.parameters)}\n\nAvailable capabilities:\n${JSON.stringify(capabilitySchema, null, 2)}\n\nGenerate a dispatch plan as JSON array of commands: [{ "app": string, "capability": string, "parameters": object, "parallel": boolean }]`,
      {
        system: `You are a command translator for a GTM system. Convert user intent into structured app commands. Choose the best matching capability and fill parameters. If multiple apps needed, set parallel=true for independent commands. Respond with JSON only.`,
        model: "claude-sonnet-4-20250514",
        maxTokens: 1024,
      }
    );

    const plan = JSON.parse(result) as { app: string; capability: string; parameters: Record<string, unknown>; parallel: boolean }[];

    return plan
      .filter((step) => {
        // Only include steps that map to a real matched capability
        const match = matches.find((m) => m.app_name === step.app && m.capability.name === step.capability);
        return match !== undefined;
      })
      .map((step) => {
        const match = matches.find((m) => m.app_name === step.app && m.capability.name === step.capability)!;
        return {
          id: crypto.randomUUID(),
          source: "marcus" as const,
          target_app: step.app,
          capability: step.capability,
          type: match.capability.type,
          parameters: step.parameters,
          context,
          timeout_ms: match.capability.timeout_ms || 30000,
          created_at: new Date().toISOString(),
        };
      });
  } catch {
    // Fallback to top match
    return [buildCommand(matches[0], intent, context)];
  }
}

function buildCommand(
  match: CapabilityMatch,
  intent: ParsedCommandIntent,
  context: CommandContext
): SynapseCommand {
  return {
    id: crypto.randomUUID(),
    source: "marcus",
    target_app: match.app_name,
    capability: match.capability.name,
    type: match.capability.type,
    parameters: intent.parameters,
    context,
    timeout_ms: match.capability.timeout_ms || 30000,
    created_at: new Date().toISOString(),
  };
}
