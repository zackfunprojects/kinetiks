"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Reusable account-scoped Realtime subscription.
 *
 * Extracts the canonical lifecycle that was copy-pasted across
 * AuthorityRealtimeRefresh / ApprovalPanel / usePendingApprovalCount /
 * DesktopNotificationBridge: create the browser client, attach binding(s),
 * subscribe, and — critically — re-resolve auth on CHANNEL_ERROR / TIMED_OUT
 * (a dropped channel is usually an expired JWT; a stale token must trigger a
 * fresh sign-in, never a silently dead subscription). Cleans up via
 * removeChannel.
 *
 * Supports both `postgres_changes` (RLS-enforced) and `broadcast` (ephemeral,
 * used by the collaborative presence/workspace channels) bindings.
 */

export interface PostgresChangesBinding<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  kind: "postgres_changes";
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema?: string;
  table: string;
  /** PostgREST filter, e.g. `account_id=eq.${accountId}`. */
  filter?: string;
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
}

export interface BroadcastBinding {
  kind: "broadcast";
  event: string;
  onMessage: (payload: Record<string, unknown>) => void;
}

export type RealtimeBinding = PostgresChangesBinding | BroadcastBinding;

export interface UseRealtimeChannelOptions {
  /** Channel name; null/empty disables the subscription. */
  channelName: string | null;
  bindings: RealtimeBinding[];
  /** Defaults to true. */
  enabled?: boolean;
  /**
   * Called when re-auth fails (no refreshable session). Defaults to redirecting
   * to /login with the current path preserved.
   */
  onReauthFailure?: () => void;
}

/** Stable structural key so inline callback identity does not force resubscribe. */
function structuralKey(channelName: string | null, bindings: RealtimeBinding[]): string {
  return JSON.stringify([
    channelName,
    bindings.map((b) =>
      b.kind === "postgres_changes"
        ? ["pg", b.event ?? "*", b.schema ?? "public", b.table, b.filter ?? ""]
        : ["bc", b.event]
    ),
  ]);
}

export function useRealtimeChannel(options: UseRealtimeChannelOptions): void {
  const { channelName, bindings, enabled = true, onReauthFailure } = options;
  const router = useRouter();

  // Route callbacks through a ref so changing their identity each render does
  // not tear down and rebuild the channel.
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const onReauthFailureRef = useRef(onReauthFailure);
  onReauthFailureRef.current = onReauthFailure;

  const key = structuralKey(channelName, bindings);

  useEffect(() => {
    if (!enabled || !channelName) return;

    const supabase = createClient();
    let channel = supabase.channel(channelName);

    for (let i = 0; i < bindingsRef.current.length; i++) {
      const binding = bindingsRef.current[i];
      if (binding.kind === "postgres_changes") {
        channel = channel.on(
          // @supabase/supabase-js overloads on the literal "postgres_changes"
          "postgres_changes" as never,
          {
            event: binding.event ?? "*",
            schema: binding.schema ?? "public",
            table: binding.table,
            ...(binding.filter ? { filter: binding.filter } : {}),
          } as never,
          ((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const current = bindingsRef.current[i];
            if (current && current.kind === "postgres_changes") current.onChange(payload);
          }) as never
        );
      } else {
        channel = channel.on(
          "broadcast" as never,
          { event: binding.event } as never,
          ((message: { payload?: Record<string, unknown> }) => {
            const current = bindingsRef.current[i];
            if (current && current.kind === "broadcast") {
              current.onMessage(message.payload ?? {});
            }
          }) as never
        );
      }
    }

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void (async () => {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) {
            if (onReauthFailureRef.current) {
              onReauthFailureRef.current();
            } else {
              const here = window.location.pathname + window.location.search;
              router.push(`/login?redirect=${encodeURIComponent(here)}`);
            }
            return;
          }
          await supabase.realtime.setAuth(data.session.access_token);
        })();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
    // `key` captures channelName + structural binding shape; callbacks ride the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, router]);
}
