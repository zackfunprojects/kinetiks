"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AnnotationChip } from "@kinetiks/ui";
import type { Annotation } from "@kinetiks/types";
import {
  useThreadAnnotations,
  type CreateAnnotationInput,
} from "@/lib/embed/useThreadAnnotations";

const MAX_VISIBLE = 4;

/** Fixture annotations the reference agent "leaves" while it works. A real
 *  agent would generate these (Haiku via the router). Seeded once per thread. */
const FIXTURE_SEED: CreateAnnotationInput[] = [
  {
    kind: "data_reference",
    component_id: "sequence",
    field_name: "segment",
    summary: "34 prospects match this ICP",
    body: "This segment matches 34 prospects in your ICP — highest concentration in Series B fintech.",
  },
  {
    kind: "decision_note",
    component_id: "sequence",
    field_name: "tone",
    summary: "Chose directness over a hook",
    body: "Your voice profile emphasizes directness over curiosity hooks, so the tone leads with the value.",
  },
  {
    kind: "skip_note",
    component_id: "step-2",
    field_name: "label",
    summary: "Kept the LinkedIn touch light",
    body: "Email outperforms LinkedIn 3:1 for this persona, so the LinkedIn step stays a soft nudge.",
  },
];

/** Density control (§6.3): drop dismissed; pinned + high-stakes first; cap the rest. */
function selectVisible(annotations: Annotation[]): Annotation[] {
  const live = annotations.filter((a) => !a.dismissed);
  const priority = (a: Annotation) =>
    a.pinned ? 0 : a.kind === "decision_note" || a.kind === "suggestion" ? 1 : 2;
  return [...live].sort((a, b) => priority(a) - priority(b)).slice(0, MAX_VISIBLE);
}

export function AnnotationLayer({
  containerRef,
  accountId,
  threadId,
  enabled,
}: {
  containerRef: RefObject<HTMLDivElement>;
  accountId: string;
  threadId: string | null;
  enabled: boolean;
}) {
  const { annotations, create, dismiss, pin, reply } = useThreadAnnotations(accountId, threadId);
  const seeded = useRef(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Seed the fixture annotations once per thread (only if none exist yet).
  useEffect(() => {
    if (!enabled || !threadId || seeded.current) return;
    if (annotations.length > 0) {
      seeded.current = true;
      return;
    }
    const t = setTimeout(() => {
      if (seeded.current || annotations.length > 0) return;
      seeded.current = true;
      FIXTURE_SEED.forEach((a) => void create(a));
    }, 600);
    return () => clearTimeout(t);
  }, [enabled, threadId, annotations.length, create]);

  const visible = selectVisible(annotations);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const c = container.getBoundingClientRect();
    const next: Record<string, { x: number; y: number }> = {};
    for (const a of visible) {
      const el = container.querySelector(
        `[data-component-id="${a.anchor.component_id}"][data-field-name="${a.anchor.field_name}"]`
      );
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next[a.id] = { x: r.left - c.left, y: r.bottom - c.top + 4 };
    }
    setPositions(next);
  }, [visible, containerRef]);

  if (!enabled) return null;

  return (
    <>
      {visible.map((a) => {
        const p = positions[a.id];
        if (!p) return null;
        return (
          <div key={a.id} style={{ position: "absolute", left: p.x, top: p.y, zIndex: 9 }}>
            <AnnotationChip
              kind={a.kind}
              summary={a.summary}
              body={a.body}
              pinned={a.pinned}
              replies={(a.replies ?? []).map((r) => ({
                id: r.id,
                participant: r.participant,
                body: r.body,
              }))}
              maxWidth={a.anchor.max_width}
              onDismiss={() => void dismiss(a.id)}
              onPin={() => void pin(a.id)}
              onReply={(text) => void reply(a.id, text)}
            />
          </div>
        );
      })}
    </>
  );
}
