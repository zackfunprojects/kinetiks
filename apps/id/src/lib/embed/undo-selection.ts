import type { UndoTimelineItem } from "@kinetiks/ui";

/**
 * The most recent non-undone action, optionally filtered by participant
 * (spec §7.3: Cmd+Z undoes the last of either participant; Cmd+Shift+Z undoes
 * the agent's last). `actions` is chronological (oldest first). Pure +
 * unit-testable.
 */
export function lastUndoable(
  actions: UndoTimelineItem[],
  participant?: "agent" | "user"
): UndoTimelineItem | undefined {
  const candidates = actions.filter(
    (a) => !a.undone && (!participant || a.participant === participant)
  );
  return candidates[candidates.length - 1];
}
