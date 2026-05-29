"use client";

import { useState } from "react";
import { Button, Textarea } from "@kinetiks/ui";

interface RejectModalProps {
  onReject: (reason: string) => void;
  onCancel: () => void;
}

export function RejectModal({ onReject, onCancel }: RejectModalProps) {
  const [reason, setReason] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onCancel} style={{ position: "absolute", inset: 0, background: "var(--kt-backdrop)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-modal-title"
        style={{
          position: "relative",
          width: 420,
          maxWidth: "calc(100vw - var(--kt-s-6))",
          background: "var(--kt-bg-elevated)",
          borderRadius: "var(--kt-radius-3)",
          border: "1px solid var(--kt-border-1)",
          boxShadow: "var(--kt-shadow-lg)",
          padding: "var(--kt-s-5)",
        }}
      >
        <h3 id="reject-modal-title" className="kt-section-title" style={{ margin: "0 0 var(--kt-s-1)" }}>Reject with reason</h3>
        <p className="kt-small" style={{ margin: "0 0 var(--kt-s-3)" }}>
          Your reason calibrates future decisions in this category.
        </p>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you rejecting this? (e.g. too aggressive, wrong audience)"
          autoFocus
          rows={3}
          style={{ marginBottom: "var(--kt-s-4)" }}
        />
        <div style={{ display: "flex", gap: "var(--kt-s-2)", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim()} onClick={() => reason.trim() && onReject(reason.trim())}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
