"use client";

import { useState } from "react";
import { ApprovalOverlayBar, Button, Input, Textarea } from "@kinetiks/ui";
import { captureException } from "@/lib/observability/sentry";
import { bottomCenterAnchor } from "./floating-anchor";

/** The action the system is presenting for approval (§9.1) — an email draft. */
const ORIGINAL = {
  subject: "Following up on your pricing question",
  body: "Hi there — circling back on the pricing tiers we discussed. Based on your team size, the Growth plan is the closest fit. Happy to walk through it this week.",
};

interface Resolved {
  kind: "approved" | "rejected";
  note: string;
}

interface ApprovalSurfaceProps {
  systemName: string | null;
  accountId: string;
  /** The system handed work off for review (set by TaskDrawerSurface). */
  armed: boolean;
  enabled: boolean;
  onResolved: () => void;
}

/**
 * The in-panel visual approval (spec §9.1). When the system finishes work it
 * presents the result here: the draft email in context, with an Approve / Edit /
 * Reject bar. Editing in place feeds the edit analyzer; a reject reason is a
 * learning signal. There is no kinetiks_approvals row behind the reference
 * surface — the decision is recorded directly via /api/id/embed/approval.
 */
export function ApprovalSurface({
  systemName,
  accountId,
  armed,
  enabled,
  onResolved,
}: ApprovalSurfaceProps) {
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [subject, setSubject] = useState(ORIGINAL.subject);
  const [body, setBody] = useState(ORIGINAL.body);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);

  const submit = async (payload: Record<string, unknown>): Promise<boolean> => {
    setPending(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/id/embed/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`approval route returned ${res.status}`);
      return true;
    } catch (err) {
      void captureException(err, {
        tags: { route: "/embed", action: "approval.decide", stage: "persist", app: "id" },
        user: { id: accountId },
      });
      setErrorMessage("We couldn't save that decision. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  };

  const handleApprove = async () => {
    const name = systemName ?? "Your system";
    if (editing) {
      const ok = await submit({
        decision: "approve_with_edits",
        original: ORIGINAL,
        edited: { subject, body },
      });
      if (ok) setResolved({ kind: "approved", note: `${name} sent it with your edits — I'll learn from them.` });
    } else {
      const ok = await submit({ decision: "approve" });
      if (ok) setResolved({ kind: "approved", note: `${name} sent the email.` });
    }
  };

  const handleReject = async () => {
    const ok = await submit({ decision: "reject", reason: reason.trim() });
    if (ok) setResolved({ kind: "rejected", note: "Rejected — I'll factor that in next time." });
  };

  if (!enabled) return null;

  if (resolved) {
    return (
      <div style={bottomCenterAnchor}>
        <div
          className={`kt-floating-bar ${resolved.kind === "approved" ? "kt-floating-bar--success" : ""}`}
          role="status"
        >
          <span className="kt-floating-bar__body" style={{ fontSize: "var(--kt-fs-13)" }}>
            {resolved.note}
          </span>
          <span className="kt-floating-bar__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResolved(null);
                onResolved();
              }}
              aria-label="Dismiss"
            >
              ×
            </Button>
          </span>
        </div>
      </div>
    );
  }

  if (!armed) return null;

  return (
    <div style={bottomCenterAnchor}>
      <div
        style={{
          backgroundColor: "var(--kt-bg-elevated)",
          border: "1px solid var(--kt-border-1)",
          borderRadius: "var(--kt-radius-2)",
          boxShadow: "var(--kt-shadow-sm)",
          padding: "var(--kt-s-4)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        <div
          style={{
            fontSize: "var(--kt-fs-11)",
            color: "var(--kt-fg-3)",
            fontFamily: "var(--kt-font-mono)",
            marginBottom: "var(--kt-s-2)",
          }}
        >
          {systemName ?? "Kinetiks"} drafted this — review before it sends
        </div>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-2)" }}>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Email subject" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Email body" rows={4} />
          </div>
        ) : (
          <>
            <div style={{ fontSize: "var(--kt-fs-14)", fontWeight: "var(--kt-fw-med)", color: "var(--kt-fg-1)" }}>
              {subject}
            </div>
            <p style={{ margin: "var(--kt-s-2) 0 0", fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-2)", lineHeight: "var(--kt-lh-body)" }}>
              {body}
            </p>
          </>
        )}

        {rejecting ? (
          <div style={{ marginTop: "var(--kt-s-3)" }}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this wrong? (the system learns from your reason)"
              aria-label="Rejection reason"
              rows={2}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--kt-s-2)", marginTop: "var(--kt-s-2)" }}>
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" disabled={!reason.trim() || pending} onClick={() => void handleReject()}>
                {pending ? "Rejecting…" : "Reject"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          style={{ marginBottom: "var(--kt-s-2)", fontSize: "var(--kt-fs-12)", color: "var(--kt-danger)" }}
        >
          {errorMessage}
        </div>
      ) : null}

      {!rejecting ? (
        <ApprovalOverlayBar
          summary="Follow-up email to a fintech CFO"
          editing={editing}
          pending={pending}
          onApprove={() => void handleApprove()}
          onEdit={() => setEditing((v) => !v)}
          onReject={() => setRejecting(true)}
          fixture
        />
      ) : null}
    </div>
  );
}
