"use client";

import { useState } from "react";
import { Button, Textarea } from "@kinetiks/ui";
import type { KillReasonCode } from "@kinetiks/types";

/** The §8.3 "What went wrong?" quick-select reasons. */
const REASONS: ReadonlyArray<{ code: KillReasonCode; label: string }> = [
  { code: "wrong_tone", label: "Wrong tone" },
  { code: "wrong_data", label: "Wrong data" },
  { code: "wrong_approach", label: "Wrong approach" },
  { code: "wrong_target", label: "Wrong target" },
  { code: "other", label: "Other" },
];

export interface KillPromptProps {
  onConfirm: (reasonCode: KillReasonCode, feedback: string) => void;
  onCancel: () => void;
  pending?: boolean;
  /** User-safe error shown when the kill failed. */
  error?: string | null;
}

/**
 * The Kill Task feedback prompt (spec §8.3). Appears in the expanded task drawer
 * when the user hits Kill Task: a "What went wrong?" question with quick-select
 * reasons and a free-text field. The answer becomes the high-weight kill signal.
 */
export function KillPrompt({ onConfirm, onCancel, pending = false, error = null }: KillPromptProps) {
  const [reason, setReason] = useState<KillReasonCode | null>(null);
  const [feedback, setFeedback] = useState("");

  return (
    <div role="group" aria-label="Kill task feedback">
      <div
        style={{
          fontSize: "var(--kt-fs-13)",
          fontWeight: "var(--kt-fw-med)",
          color: "var(--kt-fg-1)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        What went wrong?
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--kt-s-2)",
          marginBottom: "var(--kt-s-3)",
        }}
      >
        {REASONS.map((r) => (
          <Button
            key={r.code}
            variant={reason === r.code ? "accent" : "secondary"}
            size="sm"
            aria-pressed={reason === r.code}
            onClick={() => setReason(r.code)}
          >
            {r.label}
          </Button>
        ))}
      </div>
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Add detail (optional) — the more specific, the better I'll do next time."
        aria-label="What went wrong, in your words"
        rows={2}
      />
      {error ? (
        <div
          role="alert"
          style={{ marginTop: "var(--kt-s-2)", fontSize: "var(--kt-fs-12)", color: "var(--kt-danger)" }}
        >
          {error}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--kt-s-2)",
          marginTop: "var(--kt-s-3)",
        }}
      >
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={!reason || pending}
          onClick={() => reason && onConfirm(reason, feedback.trim())}
        >
          {pending ? "Stopping…" : "Stop task"}
        </Button>
      </div>
    </div>
  );
}
