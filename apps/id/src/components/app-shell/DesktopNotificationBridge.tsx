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

export function DesktopNotificationBridge({
  systemName,
  accountId,
}: {
  systemName: string | null;
  accountId: string;
}) {
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const displayName = systemName?.trim() || "Kinetiks";
    const supabase = createBrowserClient();
    // Channel name AND postgres_changes filter are account-scoped per
    // the CLAUDE.md Realtime contract (CR) - RLS remains the access
    // boundary; the scoping keeps cross-account signal out of the
    // channel layer entirely.
    const channel = supabase
      .channel(`desktop-notifications:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "kinetiks_marcus_alerts",
          filter: `account_id=eq.${accountId}`,
        },
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
        {
          event: "INSERT",
          schema: "public",
          table: "kinetiks_approvals",
          filter: `account_id=eq.${accountId}`,
        },
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
  }, [systemName, accountId]);

  return null;
}
