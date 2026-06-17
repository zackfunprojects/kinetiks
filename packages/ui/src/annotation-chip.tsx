"use client";

import { useState } from "react";
import { cn } from "./cn";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { Pill } from "./pill";

// Local types keep @kinetiks/ui decoupled from the domain types package; they
// are structurally compatible with @kinetiks/types' AnnotationKind / reply.
export type AnnotationChipKind =
  | "decision_note"
  | "data_reference"
  | "skip_note"
  | "suggestion";

export interface AnnotationChipReply {
  id: string;
  participant: "agent" | "user";
  body: string;
}

const KIND_LABEL: Record<AnnotationChipKind, string> = {
  decision_note: "Decision",
  data_reference: "Data",
  skip_note: "Skipped",
  suggestion: "Suggestion",
};

const KIND_TONE: Record<AnnotationChipKind, "accent" | "success" | "neutral" | "warm"> = {
  decision_note: "accent",
  data_reference: "success",
  skip_note: "neutral",
  suggestion: "warm",
};

export interface AnnotationChipProps {
  kind: AnnotationChipKind;
  summary: string;
  body: string;
  pinned?: boolean;
  replies?: AnnotationChipReply[];
  maxWidth?: number;
  onDismiss?: () => void;
  onPin?: () => void;
  onReply?: (text: string) => void;
  className?: string;
}

/**
 * A reasoning annotation anchored to a field (spec §6): collapsed to a one-line
 * summary, expands to the full reasoning + reply thread. Dismissible, pinnable,
 * replyable. Tokens-only; uses @kinetiks/ui primitives for every control.
 */
export function AnnotationChip({
  kind,
  summary,
  body,
  pinned = false,
  replies = [],
  maxWidth = 280,
  onDismiss,
  onPin,
  onReply,
  className,
}: AnnotationChipProps) {
  const [expanded, setExpanded] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const submitReply = () => {
    const text = draft.trim();
    if (!text) return;
    onReply?.(text);
    setDraft("");
    setReplyOpen(false);
  };

  return (
    <div className={cn("kt-annotation-chip", className)} style={{ maxWidth }}>
      <div className="kt-annotation-chip__head">
        <Pill tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Pill>
        <Button
          variant="ghost"
          size="sm"
          className="kt-annotation-chip__summary"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {summary}
        </Button>
        <div className="kt-annotation-chip__actions">
          {onPin && (
            <Button variant="ghost" size="sm" onClick={onPin} aria-pressed={pinned}>
              {pinned ? "Pinned" : "Pin"}
            </Button>
          )}
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss annotation">
              ×
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="kt-annotation-chip__body">
          <p className="kt-annotation-chip__text">{body}</p>

          {replies.length > 0 && (
            <ul className="kt-annotation-chip__replies">
              {replies.map((reply) => (
                <li key={reply.id}>
                  <span className="kt-annotation-chip__reply-author">
                    {reply.participant === "agent" ? "Agent" : "You"}:
                  </span>{" "}
                  {reply.body}
                </li>
              ))}
            </ul>
          )}

          {onReply &&
            (replyOpen ? (
              <div className="kt-annotation-chip__reply-form">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply…"
                  rows={2}
                  aria-label="Reply to annotation"
                />
                <Button variant="ghost" size="sm" onClick={submitReply}>
                  Send
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setReplyOpen(true)}>
                Reply
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
