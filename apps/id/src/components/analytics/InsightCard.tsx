"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

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
    <article
      data-severity={insight.severity}
      style={{
        border: "1px solid var(--kt-border-1)",
        borderRadius: "var(--kt-radius-2, 8px)",
        background: "var(--kt-bg-1)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SeverityBadge severity={insight.severity} />
        <span style={{ fontSize: 12, color: "var(--kt-fg-3)" }}>
          {insight.type}{" · "}
          {insight.source_app}
        </span>
        {insight.acted_on && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--kt-success-soft, var(--kt-bg-2))",
              color: "var(--kt-success, var(--kt-fg-2))",
            }}
          >
            Acted on
          </span>
        )}
      </header>

      <p style={{ margin: 0, fontSize: 14, color: "var(--kt-fg-1)" }}>{insight.summary}</p>

      {insight.evidence_highlights.length > 0 && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 12,
            rowGap: 4,
            margin: 0,
            fontSize: 12,
            color: "var(--kt-fg-2)",
          }}
        >
          {insight.evidence_highlights.map((h, i) => (
            // Fragment must carry the key — React's list-key check looks
            // at the immediate child of .map(), and bare <></> can't hold
            // one. The inner dt/dd no longer need keys.
            <Fragment key={`${h.label}:${i}`}>
              <dt style={{ color: "var(--kt-fg-3)" }}>{h.label}</dt>
              <dd style={{ margin: 0 }}>{h.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      <footer style={{ display: "flex", gap: 8, marginTop: 4 }}>
        {insight.suggested_action && !insight.acted_on && (
          <button
            type="button"
            onClick={handleApply}
            disabled={pending !== null}
            aria-busy={pending === "apply"}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--kt-radius-1, 6px)",
              border: "1px solid var(--kt-accent, var(--kt-border-2))",
              background: "var(--kt-accent, var(--kt-bg-2))",
              color: "var(--kt-fg-on-accent, var(--kt-fg-0))",
              cursor: pending ? "wait" : "pointer",
              fontSize: 13,
            }}
          >
            {pending === "apply" ? "Opening…" : insight.suggested_action.label}
          </button>
        )}
        {!insight.acted_on && (
          <button
            type="button"
            onClick={handleActedOn}
            disabled={pending !== null}
            style={btnSecondaryStyle(pending === "acted_on")}
          >
            Mark acted on
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending !== null}
          style={btnSecondaryStyle(pending === "dismiss")}
        >
          Dismiss
        </button>
      </footer>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: InsightCardData["severity"] }) {
  const colorVar =
    severity === "urgent" ? "var(--kt-danger, var(--kt-fg-1))"
    : severity === "notable" ? "var(--kt-warning, var(--kt-fg-2))"
    : "var(--kt-accent, var(--kt-fg-3))";
  const softVar =
    severity === "urgent" ? "var(--kt-danger-soft, var(--kt-bg-2))"
    : severity === "notable" ? "var(--kt-warning-soft, var(--kt-bg-2))"
    : "var(--kt-accent-soft, var(--kt-bg-2))";
  return (
    <span
      aria-label={`Severity: ${SEVERITY_LABEL[severity]}`}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 6px",
        borderRadius: 4,
        background: softVar,
        color: colorVar,
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function btnSecondaryStyle(busy: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: "var(--kt-radius-1, 6px)",
    border: "1px solid var(--kt-border-1)",
    background: "transparent",
    color: "var(--kt-fg-2)",
    cursor: busy ? "wait" : "pointer",
    fontSize: 13,
  };
}
