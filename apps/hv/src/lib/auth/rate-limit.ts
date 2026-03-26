import { createAdminClient } from "@/lib/supabase/admin";
import type { RateLimitResult } from "@kinetiks/types";

/**
 * Check and increment rate limits for an API key.
 * Uses an atomic SQL upsert via the increment_rate_limit RPC
 * to eliminate the TOCTOU race between read and write.
 */
export async function checkRateLimit(
  keyId: string,
  limitPerMinute: number,
  limitPerDay: number
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = new Date();

  const minuteStart = new Date(now);
  minuteStart.setSeconds(0, 0);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const minuteReset = new Date(minuteStart);
  minuteReset.setMinutes(minuteReset.getMinutes() + 1);

  const dayReset = new Date(dayStart);
  dayReset.setDate(dayReset.getDate() + 1);

  const [minuteResult, dayResult] = await Promise.all([
    admin.rpc("increment_rate_limit", {
      p_key_id: keyId,
      p_window_start: minuteStart.toISOString(),
      p_window_type: "minute",
    }),
    admin.rpc("increment_rate_limit", {
      p_key_id: keyId,
      p_window_start: dayStart.toISOString(),
      p_window_type: "day",
    }),
  ]);

  // On RPC error, fail open (allow) but log
  if (minuteResult.error || dayResult.error) {
    console.error(
      "Rate limit RPC error:",
      minuteResult.error?.message,
      dayResult.error?.message
    );
    return {
      allowed: true,
      remaining: { minute: limitPerMinute, day: limitPerDay },
      reset: {
        minute: minuteReset.toISOString(),
        day: dayReset.toISOString(),
      },
    };
  }

  const minuteCount = minuteResult.data as number;
  const dayCount = dayResult.data as number;

  if (minuteCount > limitPerMinute || dayCount > limitPerDay) {
    return {
      allowed: false,
      remaining: {
        minute: Math.max(0, limitPerMinute - minuteCount),
        day: Math.max(0, limitPerDay - dayCount),
      },
      reset: {
        minute: minuteReset.toISOString(),
        day: dayReset.toISOString(),
      },
    };
  }

  return {
    allowed: true,
    remaining: {
      minute: limitPerMinute - minuteCount,
      day: limitPerDay - dayCount,
    },
    reset: {
      minute: minuteReset.toISOString(),
      day: dayReset.toISOString(),
    },
  };
}
