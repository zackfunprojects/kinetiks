"use client";

import { useState } from "react";

interface AddContactModalProps {
  onCreated: () => void;
  onClose: () => void;
}

export function AddContactModal({ onCreated, onClose }: AddContactModalProps) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    linkedin_url: "",
    title: "",
    seniority: "",
    department: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.first_name && !form.last_name && !form.email) {
      setError("At least a name or email is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/hv/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to create contact");
        return;
      }
      onCreated();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-default)",
    backgroundColor: "var(--surface-base)",
    color: "var(--text-primary)",
    fontSize: "0.8125rem",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "24px",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "20px",
          }}
        >
          Add contact
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>First name</label>
            <input style={inputStyle} value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Last name</label>
            <input style={inputStyle} value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Email</label>
            <input style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace), monospace" }} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>LinkedIn URL</label>
            <input style={inputStyle} value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Seniority</label>
            <select
              style={inputStyle}
              value={form.seniority}
              onChange={(e) => update("seniority", e.target.value)}
            >
              <option value="">Select...</option>
              <option value="cxo">C-Suite</option>
              <option value="vp">VP</option>
              <option value="director">Director</option>
              <option value="manager">Manager</option>
              <option value="senior">Senior</option>
              <option value="entry">Entry</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Department</label>
            <input style={inputStyle} value={form.department} onChange={(e) => update("department", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: "var(--error, #d44040)", fontSize: "0.8125rem", marginTop: "12px" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--border-default)",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "var(--accent-primary)",
              color: "#fff",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Creating..." : "Create contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
