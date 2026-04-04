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
          background: "rgba(0, 0, 0, 0.5)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-modal-title"
        style={{
          position: "relative",
          width: 400,
          background: "var(--bg-surface)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
          padding: 24,
        }}
      >
        <h3 id="reject-modal-title" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
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
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            fontSize: 13,
            outline: "none",
            resize: "none",
            boxSizing: "border-box",
            backgroundColor: "var(--bg-inset)",
            color: "var(--text-primary)",
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
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-secondary)",
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
              background: reason.trim() ? "var(--error)" : "var(--border-default)",
              color: reason.trim() ? "#fff" : "var(--text-tertiary)",
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
