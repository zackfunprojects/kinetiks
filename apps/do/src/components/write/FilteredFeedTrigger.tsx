"use client";

/**
 * FilteredFeedTrigger — the small "Filtered: N today" button in the
 * Write tab header that opens the FilteredFeedSheet.
 *
 * Renders nothing when N is 0 to avoid noise. The initial count is
 * passed in from the server component so the badge appears
 * immediately on first paint without a client fetch.
 */
import { useState } from "react";
import { FilteredFeedSheet } from "./FilteredFeedSheet";

export function FilteredFeedTrigger({ initialCount }: { initialCount: number }) {
  const [open, setOpen] = useState(false);
  if (initialCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          background: "var(--surface-raised)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-subtle)",
        }}
        aria-label={`${initialCount} threads filtered today`}
      >
        Filtered · {initialCount}
      </button>
      <FilteredFeedSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
