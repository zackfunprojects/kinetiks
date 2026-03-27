"use client";

import { useState } from "react";
import type { InboxEmail, ReplyClassification } from "@/types/inbox";

interface InboxDetailProps {
  email: InboxEmail;
  onClose: () => void;
  onUpdated: () => void;
}

const CLASSIFICATION_OPTIONS: { value: ReplyClassification; label: string; color: string }[] = [
  { value: "interested", label: "Interested", color: "var(--harvest-green)" },
  { value: "not_interested", label: "Not Interested", color: "var(--error, #d44040)" },
  { value: "ooo", label: "OOO", color: "var(--harvest-amber)" },
  { value: "referral", label: "Referral", color: "var(--harvest-soil)" },
  { value: "bounce", label: "Bounce", color: "var(--text-secondary)" },
];

export default function InboxDetail({ email, onClose, onUpdated }: InboxDetailProps) {
  const [classification, setClassification] = useState<ReplyClassification | null>(
    email.reply_classification
  );
  const [saving, setSaving] = useState(false);

  async function handleClassify(value: ReplyClassification) {
    setClassification(value);
    setSaving(true);
    try {
      const res = await fetch(`/api/hv/inbox/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_classification: value }),
      });
      if (!res.ok) throw new Error(`Failed to classify email: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error classifying email:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 560, backgroundColor: "var(--surface-elevated)",
      borderLeft: "1px solid var(--border-subtle)", zIndex: 1000, overflowY: "auto", padding: 24,
      boxShadow: "var(--shadow-overlay)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {email.subject}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            {email.contact_name ?? "Unknown contact"}
            {email.replied_at && (
              <span> - replied {new Date(email.replied_at).toLocaleDateString()}</span>
            )}
          </p>
        </div>
        <button onClick={onClose} style={{
          border: "none", background: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer",
        }}>x</button>
      </div>

      {/* Classification buttons */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Classify reply
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CLASSIFICATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleClassify(opt.value)}
              disabled={saving}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: classification === opt.value
                  ? `1px solid ${opt.color}`
                  : "1px solid var(--border-subtle)",
                backgroundColor: classification === opt.value
                  ? `${opt.color}20`
                  : "transparent",
                color: classification === opt.value ? opt.color : "var(--text-secondary)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Original email */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Original email
        </h3>
        <div style={{
          padding: 16, borderRadius: 8, border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-base)", fontSize: 14, lineHeight: 1.6,
          color: "var(--text-secondary)", whiteSpace: "pre-wrap",
        }}>
          {email.body || "No content"}
        </div>
      </div>

      {/* Reply */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Reply
        </h3>
        <div style={{
          padding: 16, borderRadius: 8, border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-base)", fontSize: 14, lineHeight: 1.6,
          color: "var(--text-primary)", whiteSpace: "pre-wrap",
        }}>
          {email.reply_body || "No reply content"}
        </div>
      </div>

      {/* Sentiment */}
      {email.reply_sentiment && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
            Sentiment
          </h3>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {email.reply_sentiment}
          </p>
        </div>
      )}
    </div>
  );
}
