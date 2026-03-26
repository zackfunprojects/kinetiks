"use client";

import { useState, useEffect, useCallback } from "react";
import type { OverviewMetrics as OverviewMetricsType, CampaignMetric, SequenceMetric } from "@/types/analytics";
import OverviewMetrics from "./OverviewMetrics";
import CampaignPerformance from "./CampaignPerformance";
import SequencePerformance from "./SequencePerformance";

type Tab = "overview" | "campaigns" | "sequences";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "campaigns", label: "Campaigns" },
  { key: "sequences", label: "Sequences" },
];

export default function AnalyticsView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [overviewData, setOverviewData] = useState<OverviewMetricsType | null>(null);
  const [campaignData, setCampaignData] = useState<CampaignMetric[]>([]);
  const [sequenceData, setSequenceData] = useState<SequenceMetric[]>([]);

  const fetchData = useCallback(async (view: Tab) => {
    setLoading(true);
    const res = await fetch(`/api/hv/analytics?view=${view}`);
    const json = await res.json();
    if (json.success) {
      if (view === "overview") setOverviewData(json.data as OverviewMetricsType);
      if (view === "campaigns") setCampaignData(json.data as CampaignMetric[]);
      if (view === "sequences") setSequenceData(json.data as SequenceMetric[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(tab);
  }, [tab, fetchData]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Analytics</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Track email performance across campaigns and sequences
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              backgroundColor: tab === t.key ? "var(--surface-raised)" : "transparent",
              color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : (
        <>
          {tab === "overview" && overviewData && <OverviewMetrics metrics={overviewData} />}
          {tab === "campaigns" && <CampaignPerformance campaigns={campaignData} />}
          {tab === "sequences" && <SequencePerformance sequences={sequenceData} />}
        </>
      )}
    </div>
  );
}
