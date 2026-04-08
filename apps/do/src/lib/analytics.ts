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
    }
  // Conversion events (Final Supplement §5.5)
  | {
      name: "upgrade_prompt_shown";
      props: {
        trigger_type:
          | "angle_lock"
          | "citation_teaser"
          | "quora_teaser"
          | "gate_preview"
          | "first_week_prompt"
          | "timed";
        location: string;
      };
    }
  | {
      name: "upgrade_prompt_tapped";
      props: {
        trigger_type: string;
        target_tier: "standard" | "hero";
      };
    }
  | {
      name: "upgrade_completed";
      props: {
        from_tier: "free" | "standard" | "hero";
        to_tier: "free" | "standard" | "hero";
        trigger_type_that_converted?: string;
      };
    }
  | {
      name: "trial_started";
      props: { tier: "standard" | "hero" };
    }
  | {
      name: "trial_converted";
      props: {
        tier: "standard" | "hero";
        replies_during_trial: number;
        authority_score_change?: number;
      };
    }
  | {
      name: "trial_expired";
      props: {
        tier: "standard" | "hero";
        replies_during_trial: number;
        last_active_day?: string;
      };
    }
  | {
      name: "downgrade_completed";
      props: {
        from_tier: "free" | "standard" | "hero";
        to_tier: "free" | "standard" | "hero";
        days_on_tier: number;
        reason?: string;
      };
    }
  // System events (Final Supplement §5.6)
  | {
      name: "session_started";
      props: { platform: "web" | "pwa" };
    }
  | {
      name: "session_ended";
      props: {
        duration_seconds: number;
        tabs_visited: number;
        replies_posted: number;
      };
    }
  | {
      name: "track_changed";
      props: {
        old_track: "minimal" | "standard" | "hero";
        new_track: "minimal" | "standard" | "hero";
      };
    }
  | {
      name: "platform_error";
      props: {
        platform: "reddit" | "quora" | "llm" | "supabase" | "internal";
        error_type: string;
        error_code?: string;
        feature_affected?: string;
      };
    }
  | {
      name: "degraded_mode_entered";
      props: { failing_services: string[] };
    }
  | {
      name: "degraded_mode_exited";
      props: { duration_seconds: number };
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
  /**
   * Null when the event was tracked before initAnalytics ran. The
   * flush path stamps the latest known context onto null entries
   * before sending so events from the cold-start window get a real
   * session_id / tier / track instead of "pending" placeholders.
   */
  context: ImplicitContext | null;
}

const queue: QueuedEvent[] = [];
const FLUSH_INTERVAL_MS = 3000;
const MAX_QUEUE_SIZE = 50;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Track an event. Non-blocking. Safe to call before initAnalytics —
 * the event is queued with a null context and stamped on flush.
 */
export function track<E extends AnalyticsEvent>(event: E): void {
  if (typeof window === "undefined") return; // server-side: skip

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
 *
 * Each event is stamped with the freshest known context at flush time:
 *   1. The event's own context if set (the common path)
 *   2. The current module-level `context` if initAnalytics has run
 *   3. A pendingContext() placeholder as a last resort
 */
export async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length).map((event) => ({
    ...event,
    context: event.context ?? context ?? pendingContext(),
  }));

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
 *
 * Idempotent: a module-level flag prevents accumulating duplicate
 * pagehide listeners across React StrictMode double-mounts and
 * navigation that re-mounts AnalyticsBootstrap. Without the guard,
 * each navigation would add another listener and the queue would be
 * flushed N times on tab close.
 */
let unloadFlushAttached = false;

export function attachUnloadFlush(): void {
  if (typeof window === "undefined" || unloadFlushAttached) return;
  unloadFlushAttached = true;
  window.addEventListener("pagehide", () => {
    void flush();
  });
}
