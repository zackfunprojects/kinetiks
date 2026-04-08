"use client";

/**
 * FilteredFeedSheet — review what Scout v2 dropped today.
 *
 * Quality Addendum #7. Modal sheet over the Write tab. Each row
 * shows:
 *   - Thread title + community
 *   - Filter reason (badge) + plain-language detail
 *   - The hypothetical match_score the thread would have received
 *
 * Read-only — no skip/accept. The filtered feed is for transparency
 * and learning, not action. If the user disagrees with a filter,
 * Pulse picks that up via the explicit "wrong filter" tap (deferred
 * to a follow-up — not in this PR).
 *
 * Free-tier users never see this sheet — the parent component
 * gates it behind `<UpgradeGate feature="filtered_feed_full">`.
 */
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import type { ThreadSnapshot } from "@kinetiks/deskof";

interface FilteredThread {
  id: string;
  thread: ThreadSnapshot;
  reason: string;
  detail: string;
  hypothetical_score: number;
  filtered_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FilteredFeedSheet({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState<FilteredThread[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/opportunities/filtered")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.error ?? "Failed to load filtered threads");
          return;
        }
        setThreads(json.threads ?? []);
        track({
          name: "filtered_feed_opened",
          props: { filtered_count: json.count ?? 0 },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end md:items-center md:justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col rounded-t-2xl md:max-w-lg md:rounded-2xl"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <header className="flex items-center justify-between px-5 py-4">
          <div>
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Filtered today
            </h2>
            <p
              className="text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              Threads Scout dropped before they reached your queue
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs"
            style={{
              color: "var(--text-tertiary)",
              border: "1px solid var(--border)",
            }}
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading && (
            <p
              className="py-8 text-center text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              Loading…
            </p>
          )}
          {error && (
            <p
              className="py-8 text-center text-sm"
              style={{ color: "var(--danger)" }}
            >
              {error}
            </p>
          )}
          {!loading && !error && threads.length === 0 && (
            <p
              className="py-8 text-center text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              Nothing filtered today — Scout surfaced everything.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {threads.map((row) => (
              <FilteredRow key={row.id} row={row} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FilteredRow({ row }: { row: FilteredThread }) {
  return (
    <li
      className="rounded-lg p-3"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider">
        <span
          className="rounded-full px-2 py-0.5 font-semibold"
          style={{
            background: "var(--warning-subtle)",
            color: "var(--warning)",
          }}
        >
          {labelForReason(row.reason)}
        </span>
        <span style={{ color: "var(--text-tertiary)" }}>
          {row.thread.platform} · {row.thread.community}
        </span>
        <span style={{ color: "var(--text-tertiary)" }}>
          score {row.hypothetical_score}
        </span>
      </div>
      <h3
        className="line-clamp-2 text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {row.thread.title}
      </h3>
      <p
        className="mt-1 text-xs leading-snug"
        style={{ color: "var(--text-secondary)" }}
      >
        {row.detail}
      </p>
    </li>
  );
}

function labelForReason(reason: string): string {
  switch (reason) {
    case "no_posting_history":
      return "Cold entry";
    case "already_well_answered":
      return "Mature thread";
    case "community_hostility":
      return "Hostile community";
    case "duplicate_coverage":
      return "Duplicate coverage";
    case "requires_self_promotion":
      return "Promo tension";
    case "astroturfed":
      return "Astroturfed";
    default:
      return reason;
  }
}
