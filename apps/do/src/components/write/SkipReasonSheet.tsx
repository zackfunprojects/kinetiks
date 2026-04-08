"use client";

import type { SkipReason } from "@kinetiks/deskof";
import { SKIP_REASON_LABELS } from "@/lib/scout/v1";

interface Props {
  onSelect: (reason: SkipReason) => void | Promise<void>;
  onClose: () => void;
}

const SKIP_REASONS: SkipReason[] = [
  "already_well_answered",
  "not_my_expertise",
  "too_promotional",
  "bad_timing",
  "other",
];

/**
 * Skip-reason bottom sheet. Shown after the user swipes left or taps
 * Skip on the card stack. The reason feeds the discovery learning
 * loop (Phase 8 self-improvement) — required because the alternative
 * is the user silently rejecting the model's suggestions.
 */
export function SkipReasonSheet({ onSelect, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Why are you skipping this?"
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: "rgba(15, 17, 23, 0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl p-5"
        style={{
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="mb-4 text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Why are you skipping this?
        </h3>
        <div className="flex flex-col gap-2">
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => void onSelect(reason)}
              className="rounded-xl border px-4 py-3 text-left text-sm"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-primary)",
                background: "var(--surface)",
              }}
            >
              {SKIP_REASON_LABELS[reason]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full px-4 py-2 text-sm"
          style={{
            color: "var(--text-tertiary)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
