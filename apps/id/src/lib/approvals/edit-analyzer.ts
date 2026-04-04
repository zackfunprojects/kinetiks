import type { ApprovalRecord, EditClassification } from "./types";

/**
 * Analyze edits between original and user-modified content.
 * Classifies each edit: tone adjustment, factual correction, targeting, structural, minor polish.
 */
export async function analyzeEdits(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
  context: ApprovalRecord
): Promise<EditClassification[]> {
  const diffs = computeDiffs(original, edited);

  if (diffs.length === 0) return [];

  // Try to classify with Claude Haiku
  try {
    const { askClaude } = await import("@kinetiks/ai");

    const result = await askClaude(
      `Original:\n${JSON.stringify(original, null, 2)}\n\nEdited:\n${JSON.stringify(edited, null, 2)}\n\nDiffs:\n${JSON.stringify(diffs, null, 2)}\n\nAction category: ${context.action_category}\nSource app: ${context.source_app}`,
      {
        system: `You are an edit classifier for a GTM system. Analyze the differences between original and edited content. For each change, classify it as one of: tone_adjustment, factual_correction, targeting_adjustment, structural_change, minor_polish. Respond with JSON array only: [{ "edit_type": string, "description": string, "field_path": string, "proposal_generated": boolean }]. Set proposal_generated=true only for tone_adjustment, factual_correction, or targeting_adjustment edits that suggest a systematic pattern.`,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 1024,
      }
    );

    return JSON.parse(result) as EditClassification[];
  } catch {
    // Fallback: classify all diffs as minor_polish
    return diffs.map((diff) => ({
      edit_type: "minor_polish" as const,
      description: `Changed ${diff.path}`,
      field_path: diff.path,
      proposal_generated: false,
    }));
  }
}

interface Diff {
  path: string;
  original: unknown;
  edited: unknown;
}

function computeDiffs(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
  prefix = ""
): Diff[] {
  const diffs: Diff[] = [];

  const allKeys = new Set([...Object.keys(original), ...Object.keys(edited)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const origVal = original[key];
    const editVal = edited[key];

    if (origVal === editVal) continue;

    if (
      typeof origVal === "object" &&
      typeof editVal === "object" &&
      origVal !== null &&
      editVal !== null &&
      !Array.isArray(origVal) &&
      !Array.isArray(editVal)
    ) {
      diffs.push(
        ...computeDiffs(
          origVal as Record<string, unknown>,
          editVal as Record<string, unknown>,
          path
        )
      );
    } else {
      diffs.push({ path, original: origVal, edited: editVal });
    }
  }

  return diffs;
}
