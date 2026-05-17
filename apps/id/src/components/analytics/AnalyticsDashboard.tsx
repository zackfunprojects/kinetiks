"use client";

import { useState } from "react";
import { GoalOverview } from "./GoalOverview";
import { InsightsBoard } from "./InsightsBoard";
import { SourcesPanel } from "./SourcesPanel";
import { AppPerformance } from "./AppPerformance";
import { BudgetSection } from "./BudgetSection";
import { DateRangePicker } from "./DateRangePicker";

export function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState(30); // days

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--kt-fg-1)", margin: 0 }}>
            Analytics
          </h1>
          <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "4px 0 0" }}>
            Cross-app performance powered by the Oracle
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Goals */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader title="Goals" />
        <GoalOverview />
      </section>

      {/* Insights — D2 Slice 12 surface, reads kinetiks_insights (v3). */}
      <section style={{ marginBottom: 32 }}>
        <InsightsBoard />
      </section>

      {/* Sources — connection health for Oracle integrations. */}
      <section style={{ marginBottom: 32 }}>
        <SourcesPanel />
      </section>

      {/* App Performance */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader title="App Performance" />
        <AppPerformance days={dateRange} />
      </section>

      {/* Budget */}
      <section style={{ marginBottom: 32 }}>
        <SectionHeader title="Budget" />
        <BudgetSection />
      </section>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2
      style={{
        fontSize: 16,
        fontWeight: 600,
        color: "var(--kt-fg-1)",
        margin: "0 0 12px",
        fontFamily: "var(--font-mono), monospace",
      }}
    >
      {title}
    </h2>
  );
}
