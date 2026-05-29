"use client";

import { useState } from "react";
import { DailyBriefCard } from "./DailyBriefCard";
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--kt-s-5)" }}>
        <div>
          <h1 className="kt-page-title" style={{ margin: 0 }}>Analytics</h1>
          <p className="kt-body" style={{ margin: "var(--kt-s-1) 0 0" }}>
            Cross-app performance powered by the Oracle
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Daily brief */}
      <DailyBriefCard />

      {/* Goals */}
      <section style={{ marginBottom: "var(--kt-s-6)" }}>
        <SectionHeader title="Goals" />
        <GoalOverview />
      </section>

      {/* Insights — D2 Slice 12 surface, reads kinetiks_insights (v3). */}
      <section style={{ marginBottom: "var(--kt-s-6)" }}>
        <InsightsBoard />
      </section>

      {/* Sources — connection health for Oracle integrations. */}
      <section style={{ marginBottom: "var(--kt-s-6)" }}>
        <SourcesPanel />
      </section>

      {/* App Performance */}
      <section style={{ marginBottom: "var(--kt-s-6)" }}>
        <SectionHeader title="App Performance" />
        <AppPerformance days={dateRange} />
      </section>

      {/* Budget */}
      <section style={{ marginBottom: "var(--kt-s-6)" }}>
        <SectionHeader title="Budget" />
        <BudgetSection />
      </section>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="kt-section-title" style={{ margin: "0 0 var(--kt-s-3)" }}>
      {title}
    </h2>
  );
}
