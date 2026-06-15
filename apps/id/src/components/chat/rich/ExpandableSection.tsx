"use client";

import { useState } from "react";

export interface ExpandableSectionProps {
  summary: string;
  detail: string;
}

/**
 * Collapses detailed data that would clutter the conversation
 * (spec-addendum-chat-ux §B.5 "Expandable sections"): "Here's the summary.
 * [Expand for full details]".
 */
export function ExpandableSection({ summary, detail }: ExpandableSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: "var(--kt-s-3)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontSize: "var(--kt-fs-13)",
          color: "var(--kt-fg-1)",
          textAlign: "left",
        }}
      >
        {summary}{" "}
        <span style={{ color: "var(--kt-accent)", fontSize: "var(--kt-fs-12)" }}>
          {open ? "Show less" : "Expand"}
        </span>
      </button>
      {open && (
        <p
          style={{
            margin: "var(--kt-s-2) 0 0",
            fontSize: "var(--kt-fs-13)",
            lineHeight: "var(--kt-lh-body)",
            color: "var(--kt-fg-2)",
            whiteSpace: "pre-wrap",
          }}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
