"use client";

import { useEffect, useState } from "react";
import type { MarcusSchedule } from "@kinetiks/types";
import { SchedulesConfig } from "@/components/marcus/SchedulesConfig";

const LOAD_ERROR_MESSAGE = "We couldn't load your brief schedules. Try again.";

/**
 * C2 - the live brief-schedule manager, ported from the legacy
 * (dashboard)/marcus/schedules page. Reuses SchedulesConfig (toggle +
 * send-now per schedule); the modal fetches the schedules from
 * GET /api/marcus/schedules.
 */
export function NotificationSettings() {
  const [schedules, setSchedules] = useState<MarcusSchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/marcus/schedules");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        const envelope = json.data ?? json;
        if (!cancelled) setSchedules((envelope.schedules ?? []) as MarcusSchedule[]);
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

  return (
    <div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--kt-fg-1)",
          margin: "0 0 8px",
        }}
      >
        Notifications
      </h3>
      <p style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: "0 0 24px" }}>
        Brief schedules and delivery. Toggle a brief off to pause it.
      </p>

      {loading ? (
        <div aria-busy="true" aria-live="polite" aria-label="Loading schedules">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 64,
                marginBottom: 12,
                borderRadius: 8,
                background: "var(--kt-bg-muted)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      ) : error ? (
        <p role="alert" style={{ fontSize: 14, color: "var(--kt-fg-2)", margin: 0 }}>
          {error}
        </p>
      ) : !schedules || schedules.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--kt-fg-3)", margin: 0 }}>
          No brief schedules yet. They are created when your system sets up
          its daily and weekly briefs.
        </p>
      ) : (
        <SchedulesConfig schedules={schedules} />
      )}
    </div>
  );
}
