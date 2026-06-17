import type { Annotation } from "@kinetiks/types";

export const MAX_VISIBLE_ANNOTATIONS = 4;

/**
 * Annotation density control (spec §6.3): drop dismissed annotations; surface
 * pinned + high-stakes (decision / suggestion) first; cap the rest. Pure +
 * deterministic so it is unit-testable.
 */
export function selectVisibleAnnotations(
  annotations: Annotation[],
  max = MAX_VISIBLE_ANNOTATIONS
): Annotation[] {
  const live = annotations.filter((a) => !a.dismissed);
  const priority = (a: Annotation) =>
    a.pinned ? 0 : a.kind === "decision_note" || a.kind === "suggestion" ? 1 : 2;
  return [...live].sort((a, b) => priority(a) - priority(b)).slice(0, max);
}
