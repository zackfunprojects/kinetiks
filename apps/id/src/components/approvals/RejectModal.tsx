"use client";

import { useState } from "react";

interface RejectModalProps {
  onReject: (reason: string) => void;
  onCancel: () => void;
}

export function RejectModal({ onReject, onCancel }: RejectModalProps) {
  const [reason, setReason] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onCancel}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--kt-backdrop)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-modal-title"
        style={{
          position: "relative",
          width: 400,
          background: "var(--kt-bg-subtle)",
          borderRadius: 12,
          border: "1px solid var(--kt-border-1)",
          padding: 24,
        }}
      >
        <h3 id="reject-modal-title" style={{ fontSize: 16, fontWeight: 600, color: "var(--kt-fg-1)", margin: "0 0 12px" }}>
          Reject with reason
        </h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you rejecting this?"
          autoFocus
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--kt-border-1)",
            borderRadius: 8,
            fontSize: 13,
            outline: "none",
            resize: "none",
            boxSizing: "border-box",
            backgroundColor: "var(--kt-bg-base)",
            color: "var(--kt-fg-1)",
            fontFamily: "inherit",
            marginBottom: 16,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid var(--kt-border-1)",
              background: "transparent",
              color: "var(--kt-fg-2)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onReject(reason.trim())}
            disabled={!reason.trim()}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: reason.trim() ? "var(--kt-danger)" : "var(--kt-border-1)",
              color: reason.trim() ? "var(--kt-fg-on-inverse)" : "var(--kt-fg-3)",
              fontSize: 13,
              cursor: reason.trim() ? "pointer" : "not-allowed",
              fontWeight: 500,
            }}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
