"use client";

import { useState } from "react";
import type { HvTemplate, TemplateCategory, MergeField } from "@/types/templates";
import { STANDARD_MERGE_FIELDS } from "@/types/templates";

interface TemplateDetailProps {
  template: HvTemplate;
  onClose: () => void;
  onUpdated: () => void;
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

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  cold_outreach: "var(--harvest-green)",
  follow_up: "var(--harvest-amber)",
  breakup: "var(--error, #d44040)",
  re_engagement: "#6C5CE7",
  meeting_request: "#0984e3",
  value_add: "#00b894",
  referral: "#e17055",
  post_call: "var(--harvest-soil)",
  custom: "var(--text-secondary)",
};

export default function TemplateDetail({ template, onClose, onUpdated }: TemplateDetailProps) {
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState<TemplateCategory>(template.category);
  const [subjectTemplate, setSubjectTemplate] = useState(template.subject_template);
  const [bodyTemplate, setBodyTemplate] = useState(template.body_template);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

    const customPattern = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = customPattern.exec(combined)) !== null) {
      const key = match[1];
      if (!seen.has(key) && !key.startsWith("AI")) {
        found.push({ key, description: key, source: "custom", required: false });
        seen.add(key);
      }
    }

    return found;
  }

  function insertMergeField(field: MergeField) {
    setBodyTemplate((prev) => prev + `{{${field.key}}}`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hv/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
          merge_fields: extractMergeFields(),
        }),
      });
      if (!res.ok) throw new Error(`Failed to save template: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error saving template:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/hv/templates/${template.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete template: ${res.status}`);
      onUpdated();
    } catch (err) {
      console.error("Error deleting template:", err);
    } finally {
      setDeleting(false);
    }
  }

  const currentFields = extractMergeFields();
  const catColor = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.custom;
  const perf = template.performance;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 560, backgroundColor: "var(--surface-elevated)",
      borderLeft: "1px solid var(--border-subtle)", zIndex: 1000, overflowY: "auto", padding: 24,
      boxShadow: "var(--shadow-overlay)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: "100%", fontSize: 20, fontWeight: 700, color: "var(--text-primary)",
              backgroundColor: "transparent", border: "none", outline: "none", padding: 0,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              style={{
                padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600,
                border: `1px solid ${catColor}40`,
                backgroundColor: `${catColor}12`,
                color: catColor,
                outline: "none", cursor: "pointer",
              }}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {template.is_ai_generated && (
              <span style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                backgroundColor: "rgba(108,92,231,0.10)", color: "#6C5CE7",
              }}>
                AI Generated
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{
          border: "none", background: "none", color: "var(--text-secondary)", fontSize: 20, cursor: "pointer",
          padding: 4, lineHeight: 1,
        }}>
          x
        </button>
      </div>

      {/* Performance stats */}
      {(perf.times_used > 0 || perf.open_rate !== null || perf.reply_rate !== null) && (
        <div style={{
          display: "flex", gap: 16, marginBottom: 20, padding: 14, borderRadius: 8,
          backgroundColor: "var(--surface-base)", border: "1px solid var(--border-subtle)",
        }}>
          <StatItem label="Used" value={String(perf.times_used)} />
          {perf.open_rate !== null && perf.open_rate !== undefined && (
            <StatItem label="Open rate" value={`${(perf.open_rate * 100).toFixed(0)}%`} />
          )}
          {perf.reply_rate !== null && perf.reply_rate !== undefined && (
            <StatItem label="Reply rate" value={`${(perf.reply_rate * 100).toFixed(0)}%`} color="var(--harvest-green)" />
          )}
          {perf.positive_reply_rate !== null && perf.positive_reply_rate !== undefined && (
            <StatItem label="Positive" value={`${(perf.positive_reply_rate * 100).toFixed(0)}%`} color="#00b894" />
          )}
        </div>
      )}

      {/* Subject */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
          Subject line
        </label>
        <input
          type="text"
          value={subjectTemplate}
          onChange={(e) => setSubjectTemplate(e.target.value)}
          placeholder="Subject with {{merge_fields}}"
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Body */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
          Body template
        </label>
        <textarea
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          rows={12}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 14,
            border: "1px solid var(--border-subtle)", backgroundColor: "var(--surface-base)",
            color: "var(--text-primary)", outline: "none", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.5, fontFamily: "inherit",
          }}
        />

        {/* Merge field insertion buttons */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {STANDARD_MERGE_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => insertMergeField(field)}
              title={field.description}
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
      </div>

      {/* Active merge fields */}
      {currentFields.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
            Merge fields in this template ({currentFields.length})
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {currentFields.map((field) => {
              const sourceColors: Record<string, string> = {
                contact: "var(--harvest-green)",
                org: "#0984e3",
                research: "#6C5CE7",
                custom: "var(--harvest-soil)",
              };
              const color = sourceColors[field.source] ?? "var(--text-secondary)";
              return (
                <span
                  key={field.key}
                  title={`${field.description} (${field.source})`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 500,
                    backgroundColor: `${color}12`, color, border: `1px solid ${color}30`,
                  }}
                >
                  {`{{${field.key}}}`}
                  {field.required && (
                    <span style={{ color: "var(--error, #d44040)", fontSize: 10 }}>*</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: "flex", justifyContent: "space-between", paddingTop: 16,
        borderTop: "1px solid var(--border-subtle)",
      }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border-subtle)",
            backgroundColor: "transparent", color: "var(--error, #d44040)", fontSize: 13, cursor: "pointer",
            opacity: deleting ? 0.6 : 1,
          }}
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer",
            backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "var(--text-primary)", lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
