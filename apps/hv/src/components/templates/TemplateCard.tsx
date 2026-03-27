"use client";

import type { HvTemplate, TemplateCategory } from "@/types/templates";

interface TemplateCardProps {
  template: HvTemplate;
  onClick: () => void;
}

const CATEGORY_LABELS: Record<TemplateCategory, { label: string; color: string }> = {
  cold_outreach: { label: "Cold Outreach", color: "var(--harvest-green)" },
  follow_up: { label: "Follow-up", color: "var(--harvest-amber)" },
  breakup: { label: "Breakup", color: "var(--error, #d44040)" },
  re_engagement: { label: "Re-engage", color: "#6C5CE7" },
  meeting_request: { label: "Meeting", color: "#0984e3" },
  value_add: { label: "Value Add", color: "#00b894" },
  referral: { label: "Referral", color: "#e17055" },
  post_call: { label: "Post Call", color: "var(--harvest-soil)" },
  custom: { label: "Custom", color: "var(--text-secondary)" },
};

export default function TemplateCard({ template, onClick }: TemplateCardProps) {
  const cat = CATEGORY_LABELS[template.category] ?? CATEGORY_LABELS.custom;
  const mergeFieldCount = template.merge_fields?.length ?? 0;
  const subjectPreview = template.subject_template || "(no subject)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{
        padding: 20,
        borderRadius: 10,
        border: "1px solid var(--border-subtle)",
        backgroundColor: "var(--surface-elevated)",
        cursor: "pointer",
        transition: "border-color var(--duration-fast, 150ms) ease, box-shadow var(--duration-fast, 150ms) ease",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 160,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default, var(--border-subtle))";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-subtle)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Top row: category badge + AI badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          backgroundColor: `${cat.color}18`,
          color: cat.color,
        }}>
          {cat.label}
        </span>
        {template.is_ai_generated && (
          <span style={{
            display: "inline-block",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            backgroundColor: "rgba(108,92,231,0.10)",
            color: "#6C5CE7",
          }}>
            AI
          </span>
        )}
      </div>

      {/* Name */}
      <div style={{
        fontSize: 15,
        fontWeight: 600,
        color: "var(--text-primary)",
        lineHeight: 1.3,
      }}>
        {template.name}
      </div>

      {/* Subject preview */}
      <div style={{
        fontSize: 13,
        color: "var(--text-secondary)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {subjectPreview}
      </div>

      {/* Footer: merge fields + stats */}
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {mergeFieldCount > 0 && (
            <span style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              padding: "2px 6px",
              borderRadius: 4,
              backgroundColor: "var(--surface-raised, var(--surface-base))",
            }}>
              {mergeFieldCount} field{mergeFieldCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {template.performance.times_used > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {template.performance.times_used} use{template.performance.times_used !== 1 ? "s" : ""}
            </span>
          )}
          {template.performance.reply_rate !== null && template.performance.reply_rate !== undefined && (
            <span style={{ fontSize: 12, color: "var(--harvest-green)" }}>
              {(template.performance.reply_rate * 100).toFixed(0)}% reply
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
