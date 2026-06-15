"use client";

import { Button, Card } from "@kinetiks/ui";
import type { AppPanelOpen } from "@kinetiks/types";

export interface ActionCardProps {
  title: string;
  summary?: string;
  steps?: string[];
  panel?: AppPanelOpen;
  approvalId?: string;
  /** The "Open" affordance: mount the collaborative app panel (spec §4.2). */
  onOpen?: (panel: AppPanelOpen) => void;
}

/**
 * Presents a work result inline in Chat with an "Open" affordance that mounts
 * the app panel (spec-addendum-chat-ux §B.5 "Action cards"). Dark-filled
 * primary button per design spec §16.5.
 */
export function ActionCard({ title, summary, steps, panel, onOpen }: ActionCardProps) {
  return (
    <Card style={{ marginTop: "var(--kt-s-3)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--kt-s-3)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--kt-font-serif)",
            fontSize: "var(--kt-fs-15)",
            color: "var(--kt-fg-1)",
          }}
        >
          {title}
        </span>
        {panel && onOpen && (
          <Button variant="primary" size="sm" onClick={() => onOpen(panel)}>
            Open
          </Button>
        )}
      </div>

      {summary && (
        <p
          style={{
            margin: "var(--kt-s-2) 0 0",
            fontSize: "var(--kt-fs-14)",
            lineHeight: "var(--kt-lh-body)",
            color: "var(--kt-fg-2)",
          }}
        >
          {summary}
        </p>
      )}

      {steps && steps.length > 0 && (
        <ol
          style={{
            margin: "var(--kt-s-3) 0 0",
            paddingLeft: "var(--kt-s-4)",
            fontSize: "var(--kt-fs-13)",
            color: "var(--kt-fg-2)",
          }}
        >
          {steps.map((step, i) => (
            <li key={i} style={{ marginBottom: "var(--kt-s-1)" }}>
              {step}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
