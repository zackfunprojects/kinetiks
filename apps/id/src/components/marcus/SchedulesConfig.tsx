"use client";

import type { MarcusSchedule } from "@kinetiks/types";
import { useState } from "react";

interface SchedulesConfigProps {
  schedules: MarcusSchedule[];
}

const SCHEDULE_LABELS: Record<string, string> = {
  daily_brief: "Daily Brief",
  weekly_digest: "Weekly Digest",
  monthly_review: "Monthly Review",
};

const SCHEDULE_DESCRIPTIONS: Record<string, string> = {
  daily_brief:
    "5-8 sentence summary of the last 24 hours. What happened, what changed, what to focus on today.",
  weekly_digest:
    "Week-over-week trends, cross-app correlations, strategic recommendations for the coming week.",
  monthly_review:
    "Comprehensive performance analysis, Context Structure evolution, strategic adjustments.",
};

/**
 * Convert a cron expression to a human-readable string.
 * Handles common patterns; falls back to the raw expression.
 */
function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, , , dow] = parts;

  const hourNum = parseInt(hour, 10);
  const minuteNum = parseInt(minute, 10);
  if (isNaN(hourNum) || isNaN(minuteNum)) return cron;

  const period = hourNum >= 12 ? "PM" : "AM";
  const displayHour = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
  const displayMin = minuteNum.toString().padStart(2, "0");
  const timeStr = `${displayHour}:${displayMin} ${period}`;

  if (dow === "*") return `Daily at ${timeStr}`;
  if (dow === "1-5") return `Weekdays at ${timeStr}`;
  if (dow === "0" || dow === "7") return `Sundays at ${timeStr}`;
  if (dow === "1") return `Mondays at ${timeStr}`;

  return `${timeStr} (${cron})`;
}

export function SchedulesConfig({ schedules }: SchedulesConfigProps) {
  const [localSchedules, setLocalSchedules] =
    useState<MarcusSchedule[]>(schedules);
  // Track separate saving states for toggle and send-now to prevent collisions
  const [savingToggle, setSavingToggle] = useState<string | null>(null);
  const [savingSendNow, setSavingSendNow] = useState<string | null>(null);
  const [sendNowStatus, setSendNowStatus] = useState<Record<string, "success" | "error">>({});

  const handleToggle = async (schedule: MarcusSchedule) => {
    setSavingToggle(schedule.id);
    try {
      const res = await fetch(`/api/marcus/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      if (res.ok) {
        setLocalSchedules((prev) =>
          prev.map((s) =>
            s.id === schedule.id ? { ...s, enabled: !s.enabled } : s
          )
        );
      }
    } finally {
      setSavingToggle(null);
    }
  };

  const handleSendNow = async (type: string) => {
    setSavingSendNow(type);
    setSendNowStatus((prev) => ({ ...prev, [type]: undefined as unknown as "success" }));
    try {
      const res = await fetch("/api/marcus/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      setSendNowStatus((prev) => ({ ...prev, [type]: res.ok ? "success" : "error" }));
    } catch {
      setSendNowStatus((prev) => ({ ...prev, [type]: "error" }));
    } finally {
      setSavingSendNow(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {localSchedules.map((schedule) => (
        <div
          key={schedule.id}
          style={{
            border: "1px solid #e5e5ea",
            borderRadius: 12,
            padding: 20,
            backgroundColor: schedule.enabled ? "#fff" : "#fafafa",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {SCHEDULE_LABELS[schedule.type] ?? schedule.type}
            </h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => handleSendNow(schedule.type)}
                disabled={savingSendNow === schedule.type}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #e5e5ea",
                  borderRadius: 6,
                  background: "#fff",
                  fontSize: 12,
                  cursor: savingSendNow === schedule.type ? "not-allowed" : "pointer",
                  color: "#6C5CE7",
                }}
              >
                {savingSendNow === schedule.type
                  ? "Sending..."
                  : sendNowStatus[schedule.type] === "success"
                    ? "Sent"
                    : sendNowStatus[schedule.type] === "error"
                      ? "Failed"
                      : "Send Now"}
              </button>
              <button
                onClick={() => handleToggle(schedule)}
                disabled={savingToggle === schedule.id}
                style={{
                  padding: "6px 16px",
                  border: "none",
                  borderRadius: 6,
                  backgroundColor: schedule.enabled ? "#6C5CE7" : "#e5e5ea",
                  color: schedule.enabled ? "#fff" : "#666",
                  fontSize: 12,
                  cursor: savingToggle === schedule.id ? "not-allowed" : "pointer",
                  fontWeight: 500,
                }}
              >
                {schedule.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>

          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666", lineHeight: 1.5 }}>
            {SCHEDULE_DESCRIPTIONS[schedule.type]}
          </p>

          <div
            style={{
              display: "flex",
              gap: 24,
              fontSize: 12,
              color: "#999",
            }}
          >
            <div>
              <strong>Schedule:</strong> {cronToHuman(schedule.schedule)}
            </div>
            <div>
              <strong>Channel:</strong> {schedule.channel}
            </div>
            <div>
              <strong>Timezone:</strong> {schedule.timezone}
            </div>
            {schedule.last_sent_at && (
              <div>
                <strong>Last sent:</strong>{" "}
                {new Date(schedule.last_sent_at).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      ))}

      {localSchedules.length === 0 && (
        <p style={{ textAlign: "center", color: "#999", padding: 32 }}>
          No schedules configured yet. They will be created when you connect Slack.
        </p>
      )}
    </div>
  );
}
