"use client";

import { useEffect, useRef, useState } from "react";
import type { Opportunity, SkipReason } from "@kinetiks/deskof";
import { OpportunityCard } from "./OpportunityCard";
import { SkipReasonSheet } from "./SkipReasonSheet";
import { track } from "@/lib/analytics";

interface Props {
  opportunities: Opportunity[];
  /** Free tier shows the locked angle teaser instead of the angle itself */
  angleLocked: boolean;
  /**
   * Server action to record a skip with its reason. Returns
   * { ok } so the stack can recover from a failed skip without
   * desyncing from the parent's optimistic state.
   */
  onSkip: (opportunityId: string, reason: SkipReason) => Promise<{ ok: boolean }>;
  /** Server action to open the reply editor for an opportunity */
  onWrite: (opportunityId: string) => void;
  /** Empty state CTA — pull to refresh */
  onRefresh?: () => Promise<void>;
}

const SWIPE_THRESHOLD_PX = 80;

/**
 * The Write tab card stack.
 *
 * Mobile-first per Quality Addendum #3:
 *   - One card visible at a time, the next one peeks behind
 *   - Swipe left to skip → opens the SkipReasonSheet
 *   - Swipe right or tap "Write reply" to open the editor
 *   - All actions are also available as buttons for accessibility
 *
 * The visible "current" card is always `opportunities[0]` — the parent
 * (WriteTabClient) owns the skipped-id set and the queue is derived,
 * so the stack never needs its own index. This avoids the desync that
 * happens if the stack increments an index on a skip that subsequently
 * fails on the server.
 *
 * Card view duration is tracked: a card that gets at least 3 seconds
 * of attention fires `opportunity_viewed`.
 */
export function CardStack({
  opportunities,
  angleLocked,
  onSkip,
  onWrite,
  onRefresh,
}: Props) {
  const [drag, setDrag] = useState(0);
  const [skipping, setSkipping] = useState(false);
  const dragOriginRef = useRef<number | null>(null);
  const surfacedAtRef = useRef<number>(Date.now());

  const current = opportunities[0];

  // Fire opportunity_viewed once per surfaced card after 3s
  useEffect(() => {
    if (!current) return;
    surfacedAtRef.current = Date.now();
    const timer = setTimeout(() => {
      track({
        name: "opportunity_viewed",
        props: {
          opportunity_id: current.id,
          view_duration_ms: Date.now() - surfacedAtRef.current,
        },
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [current?.id]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragOriginRef.current = e.clientX;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragOriginRef.current === null) return;
    setDrag(e.clientX - dragOriginRef.current);
  }

  function handlePointerUp() {
    if (dragOriginRef.current === null) return;
    const distance = drag;
    dragOriginRef.current = null;
    setDrag(0);

    if (distance > SWIPE_THRESHOLD_PX) {
      // Swipe right → write reply
      if (current) {
        track({
          name: "reply_editor_opened",
          props: {
            opportunity_id: current.id,
            match_score: current.match_score,
          },
        });
        onWrite(current.id);
      }
    } else if (distance < -SWIPE_THRESHOLD_PX) {
      // Swipe left → skip flow
      setSkipping(true);
    }
  }

  async function handleSkipReason(reason: SkipReason) {
    if (!current) return;
    setSkipping(false);
    track({
      name: "opportunity_skipped",
      props: {
        opportunity_id: current.id,
        skip_reason: reason,
        match_score: current.match_score,
      },
    });
    // Parent owns the optimistic state. We don't increment an index
    // here — `current` updates automatically when `opportunities`
    // changes (parent removes the id from its set).
    await onSkip(current.id, reason);
  }

  if (!current) {
    return (
      <EmptyStack
        depleted={opportunities.length > 0}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 px-4 pt-4">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            transform: `translateX(${drag}px) rotate(${drag * 0.05}deg)`,
            transition:
              dragOriginRef.current === null
                ? "transform 200ms ease-out"
                : "none",
            touchAction: "pan-y",
          }}
        >
          <OpportunityCard opportunity={current} angleLocked={angleLocked} />
        </div>
      </div>

      {/* Bottom action bar — thumb-zone primary actions */}
      <div className="flex shrink-0 items-center justify-around gap-4 px-6 py-5">
        <button
          type="button"
          onClick={() => setSkipping(true)}
          className="rounded-full border px-5 py-3 text-sm font-medium"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
            background: "var(--surface-raised)",
          }}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => {
            track({
              name: "reply_editor_opened",
              props: {
                opportunity_id: current.id,
                match_score: current.match_score,
              },
            });
            onWrite(current.id);
          }}
          className="rounded-full px-6 py-3 text-sm font-semibold"
          style={{
            background: "var(--accent)",
            color: "#ffffff",
          }}
        >
          Write reply
        </button>
      </div>

      {skipping && (
        <SkipReasonSheet
          onSelect={handleSkipReason}
          onClose={() => setSkipping(false)}
        />
      )}
    </div>
  );
}

function EmptyStack({
  depleted,
  onRefresh,
}: {
  depleted: boolean;
  onRefresh?: () => Promise<void>;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <p
        className="text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {depleted
          ? "You're all caught up for now."
          : "Finding your first opportunity..."}
      </p>
      <p
        className="text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        {depleted
          ? "Check back later — Scout is watching your communities."
          : "Usually takes under a minute."}
      </p>
      {onRefresh && (
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="mt-2 rounded-full border px-4 py-2 text-xs font-medium"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          Refresh
        </button>
      )}
    </div>
  );
}
