"use client";

import type { HvContact } from "@/types/contacts";
import { getScoreColor, getScoreBg } from "@/types/contacts";

interface ProspectCardProps {
  contact: HvContact;
}

export default function ProspectCard({ contact }: ProspectCardProps) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";
  const orgName = contact.organization?.name ?? null;
  const scoreColor = getScoreColor(contact.lead_score);
  const scoreBg = getScoreBg(contact.lead_score);

  return (
    <div
      style={{
        padding: "var(--space-4, 16px)",
        borderRadius: "var(--radius-md, 8px)",
        border: "1px solid var(--border-subtle)",
        backgroundColor: "var(--surface-elevated, #FFFFFF)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4, 16px)",
        transition: "box-shadow var(--duration-fast, 150ms) var(--ease-smooth), background-color var(--duration-fast, 150ms) var(--ease-smooth)",
        cursor: "pointer",
      }}
    >
      {/* Score badge */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-md, 8px)",
          backgroundColor: scoreBg,
          color: scoreColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "var(--font-mono, monospace), monospace",
          flexShrink: 0,
        }}
      >
        {contact.lead_score}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </p>
        {contact.title && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {contact.title}
          </p>
        )}
        {orgName && (
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
            {orgName}
          </p>
        )}
      </div>

      {/* Right side: email + date */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {contact.email && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
            {contact.email}
          </p>
        )}
        {contact.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
            {contact.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm, 4px)",
                  backgroundColor: "rgba(61,124,71,0.1)",
                  color: "var(--harvest-green, #3D7C47)",
                  fontWeight: 500,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          {new Date(contact.updated_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
