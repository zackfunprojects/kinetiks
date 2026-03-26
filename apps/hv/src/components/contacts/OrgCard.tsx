"use client";

import { ScoreBadge } from "./ScoreBadge";
import type { HvOrganization } from "@/types/contacts";

interface OrgCardProps {
  org: HvOrganization;
}

export function OrgCard({ org }: OrgCardProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        padding: "16px",
      }}
    >
      <h4
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Company
      </h4>

      <div style={{ marginBottom: "8px" }}>
        <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
          {org.name}
        </span>
        {org.domain && (
          <a
            href={`https://${org.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--accent-primary)",
              fontFamily: "var(--font-mono, monospace), monospace",
              marginTop: "2px",
              textDecoration: "none",
            }}
          >
            {org.domain}
          </a>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        {org.industry && <div>Industry: {org.industry}</div>}
        {org.employee_count_range && <div>Size: {org.employee_count_range}</div>}
        {org.funding_stage && <div>Funding: {org.funding_stage}</div>}
        {(org.headquarters_city || org.headquarters_country) && (
          <div>HQ: {[org.headquarters_city, org.headquarters_state, org.headquarters_country].filter(Boolean).join(", ")}</div>
        )}
      </div>

      {org.health_score > 0 && (
        <div style={{ marginTop: "10px" }}>
          <ScoreBadge score={org.health_score} label="HEALTH" size="sm" />
        </div>
      )}

      {org.tech_stack && org.tech_stack.length > 0 && (
        <div style={{ marginTop: "10px" }}>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "4px" }}>Tech stack</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {org.tech_stack.slice(0, 8).map((tech) => (
              <span
                key={tech}
                style={{
                  padding: "2px 6px",
                  borderRadius: "3px",
                  backgroundColor: "var(--surface-elevated, rgba(255,255,255,0.04))",
                  fontSize: "0.6875rem",
                  color: "var(--text-secondary)",
                }}
              >
                {tech}
              </span>
            ))}
            {org.tech_stack.length > 8 && (
              <span style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                +{org.tech_stack.length - 8}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
