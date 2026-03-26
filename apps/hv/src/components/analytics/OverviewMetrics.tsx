"use client";

import type { OverviewMetrics as OverviewMetricsType } from "@/types/analytics";
import MetricCard from "./MetricCard";

interface OverviewMetricsProps {
  metrics: OverviewMetricsType;
}

export default function OverviewMetrics({ metrics }: OverviewMetricsProps) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <MetricCard
        label="Total Sent"
        value={metrics.total_sent.toLocaleString()}
        subtitle={`${metrics.total_bounced} bounced`}
      />
      <MetricCard
        label="Open Rate"
        value={`${metrics.open_rate}%`}
        subtitle={`${metrics.total_opened.toLocaleString()} opened`}
      />
      <MetricCard
        label="Click Rate"
        value={`${metrics.click_rate}%`}
        subtitle={`${metrics.total_clicked.toLocaleString()} clicked`}
      />
      <MetricCard
        label="Reply Rate"
        value={`${metrics.reply_rate}%`}
        subtitle={`${metrics.total_replied.toLocaleString()} replied`}
      />
      <MetricCard
        label="Bounce Rate"
        value={`${metrics.bounce_rate}%`}
        subtitle={`${metrics.total_bounced.toLocaleString()} bounced`}
      />
    </div>
  );
}
