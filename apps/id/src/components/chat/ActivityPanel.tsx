"use client";

import { useEffect, useState } from "react";
// Subpath import keeps the lib barrel (and its node:crypto-backed pii
// module) out of the client bundle.
import { formatRelativeTime } from "@kinetiks/lib/format";
import type { AgentActivitySummary } from "@/lib/activity/aggregate";
import { isActivityEmpty } from "@/lib/activity/aggregate";

interface ActivityPanelProps {
  systemName: string | null;
}

const LOAD_ERROR_MESSAGE = "We couldn't load recent activity. Try again.";

/**
 * B4 — the agent-activity feed in the chat rail: a plain-language
 * narration of the operator division of labor over the last 24 hours,
 * read from existing telemetry rows. The conversational engine is
 * referred to by the customer's chosen system name, never "Marcus".
 */
export function ActivityPanel({ systemName }: ActivityPanelProps) {
  const [summary, setSummary] = useState<AgentActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/activity/summary");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        const envelope = json.data ?? json;
        if (!cancelled) setSummary(envelope.summary as AgentActivitySummary);
      } catch {
        if (!cancelled) setError(LOAD_ERROR_MESSAGE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = systemName || "Your system";

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading activity"
        style={{ padding: "var(--kt-s-4) var(--kt-s-3)" }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: "var(--kt-s-4)",
              marginBottom: "var(--kt-s-3)",
              borderRadius: "var(--kt-radius-1)",
              background: "var(--kt-bg-muted)",
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "var(--kt-s-4) var(--kt-s-3)" }}>
        <p className="kt-body" style={{ margin: 0, color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-13)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!summary || isActivityEmpty(summary)) {
    return (
      <div style={{ padding: "var(--kt-s-4) var(--kt-s-3)" }}>
        <p className="kt-body" style={{ margin: 0, color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-13)" }}>
          No agent activity in the last {summary?.window_hours ?? 24} hours.
          As {displayName} reads your data and writes insights, the work
          shows up here.
        </p>
      </div>
    );
  }

  const lines = buildNarration(summary, displayName);

  return (
    <div style={{ padding: "var(--kt-s-4) var(--kt-s-3)", overflowY: "auto" }}>
      <p
        className="kt-data-inline"
        style={{ margin: "0 0 var(--kt-s-3)", color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-11)" }}
      >
        Last {summary.window_hours} hours
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {lines.map((line) => (
          <li
            key={line.key}
            style={{
              marginBottom: "var(--kt-s-3)",
              paddingBottom: "var(--kt-s-3)",
              borderBottom: "1px solid var(--kt-border-2)",
            }}
          >
            <p
              className="kt-data-inline"
              style={{ margin: "0 0 var(--kt-s-1)", color: "var(--kt-fg-2)", fontSize: "var(--kt-fs-11)" }}
            >
              {line.operator}
            </p>
            <p className="kt-body" style={{ margin: 0, fontSize: "var(--kt-fs-13)" }}>
              {line.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface NarrationLine {
  key: string;
  operator: string;
  text: string;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

function buildNarration(
  summary: AgentActivitySummary,
  displayName: string,
): NarrationLine[] {
  const lines: NarrationLine[] = [];

  const { oracle, archivist, conversation, authority } = summary;

  if (oracle.runs > 0 || oracle.insights_written > 0) {
    const parts = [`ran ${plural(oracle.runs, "analysis", "analyses")}`];
    if (oracle.sources_evaluated.length > 0) {
      parts.push(`read ${plural(oracle.sources_evaluated.length, "source")}`);
    }
    parts.push(`wrote ${plural(oracle.insights_written, "insight")}`);
    const when = oracle.last_run_at
      ? `, last ${formatRelativeTime(oracle.last_run_at)}`
      : "";
    lines.push({
      key: "oracle",
      operator: "Oracle",
      text: `${capitalize(joinParts(parts))}${when}.`,
    });
  }

  const archivistParts: string[] = [];
  if (archivist.proposals_resolved > 0) {
    archivistParts.push(`resolved ${plural(archivist.proposals_resolved, "proposal")}`);
  }
  if (archivist.patterns_updated > 0) {
    archivistParts.push(`updated ${plural(archivist.patterns_updated, "pattern")}`);
  }
  if (archivist.decay_recalibrations > 0) {
    archivistParts.push(
      `recalibrated ${plural(archivist.decay_recalibrations, "decay window")}`,
    );
  }
  if (archivist.maintenance_events > 0) {
    archivistParts.push(
      `ran ${plural(archivist.maintenance_events, "maintenance pass", "maintenance passes")}`,
    );
  }
  if (archivistParts.length > 0) {
    lines.push({
      key: "archivist",
      operator: "Archivist",
      text: `${capitalize(joinParts(archivistParts))}.`,
    });
  }

  if (conversation.turns > 0 || conversation.tool_calls > 0) {
    const parts = [`answered ${plural(conversation.turns, "question")}`];
    if (conversation.tool_calls > 0) {
      const toolNote =
        conversation.tools_used.length > 0
          ? ` across ${plural(conversation.tools_used.length, "source")}`
          : "";
      parts.push(`made ${plural(conversation.tool_calls, "data check")}${toolNote}`);
    }
    lines.push({
      key: "conversation",
      operator: displayName,
      text: `${capitalize(joinParts(parts))}.`,
    });
  }

  if (authority.actions_under_grants > 0) {
    lines.push({
      key: "authority",
      operator: "Authority",
      text: `${plural(authority.actions_under_grants, "action")} ran under authority you granted.`,
    });
  }

  return lines;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
