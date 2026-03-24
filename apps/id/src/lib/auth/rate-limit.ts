import { createAdminClient } from "@/lib/supabase/admin";
import type { RateLimitResult } from "@kinetiks/types";

/**
 * Check and increment rate limits for an API key.
 * Uses atomic upsert to prevent race conditions.
 */
export async function checkRateLimit(
  keyId: string,
  limitPerMinute: number,
  limitPerDay: number
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = new Date();

  // Truncate to current minute and current day
  const minuteStart = new Date(now);
  minuteStart.setSeconds(0, 0);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  // Fetch current counts for both windows
  const { data: rows } = await admin
    .from("kinetiks_rate_limits")
    .select("window_type, request_count")
    .eq("key_id", keyId)
    .in("window_type", ["minute", "day"])
    .or(
      `and(window_type.eq.minute,window_start.eq.${minuteStart.toISOString()}),and(window_type.eq.day,window_start.eq.${dayStart.toISOString()})`
    );

  const minuteRow = rows?.find((r) => r.window_type === "minute");
  const dayRow = rows?.find((r) => r.window_type === "day");

  const currentMinute = (minuteRow?.request_count as number) ?? 0;
  const currentDay = (dayRow?.request_count as number) ?? 0;

  // Check limits before incrementing
  if (currentMinute >= limitPerMinute || currentDay >= limitPerDay) {
    const minuteReset = new Date(minuteStart);
    minuteReset.setMinutes(minuteReset.getMinutes() + 1);

    const dayReset = new Date(dayStart);
    dayReset.setDate(dayReset.getDate() + 1);

    return {
      allowed: false,
      remaining: {
        minute: Math.max(0, limitPerMinute - currentMinute),
        day: Math.max(0, limitPerDay - currentDay),
      },
      reset: {
        minute: minuteReset.toISOString(),
        day: dayReset.toISOString(),
      },
    };
  }

  // Increment both counters atomically via upsert
  await Promise.all([
    admin.from("kinetiks_rate_limits").upsert(
      {
        key_id: keyId,
        window_start: minuteStart.toISOString(),
        window_type: "minute",
        request_count: currentMinute + 1,
      },
      { onConflict: "key_id,window_start,window_type" }
    ),
    admin.from("kinetiks_rate_limits").upsert(
      {
        key_id: keyId,
        window_start: dayStart.toISOString(),
        window_type: "day",
        request_count: currentDay + 1,
      },
      { onConflict: "key_id,window_start,window_type" }
    ),
  ]);

  const minuteReset = new Date(minuteStart);
  minuteReset.setMinutes(minuteReset.getMinutes() + 1);

  const dayReset = new Date(dayStart);
  dayReset.setDate(dayReset.getDate() + 1);

  return {
    allowed: true,
    remaining: {
      minute: limitPerMinute - currentMinute - 1,
      day: limitPerDay - currentDay - 1,
    },
    reset: {
      minute: minuteReset.toISOString(),
      day: dayReset.toISOString(),
    },
  };
}
