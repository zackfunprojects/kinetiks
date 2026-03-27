"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import ProspectsView from "@/components/prospects/ProspectsView";

function GreenhouseContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "seedbed";

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{
          fontSize: 22, fontWeight: 600, color: "var(--text-primary)",
          margin: 0, letterSpacing: "-0.02em",
        }}>
          Greenhouse
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Find, enrich, and score your prospects before planting outreach.
        </p>
      </div>

      {/* Tab strip */}
      <div style={{
        display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)",
        marginBottom: "var(--space-5)",
      }}>
        {[
          { key: "seedbed", label: "Seedbed", desc: "All contacts" },
          { key: "sprouts", label: "Sprouts", desc: "Ready for outreach" },
        ].map((t) => (
          <a
            key={t.key}
            href={t.key === "seedbed" ? "/greenhouse" : "/greenhouse?tab=sprouts"}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? "var(--text-primary)" : "var(--text-tertiary)",
              textDecoration: "none",
              borderBottom: tab === t.key ? "2px solid var(--harvest-green)" : "2px solid transparent",
              transition: "all var(--duration-fast) var(--ease-smooth)",
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      {/* Tab content */}
      {tab === "sprouts" ? <ProspectsView /> : <ContactsTable />}
    </div>
  );
}

export default function GreenhousePage() {
  return (
    <Suspense fallback={<div style={{ color: "var(--text-tertiary)", padding: 20 }}>Loading...</div>}>
      <GreenhouseContent />
    </Suspense>
  );
}
