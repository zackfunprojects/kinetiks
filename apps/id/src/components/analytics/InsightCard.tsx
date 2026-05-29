"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, StatusPill, Pill, type PillTone } from "@kinetiks/ui";

export interface InsightCardData {
  insight_id: string;
  type: string;
  severity: "info" | "notable" | "urgent";
  source_app: string;
  summary: string;
  evidence_highlights: Array<{ label: string; value: string }>;
  suggested_action: { kind: string; label: string } | null;
  created_at: string;
  delivered?: boolean;
  acted_on?: boolean;
}

interface Props {
  insight: InsightCardData;
  onDismiss: (id: string) => void;
  onActedOn: (id: string) => void;
}

const SEVERITY_LABEL: Record<InsightCardData["severity"], string> = {
  info: "Info",
  notable: "Notable",
  urgent: "Urgent",
};

const SEVERITY_TONE: Record<InsightCardData["severity"], PillTone> = {
  info: "accent",
  notable: "warning",
  urgent: "danger",
};

export function InsightCard({ insight, onDismiss, onActedOn }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<null | "dismiss" | "acted_on" | "apply">(null);

  const handleDismiss = async () => {
    setPending("dismiss");
    try {
      await fetch("/api/oracle/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: insight.insight_id, dismissed: true }),
      });
      onDismiss(insight.insight_id);
    } finally {
      setPending(null);
    }
  };

  const handleActedOn = async () => {
    setPending("acted_on");
    try {
      await fetch("/api/oracle/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: insight.insight_id, acted_on: true }),
      });
      onActedOn(insight.insight_id);
    } finally {
      setPending(null);
    }
  };

  // Insight -> action: open a Marcus thread seeded from this insight.
  const handleApply = async () => {
    setPending("apply");
    try {
      const res = await fetch("/api/marcus/threads/from-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insight_id: insight.insight_id }),
      });
      const data = (await res.json()) as { thread_id?: string };
      if (data.thread_id) {
        router.push(`/chat/${data.thread_id}`);
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <article data-severity={insight.severity} style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
        <header style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-2)" }}>
          <StatusPill tone={SEVERITY_TONE[insight.severity]}>{SEVERITY_LABEL[insight.severity]}</StatusPill>
          <span className="kt-small">
            {insight.type}
            {" · "}
            {insight.source_app}
          </span>
          {insight.acted_on ? (
            <span style={{ marginLeft: "auto" }}>
              <Pill tone="success">Acted on</Pill>
            </span>
          ) : null}
        </header>

        <p className="kt-body" style={{ margin: 0, color: "var(--kt-fg-1)" }}>
          {insight.summary}
        </p>

        {insight.evidence_highlights.length > 0 ? (
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: "var(--kt-s-3)",
              rowGap: "var(--kt-s-1)",
              margin: 0,
            }}
          >
            {insight.evidence_highlights.map((h, i) => (
              <Fragment key={`${h.label}:${i}`}>
                <dt className="kt-small">{h.label}</dt>
                <dd className="kt-data-inline" style={{ margin: 0, color: "var(--kt-fg-1)" }}>
                  {h.value}
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : null}

        <footer style={{ display: "flex", gap: "var(--kt-s-2)", marginTop: "var(--kt-s-1)" }}>
          {insight.suggested_action && !insight.acted_on ? (
            <Button variant="accent" size="sm" onClick={handleApply} loading={pending === "apply"} disabled={pending !== null}>
              {pending === "apply" ? "Opening" : insight.suggested_action.label}
            </Button>
          ) : null}
          {!insight.acted_on ? (
            <Button variant="ghost" size="sm" onClick={handleActedOn} disabled={pending !== null}>
              Mark acted on
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={pending !== null}>
            Dismiss
          </Button>
        </footer>
      </article>
    </Card>
  );
}
