import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcusSchedule, MarcusScheduleType } from "@kinetiks/types";
import { CronExpressionParser } from "cron-parser";

/**
 * Default schedule configurations for new accounts.
 * All start disabled - user enables via settings.
 */
const DEFAULT_SCHEDULES: Array<{
  type: MarcusScheduleType;
  schedule: string;
  channel: string;
}> = [
  { type: "daily_brief", schedule: "0 9 * * 1-5", channel: "slack" },
  { type: "weekly_digest", schedule: "0 9 * * 1", channel: "slack" },
  { type: "monthly_review", schedule: "0 9 1 * *", channel: "email" },
];

/**
 * Create default schedules for a new account. All start disabled.
 */
export async function createDefaultSchedules(
  admin: SupabaseClient,
  accountId: string,
  timezone = "America/New_York"
): Promise<MarcusSchedule[]> {
  const schedules = DEFAULT_SCHEDULES.map((s) => ({
    account_id: accountId,
    type: s.type,
    schedule: s.schedule,
    channel: s.channel,
    timezone,
    enabled: false,
    next_send_at: calculateNextSend(s.schedule, timezone),
  }));

  const { data, error } = await admin
    .from("kinetiks_marcus_schedules")
    .insert(schedules)
    .select();

  if (error) throw new Error(`Failed to create schedules: ${error.message}`);
  return (data ?? []) as MarcusSchedule[];
}

/**
 * Get all schedules for an account.
 */
export async function getSchedulesForAccount(
  admin: SupabaseClient,
  accountId: string
): Promise<MarcusSchedule[]> {
  const { data, error } = await admin
    .from("kinetiks_marcus_schedules")
    .select()
    .eq("account_id", accountId)
    .order("type");

  if (error) throw new Error(`Failed to get schedules: ${error.message}`);
  return (data ?? []) as MarcusSchedule[];
}

/**
 * Update a schedule (enable/disable, change time, change channel).
 */
export async function updateSchedule(
  admin: SupabaseClient,
  scheduleId: string,
  updates: {
    enabled?: boolean;
    schedule?: string;
    channel?: string;
    timezone?: string;
  }
): Promise<MarcusSchedule> {
  const updateData: Record<string, unknown> = {};

  if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
  if (updates.channel) updateData.channel = updates.channel;
  if (updates.timezone) updateData.timezone = updates.timezone;

  if (updates.schedule) {
    updateData.schedule = updates.schedule;
    updateData.next_send_at = calculateNextSend(
      updates.schedule,
      updates.timezone ?? "America/New_York"
    );
  }

  const { data, error } = await admin
    .from("kinetiks_marcus_schedules")
    .update(updateData)
    .eq("id", scheduleId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update schedule: ${error.message}`);
  return data as MarcusSchedule;
}

/**
 * Get schedules that are due now (enabled and next_send_at <= now).
 * Used by CRON Edge Functions.
 */
export async function getSchedulesDueNow(
  admin: SupabaseClient,
  type?: MarcusScheduleType
): Promise<MarcusSchedule[]> {
  let query = admin
    .from("kinetiks_marcus_schedules")
    .select()
    .eq("enabled", true)
    .lte("next_send_at", new Date().toISOString());

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) return [];
  return (data ?? []) as MarcusSchedule[];
}

/**
 * Mark a schedule as sent and calculate the next send time.
 */
export async function markScheduleSent(
  admin: SupabaseClient,
  scheduleId: string,
  schedule: string,
  timezone: string
): Promise<void> {
  const nextSend = calculateNextSend(schedule, timezone);

  const { error } = await admin
    .from("kinetiks_marcus_schedules")
    .update({
      last_sent_at: new Date().toISOString(),
      next_send_at: nextSend,
    })
    .eq("id", scheduleId);

  if (error) throw new Error(`Failed to mark schedule sent: ${error.message}`);
}

/**
 * Calculate the next send time from a cron expression and timezone.
 */
function calculateNextSend(
  cronExpression: string,
  timezone: string
): string {
  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: new Date(),
    });
    const next = interval.next();
    // next() returns CronDate which has toISOString - fallback if null
    const iso = next?.toISOString();
    return iso ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  } catch {
    // Fallback: 24 hours from now
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
}
