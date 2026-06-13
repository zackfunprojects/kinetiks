"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient as createBrowserClient } from "@/lib/supabase/client";

/**
 * E3 — account-scoped Realtime propagation of grant status changes
 * (addendum: "Authority Grant status changes ... also propagate via
 * Realtime so any open client surface reflects them").
 *
 * Subscribes to postgres_changes on kinetiks_authority_grants for this
 * account (RLS scopes delivery; the filter narrows the firehose) and
 * refreshes the Server Component route — the same refetch path the
 * Server Actions use — so a grant paused from Chat, approved from
 * Slack, or expired by the cron updates this surface without a manual
 * reload. Changes are debounced: a bundle approval (1 root + 2
 * children) lands as one refresh, not three.
 */
export function AuthorityRealtimeRefresh({ accountId }: { accountId: string }) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`authority-grants:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kinetiks_authority_grants",
          filter: `account_id=eq.${accountId}`,
        },
        () => {
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => {
            router.refresh();
          }, 400);
        },
      )
      .subscribe();

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(channel);
    };
  }, [accountId, router]);

  return null;
}
