"use client";

/**
 * Desktop notification sender — D4.
 *
 * The Electron shell has exposed `window.electron.showNotification`
 * since Phase 1 with no producer (audit 2.4: "the desktop
 * notification IPC has no sender"). This bridge is the producer:
 * mounted once in the (app) shell, it subscribes to the account's
 * Realtime inserts (RLS scopes the rows) and forwards the
 * attention-worthy ones to the OS:
 *
 *   - urgent/warning in-app alerts (briefs stay quiet - they are
 *     info severity)
 *   - newly queued approvals (the action is blocked on the customer)
 *
 * Renders nothing; no-ops entirely outside the desktop shell. Titles
 * only ever carry our own generated strings (alert titles, approval
 * titles) - never raw payloads.
 */

import { useEffect } from "react";

import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { getDesktopBridge } from "@/lib/desktop/useIsDesktop";

export function DesktopNotificationBridge({ systemName }: { systemName: string | null }) {
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const displayName = systemName?.trim() || "Kinetiks";
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("desktop-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kinetiks_marcus_alerts" },
        (payload) => {
          const row = payload.new as { title?: string; severity?: string };
          if (row.severity !== "urgent" && row.severity !== "warning") return;
          bridge.showNotification({
            title: displayName,
            body: row.title ?? "Something needs your attention",
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kinetiks_approvals" },
        (payload) => {
          const row = payload.new as { title?: string; status?: string };
          if (row.status && row.status !== "pending") return;
          bridge.showNotification({
            title: `${displayName} needs a decision`,
            body: row.title ?? "An action is waiting for your approval",
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [systemName]);

  return null;
}
