"use client";

import { cn } from "./cn";
import { Button } from "./button";
import { Pill } from "./pill";

export interface UndoTimelineItem {
  id: string;
  participant: "agent" | "user";
  actionType: string;
  target: string;
  undone: boolean;
}

export interface UndoTimelineProps {
  /** Chronological (oldest first); the timeline renders newest at the top. */
  items: UndoTimelineItem[];
  onUndo: (id: string) => void;
}

/**
 * The shared undo stack (spec §7.3): both participants' actions in one history,
 * newest first, each individually undoable. A who-did-what timeline.
 */
export function UndoTimeline({ items, onUndo }: UndoTimelineProps) {
  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "var(--kt-fs-12)", color: "var(--kt-fg-3)" }}>
        No actions yet.
      </p>
    );
  }

  return (
    <ul className="kt-undo-timeline">
      {[...items].reverse().map((item) => (
        <li
          key={item.id}
          className={cn(
            "kt-undo-timeline__item",
            item.undone && "kt-undo-timeline__item--undone"
          )}
        >
          <Pill tone={item.participant === "agent" ? "accent" : "neutral"}>
            {item.participant === "agent" ? "Agent" : "You"}
          </Pill>
          <span className="kt-undo-timeline__label">
            {item.actionType} · {item.target}
          </span>
          {item.undone ? (
            <span className="kt-undo-timeline__undone">undone</span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onUndo(item.id)}>
              Undo
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
