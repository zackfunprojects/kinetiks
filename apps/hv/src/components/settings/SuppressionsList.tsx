"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvSuppression } from "@/types/settings";

export default function SuppressionsList() {
  const [suppressions, setSuppressions] = useState<HvSuppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formValue, setFormValue] = useState("");
  const [formType, setFormType] = useState("manual");
  const [formReason, setFormReason] = useState("");
  const [formField, setFormField] = useState<"email" | "domain" | "phone">("email");

  const fetchSuppressions = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hv/suppressions");
    const json = await res.json();
    setSuppressions(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSuppressions();
  }, [fetchSuppressions]);

  const handleAdd = async () => {
    if (!formValue.trim()) return;
    setSubmitting(true);

    const body: Record<string, string> = {
      type: formType,
    };
    body[formField] = formValue.trim();
    if (formReason.trim()) body.reason = formReason.trim();

    const res = await fetch("/api/hv/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setFormValue("");
      setFormReason("");
      await fetchSuppressions();
    }
    setSubmitting(false);
  };

  return (
    <div>
      {/* Add form */}
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
          marginBottom: 20,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
          Add Suppression
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Field</label>
            <select
              value={formField}
              onChange={(e) => setFormField(e.target.value as "email" | "domain" | "phone")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              <option value="email">Email</option>
              <option value="domain">Domain</option>
              <option value="phone">Phone</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Value</label>
            <input
              type="text"
              placeholder={formField === "email" ? "user@example.com" : formField === "domain" ? "example.com" : "+1234567890"}
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Type</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            >
              <option value="manual">Manual</option>
              <option value="bounce">Bounce</option>
              <option value="unsubscribe">Unsubscribe</option>
              <option value="complaint">Complaint</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Reason (optional)</label>
            <input
              type="text"
              placeholder="Reason..."
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={submitting || !formValue.trim()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              cursor: submitting || !formValue.trim() ? "default" : "pointer",
              backgroundColor: "var(--accent-primary)",
              color: "#0f0f0d",
              fontSize: 13,
              fontWeight: 600,
              opacity: submitting || !formValue.trim() ? 0.5 : 1,
            }}
          >
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : suppressions.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--text-secondary)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: 12,
          }}
        >
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>No suppressions</p>
          <p style={{ fontSize: 13, margin: 0 }}>Suppressed emails, domains, and phone numbers will appear here.</p>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {["Email / Domain / Phone", "Type", "Reason", "Added"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppressions.map((s) => (
              <tr key={s.id}>
                <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, borderBottom: "1px solid var(--border-subtle)" }}>
                  {s.email ?? s.domain ?? s.phone ?? "-"}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: "rgba(155,155,167,0.12)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s.type}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
                  {s.reason ?? "-"}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", fontSize: 13, borderBottom: "1px solid var(--border-subtle)" }}>
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
