"use client";

import { useState } from "react";
import { Badge, Button, Dialog, DialogBody, DialogFooter, DialogHeader } from "@kinetiks/ui";

/**
 * Auto-approved work the user didn't watch (spec §9.2, "Auto-approved"). At or
 * above the auto-approve threshold the system works in the background — no panel
 * opens. A sidebar notice reports what happened; "Review" opens a retrospective
 * of exactly what the system did. Fixture data for the reference surface.
 */
const AUTO_APPROVED = [
  { to: "Jane D.", company: "Northwind", subject: "Re: pricing tiers", at: "9:02am" },
  { to: "Omar R.", company: "Lumen", subject: "Following up on your demo", at: "9:04am" },
  { to: "Priya S.", company: "Vela", subject: "Quick question on rollout", at: "9:07am" },
];

interface RetrospectiveSurfaceProps {
  systemName: string | null;
  enabled: boolean;
}

export function RetrospectiveSurface({ systemName, enabled }: RetrospectiveSurfaceProps) {
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const name = systemName ?? "Kinetiks";

  if (!enabled || dismissed) return null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          right: "var(--kt-s-3)",
          top: "56px",
          zIndex: 21,
          width: "min(300px, calc(100% - var(--kt-s-6)))",
        }}
      >
        <div className="kt-floating-bar" role="status">
          <span className="kt-floating-bar__body" style={{ fontSize: "var(--kt-fs-12)", color: "var(--kt-fg-2)" }}>
            {name} auto-approved and sent {AUTO_APPROVED.length} follow-up emails.{" "}
            <Badge label="fixture" variant="warning" />
          </span>
          <span className="kt-floating-bar__actions">
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Review
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
              ×
            </Button>
          </span>
        </div>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Auto-approved work retrospective">
        <DialogHeader>
          <div style={{ fontSize: "var(--kt-fs-15)", fontWeight: "var(--kt-fw-med)", color: "var(--kt-fg-1)" }}>
            What {name} did
          </div>
          <div style={{ fontSize: "var(--kt-fs-12)", color: "var(--kt-fg-3)", marginTop: "2px" }}>
            High confidence — sent automatically, shown here after the fact.
          </div>
        </DialogHeader>
        <DialogBody>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
            {AUTO_APPROVED.map((m) => (
              <li
                key={`${m.to}-${m.subject}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--kt-s-3)",
                  paddingBottom: "var(--kt-s-3)",
                  borderBottom: "1px solid var(--kt-border-1)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-1)", fontWeight: "var(--kt-fw-med)" }}>
                    {m.subject}
                  </div>
                  <div style={{ fontSize: "var(--kt-fs-12)", color: "var(--kt-fg-3)" }}>
                    To {m.to} · {m.company}
                  </div>
                </div>
                <span style={{ fontSize: "var(--kt-fs-11)", color: "var(--kt-fg-4)", fontFamily: "var(--kt-font-mono)", flexShrink: 0 }}>
                  {m.at}
                </span>
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
