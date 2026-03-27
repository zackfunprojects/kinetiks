"use client";

import { useState } from "react";
import type { TemplateCategory, MergeField } from "@/types/templates";
import { STANDARD_MERGE_FIELDS } from "@/types/templates";

interface CreateTemplateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORY_OPTIONS: { value: TemplateCategory; label: string }[] = [
  { value: "cold_outreach", label: "Cold Outreach" },
  { value: "follow_up", label: "Follow-up" },
  { value: "breakup", label: "Breakup" },
  { value: "re_engagement", label: "Re-engagement" },
  { value: "meeting_request", label: "Meeting Request" },
  { value: "value_add", label: "Value Add" },
  { value: "referral", label: "Referral" },
  { value: "post_call", label: "Post Call" },
  { value: "custom", label: "Custom" },
];

export default function CreateTemplateModal({ onClose, onCreated }: CreateTemplateModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("cold_outreach");
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function insertMergeField(field: MergeField, target: "subject" | "body") {
    const tag = `{{${field.key}}}`;
    if (target === "subject") {
      setSubjectTemplate((prev) => prev + tag);
    } else {
      setBodyTemplate((prev) => prev + tag);
    }
  }

  function extractMergeFields(): MergeField[] {
    const combined = subjectTemplate + " " + bodyTemplate;
    const found: MergeField[] = [];
    const seen = new Set<string>();

    for (const field of STANDARD_MERGE_FIELDS) {
      if (combined.includes(`{{${field.key}}}`) && !seen.has(field.key)) {
        found.push(field);
        seen.add(field.key);
      }
    }

    // Detect custom merge fields like {{custom_field}}
    const customPattern = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = customPattern.exec(combined)) !== null) {
      const key = match[1];
      if (!seen.has(key)) {
        found.push({ key, description: key, source: "custom", required: false });
        seen.add(key);
      }
    }

    return found;
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/hv/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
          merge_fields: extractMergeFields(),
          is_ai_generated: false,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to create template");
        return;
      }

      onCreated();
    } catch (err) {
      console.error("Error creating template:", err);
      setError("Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-template-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-elevated)", borderRadius: 12,
          padding: 24, width: 540, maxHeight: "85vh", overflowY: "auto",
          boxShadow: "var(--shadow-overlay)",
        }}
      >
        <h2
          id="create-template-title"
          style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 20px" }}
        >
          New Template
        </h2>

        {/* Name */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>
          Template name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Warm intro - SaaS CMOs"
          autoFocus
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        {/* Category */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, marginTop: 16 }}>
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TemplateCategory)}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Subject */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, marginTop: 16 }}>
          Subject line
        </label>
        <input
          type="text"
          value={subjectTemplate}
          onChange={(e) => setSubjectTemplate(e.target.value)}
          placeholder='e.g. Quick thought on {{company}}&apos;s growth'
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />

        {/* Merge field buttons for subject */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {STANDARD_MERGE_FIELDS.slice(0, 5).map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => insertMergeField(field, "subject")}
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11,
                border: "1px solid var(--border-subtle)", backgroundColor: "transparent",
                color: "var(--text-tertiary)", cursor: "pointer",
              }}
            >
              {`{{${field.key}}}`}
            </button>
          ))}
        </div>

        {/* Body */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, marginTop: 16 }}>
          Body
        </label>
        <textarea
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          placeholder="Write your email body here. Use merge fields and AI instruction blocks..."
          rows={8}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.5, fontFamily: "inherit",
          }}
        />

        {/* Merge field buttons for body */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {STANDARD_MERGE_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => insertMergeField(field, "body")}
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 11,
                border: "1px solid var(--border-subtle)", backgroundColor: "transparent",
                color: "var(--text-tertiary)", cursor: "pointer",
              }}
            >
              {`{{${field.key}}}`}
            </button>
          ))}
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "var(--error, #d44040)", margin: "12px 0 0" }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: "transparent", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
              backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Creating..." : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
