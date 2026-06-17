import { describe, it, expect } from "vitest";
import type { UndoTimelineItem } from "@kinetiks/ui";
import { lastUndoable } from "../undo-selection";

function act(p: Partial<UndoTimelineItem> & Pick<UndoTimelineItem, "id">): UndoTimelineItem {
  return {
    participant: "user",
    actionType: "field_update",
    target: "t",
    undone: false,
    ...p,
  };
}

describe("lastUndoable", () => {
  it("returns the most recent non-undone action", () => {
    const out = lastUndoable([
      act({ id: "a" }),
      act({ id: "b" }),
      act({ id: "c", undone: true }),
    ]);
    expect(out?.id).toBe("b");
  });

  it("filters to a participant (Cmd+Shift+Z = agent-only)", () => {
    const out = lastUndoable(
      [
        act({ id: "u1", participant: "user" }),
        act({ id: "a1", participant: "agent" }),
        act({ id: "u2", participant: "user" }),
      ],
      "agent"
    );
    expect(out?.id).toBe("a1");
  });

  it("returns undefined when nothing is undoable", () => {
    expect(lastUndoable([act({ id: "a", undone: true })])).toBeUndefined();
    expect(lastUndoable([])).toBeUndefined();
  });
});
