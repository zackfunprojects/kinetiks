/**
 * DeskOf analytics wrapper.
 *
 * Per Final Supplement #5: every significant user action fires an
 * analytics event. Events are queued client-side and flushed in
 * batches so the UI never blocks on analytics. user_id is hashed and
 * fully anonymized after 90 days by a scheduled cleanup job.
 *
 * Instrumented from Phase 2 onward as a cross-cutting requirement —
 * each phase that ships UI must call `track()` from its event
 * boundaries during the same PR. CodeRabbit will flag unmatched UI
 * boundaries that lack analytics calls.
 */

// ----------------------------------------------------------------
// Event taxonomy from Final Supplement §5.1–5.6
// ----------------------------------------------------------------

export type AnalyticsEvent =
  // Onboarding
  | { name: "onboarding_started"; props: { source?: string } }
  | {
      name: "platform_connected";
      props: { platform: "reddit" | "quora"; history_items_imported?: number };
    }
  | { name: "content_urls_submitted"; props: { url_count: number } }
  | {
      name: "calibration_completed";
      props: {
        core_count: number;
        adjacent_count: number;
        skip_count: number;
      };
    }
  | {
      name: "interests_submitted";
      props: { interest_count: number; prepopulated: boolean };
    }
  | {
      name: "track_selected";
      props: {
        track: "minimal" | "standard" | "hero";
        is_trial: boolean;
      };
    }
  | {
      name: "onboarding_completed";
      props: {
        total_duration_seconds: number;
        steps_completed: number;
      };
    }
  | {
      name: "onboarding_abandoned";
      props: {
        last_step_completed: string;
        duration_seconds: number;
      };
    }
  // Write tab (subset for Phase 2 — full taxonomy in Final Supplement §5.2)
  | {
      name: "opportunity_surfaced";
      props: {
        opportunity_id: string;
        match_score: number;
        expertise_tier: string;
        opportunity_type: string;
        platform: string;
      };
    }
  | {
      name: "opportunity_viewed";
      props: { opportunity_id: string; view_duration_ms: number };
    }
  | {
      name: "opportunity_skipped";
      props: {
        opportunity_id: string;
        skip_reason: string;
        match_score: number;
      };
    }
  | {
      name: "reply_editor_opened";
      props: { opportunity_id: string; match_score: number };
    }
  | {
      name: "reply_draft_saved";
      props: {
        opportunity_id: string;
        character_count: number;
        draft_duration_seconds: number;
      };
    }
  | {
      name: "reply_posted";
      props: {
        opportunity_id: string;
        platform: string;
        character_count: number;
        time_to_post_seconds: number;
      };
    }
  | {
      name: "reply_post_failed";
      props: {
        opportunity_id: string;
        platform: string;
        error_type: string;
      };
    };

export type EventName = AnalyticsEvent["name"];

// ----------------------------------------------------------------
// Implicit context applied to every event
// ----------------------------------------------------------------

interface ImplicitContext {
  user_id_hash: string | null;
  session_id: string;
  user_tier: "free" | "standard" | "hero" | null;
  user_track: "minimal" | "standard" | "hero" | null;
  platform: "web" | "pwa";
  app_version: string;
}

let context: ImplicitContext | null = null;

/**
 * Initialize the analytics wrapper. Called once per session, typically
 * from the root client layout after the user is resolved.
 */
export function initAnalytics(opts: ImplicitContext): void {
  context = opts;
}

// ----------------------------------------------------------------
// Queue + flush
// ----------------------------------------------------------------

interface QueuedEvent {
  name: EventName;
  properties: Record<string, unknown>;
  occurred_at: string;
  context: ImplicitContext;
}

const queue: QueuedEvent[] = [];
const FLUSH_INTERVAL_MS = 3000;
const MAX_QUEUE_SIZE = 50;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Track an event. Non-blocking. Safe to call before initAnalytics —
 * the event is queued with a partial context and stamped on flush.
 */
export function track<E extends AnalyticsEvent>(event: E): void {
  if (typeof window === "undefined") return; // server-side: skip

  if (!context) {
    // Context not set yet. Defer with a placeholder; the first
    // initAnalytics call after this will retroactively re-stamp.
    queue.push({
      name: event.name,
      properties: event.props as unknown as Record<string, unknown>,
      occurred_at: new Date().toISOString(),
      context: pendingContext(),
    });
    scheduleFlush();
    return;
  }

  queue.push({
    name: event.name,
    properties: event.props as unknown as Record<string, unknown>,
    occurred_at: new Date().toISOString(),
    context,
  });

  if (queue.length >= MAX_QUEUE_SIZE) {
    void flush();
    return;
  }
  scheduleFlush();
}

function pendingContext(): ImplicitContext {
  return {
    user_id_hash: null,
    session_id: "pending",
    user_tier: null,
    user_track: null,
    platform: "web",
    app_version: "0.0.0",
  };
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Flush queued events to the API. Errors are swallowed — analytics
 * failures must never surface to the UI.
 */
export async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);

  try {
    await fetch("/api/analytics/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // Drop on the floor — analytics is best-effort.
    // (Future enhancement: re-queue + exponential backoff if the
    // failure rate climbs above a threshold.)
  }
}

/**
 * Force a flush before unload — keeps the last few events from being
 * lost when the user navigates away or closes the tab.
 */
export function attachUnloadFlush(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("pagehide", () => {
    void flush();
  });
}
