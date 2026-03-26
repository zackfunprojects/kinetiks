"use client";

import { useState, useEffect } from "react";
import { ScoreBadge } from "./ScoreBadge";
import { VerificationBadge } from "./VerificationBadge";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { ActivityTimeline } from "./ActivityTimeline";
import { OrgCard } from "./OrgCard";
import { TagManager } from "./TagManager";
import type { HvContact, HvActivity, HvOrganization } from "@/types/contacts";

interface ContactDetailProps {
  contactId: string;
}

type TabId = "overview" | "activity" | "notes" | "enrichment";

export function ContactDetail({ contactId }: ContactDetailProps) {
  const [contact, setContact] = useState<HvContact | null>(null);
  const [activities, setActivities] = useState<HvActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    fetch(`/api/hv/contacts/${contactId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setContact(res.data);
          setActivities(res.data.activities ?? []);
          setNotes(res.data.notes ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/hv/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (data.success) {
        setContact((prev) => prev ? { ...prev, notes } : prev);
      }
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)" }}>
        Loading contact...
      </div>
    );
  }

  if (!contact) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-tertiary)" }}>
        Contact not found.
      </div>
    );
  }

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";
  const initials = [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const org = contact.organization as HvOrganization | null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity" },
    { id: "notes", label: "Notes" },
    { id: "enrichment", label: "Enrichment" },
  ];

  return (
    <div style={{ display: "flex", gap: "24px" }}>
      {/* Left column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "12px",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              {name}
            </h1>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
              {[contact.title, org?.name].filter(Boolean).join(" at ")}
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
            <ScoreBadge score={contact.lead_score} label="LEAD" size="md" />
            <VerificationBadge grade={contact.verification_grade} />
            {contact.email && (
              <a
                href={`/compose?contact_id=${contact.id}`}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--accent-primary)",
                  color: "#fff",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  marginLeft: "6px",
                }}
              >
                Compose Email
              </a>
            )}
          </div>
        </div>

        {/* Contact info bar */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            padding: "12px 16px",
            borderRadius: "8px",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border-subtle)",
            marginBottom: "20px",
            fontSize: "0.8125rem",
            flexWrap: "wrap",
          }}
        >
          {contact.email && (
            <span style={{ fontFamily: "var(--font-mono, monospace), monospace", color: "var(--text-secondary)" }}>
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span style={{ color: "var(--text-secondary)" }}>{contact.phone}</span>
          )}
          {contact.linkedin_url && (
            <a
              href={contact.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-primary)", textDecoration: "none" }}
            >
              LinkedIn
            </a>
          )}
          {contact.seniority && (
            <span style={{ color: "var(--text-tertiary)" }}>{contact.seniority}</span>
          )}
          {contact.location_city && (
            <span style={{ color: "var(--text-tertiary)" }}>
              {[contact.location_city, contact.location_country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0",
            borderBottom: "1px solid var(--border-subtle)",
            marginBottom: "20px",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 16px",
                fontSize: "0.8125rem",
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-tertiary)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                cursor: "pointer",
                marginBottom: "-1px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              fontSize: "0.8125rem",
            }}
          >
            {[
              ["First name", contact.first_name],
              ["Last name", contact.last_name],
              ["Email", contact.email],
              ["Phone", contact.phone],
              ["Title", contact.title],
              ["Department", contact.department],
              ["Seniority", contact.seniority],
              ["Source", contact.source],
              ["Location", [contact.location_city, contact.location_state, contact.location_country].filter(Boolean).join(", ") || null],
              ["Timezone", contact.timezone],
              ["EU resident", contact.is_eu ? "Yes" : null],
              ["Suppressed", contact.suppressed ? `Yes - ${contact.suppression_reason}` : null],
            ].map(([label, value]) => value ? (
              <div key={label as string}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "2px" }}>{label}</div>
                <div style={{ color: "var(--text-primary)" }}>{value}</div>
              </div>
            ) : null)}
          </div>
        )}

        {activeTab === "activity" && <ActivityTimeline activities={activities} />}

        {activeTab === "notes" && (
          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: "100%",
                minHeight: 120,
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--surface-base)",
                color: "var(--text-primary)",
                fontSize: "0.8125rem",
                resize: "vertical",
                outline: "none",
                lineHeight: 1.6,
              }}
            />
            <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={saveNotes}
                disabled={savingNotes || notes === (contact.notes ?? "")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--accent-primary)",
                  color: "#fff",
                  fontSize: "0.8125rem",
                  cursor: savingNotes ? "wait" : "pointer",
                  opacity: savingNotes || notes === (contact.notes ?? "") ? 0.5 : 1,
                }}
              >
                {savingNotes ? "Saving..." : "Save notes"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "enrichment" && (
          <pre
            style={{
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono, monospace), monospace",
              color: "var(--text-secondary)",
              overflow: "auto",
              maxHeight: 400,
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify(contact.enrichment_data, null, 2)}
          </pre>
        )}
      </div>

      {/* Right column */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
        <ScoreBreakdown
          leadScore={contact.lead_score}
          fitScore={contact.fit_score}
          intentScore={contact.intent_score}
          engagementScore={contact.engagement_score}
        />

        {org && <OrgCard org={org} />}

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
              marginBottom: "10px",
            }}
          >
            Tags
          </h4>
          <TagManager
            contactId={contact.id}
            tags={contact.tags ?? []}
            onTagsChange={(newTags) => setContact((prev) => prev ? { ...prev, tags: newTags } : prev)}
          />
        </div>
      </div>
    </div>
  );
}
