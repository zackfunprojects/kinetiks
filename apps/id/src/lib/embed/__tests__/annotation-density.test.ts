import { describe, it, expect } from "vitest";
import type { Annotation, AnnotationKind } from "@kinetiks/types";
import { selectVisibleAnnotations } from "../annotation-density";

function ann(
  p: Partial<Annotation> & Pick<Annotation, "id"> & { kind?: AnnotationKind }
): Annotation {
  return {
    account_id: "acc",
    thread_id: "thr",
    kind: "data_reference",
    anchor: { component_id: "c", field_name: "f", position: "below", max_width: 280 },
    summary: "s",
    body: "b",
    pinned: false,
    dismissed: false,
    created_at: "2026-01-01T00:00:00.000Z",
    team_scope_id: null,
    ...p,
  };
}

describe("selectVisibleAnnotations", () => {
  it("drops dismissed annotations", () => {
    const out = selectVisibleAnnotations([
      ann({ id: "a", dismissed: true }),
      ann({ id: "b" }),
    ]);
    expect(out.map((a) => a.id)).toEqual(["b"]);
  });

  it("surfaces pinned, then high-stakes, then the rest", () => {
    const out = selectVisibleAnnotations([
      ann({ id: "data", kind: "data_reference" }),
      ann({ id: "decision", kind: "decision_note" }),
      ann({ id: "pinned", kind: "data_reference", pinned: true }),
      ann({ id: "suggestion", kind: "suggestion" }),
    ]);
    expect(out.map((a) => a.id)).toEqual(["pinned", "decision", "suggestion", "data"]);
  });

  it("caps the visible count", () => {
    const many = Array.from({ length: 6 }, (_, i) => ann({ id: `a${i}` }));
    expect(selectVisibleAnnotations(many, 4)).toHaveLength(4);
  });
});
