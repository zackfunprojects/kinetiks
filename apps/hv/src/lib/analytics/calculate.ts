import { createAdminClient } from "@/lib/supabase/admin";
import type { OverviewMetrics, CampaignMetric, SequenceMetric } from "@/types/analytics";

interface EmailRow {
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
}

interface CampaignEmailRow {
  campaign_id: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
}

interface SequenceRow {
  id: string;
  name: string;
  status: string;
}

interface EnrollmentRow {
  sequence_id: string;
  status: string;
}

/**
 * Calculate a percentage rate, rounded to 2 decimal places.
 * Returns 0 when the denominator is zero.
 */
function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * Calculate overview metrics across all sent emails for an account.
 *
 * Queries hv_emails directly and computes totals + rates.
 */
export async function calculateOverviewMetrics(
  accountId: string
): Promise<OverviewMetrics> {
  const admin = createAdminClient();

  const { data: emails, error } = await admin
    .from("hv_emails")
    .select("status, sent_at, opened_at, clicked_at, replied_at, bounced_at")
    .eq("kinetiks_id", accountId)
    .not("sent_at", "is", null);

  if (error) {
    console.error("[analytics] Failed to query emails:", error.message);
    throw new Error(`Failed to calculate overview metrics: ${error.message}`);
  }

  const rows = (emails ?? []) as EmailRow[];
  const total_sent = rows.length;
  const total_opened = rows.filter((e) => e.opened_at !== null).length;
  const total_clicked = rows.filter((e) => e.clicked_at !== null).length;
  const total_replied = rows.filter((e) => e.replied_at !== null).length;
  const total_bounced = rows.filter((e) => e.bounced_at !== null).length;

  return {
    total_sent,
    total_opened,
    total_clicked,
    total_replied,
    total_bounced,
    open_rate: rate(total_opened, total_sent),
    click_rate: rate(total_clicked, total_sent),
    reply_rate: rate(total_replied, total_sent),
    bounce_rate: rate(total_bounced, total_sent),
  };
}

/**
 * Calculate per-campaign metrics from actual hv_emails data.
 *
 * Joins campaigns with their linked emails and computes
 * sent/opened/replied/bounced counts + rates for each campaign.
 */
export async function calculateCampaignMetrics(
  accountId: string
): Promise<CampaignMetric[]> {
  const admin = createAdminClient();

  // Load campaigns
  const { data: campaigns, error: campaignError } = await admin
    .from("hv_campaigns")
    .select("id, name, status")
    .eq("kinetiks_id", accountId)
    .order("updated_at", { ascending: false });

  if (campaignError) {
    console.error("[analytics] Failed to query campaigns:", campaignError.message);
    throw new Error(`Failed to calculate campaign metrics: ${campaignError.message}`);
  }

  if (!campaigns || campaigns.length === 0) return [];

  const typedCampaigns = campaigns as CampaignRow[];
  const campaignIds = typedCampaigns.map((c) => c.id);

  // Load all emails linked to these campaigns (only sent ones)
  const { data: emails, error: emailError } = await admin
    .from("hv_emails")
    .select("campaign_id, sent_at, opened_at, replied_at, bounced_at")
    .eq("kinetiks_id", accountId)
    .in("campaign_id", campaignIds)
    .not("sent_at", "is", null);

  if (emailError) {
    console.error("[analytics] Failed to query campaign emails:", emailError.message);
    throw new Error(`Failed to calculate campaign metrics: ${emailError.message}`);
  }

  const typedEmails = (emails ?? []) as CampaignEmailRow[];

  // Group emails by campaign
  const emailsByCampaign = new Map<string, CampaignEmailRow[]>();
  for (const email of typedEmails) {
    if (!email.campaign_id) continue;
    const existing = emailsByCampaign.get(email.campaign_id) ?? [];
    existing.push(email);
    emailsByCampaign.set(email.campaign_id, existing);
  }

  // Build metrics for each campaign
  return typedCampaigns.map((campaign) => {
    const campaignEmails = emailsByCampaign.get(campaign.id) ?? [];
    const sent = campaignEmails.length;
    const opened = campaignEmails.filter((e) => e.opened_at !== null).length;
    const replied = campaignEmails.filter((e) => e.replied_at !== null).length;
    const bounced = campaignEmails.filter((e) => e.bounced_at !== null).length;

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      sent,
      opened,
      replied,
      bounced,
      open_rate: rate(opened, sent),
      reply_rate: rate(replied, sent),
    };
  });
}

/**
 * Calculate per-sequence metrics from actual hv_enrollments data.
 *
 * Counts enrollments by status for each sequence and computes
 * completion_rate and reply_rate.
 */
export async function calculateSequenceMetrics(
  accountId: string
): Promise<SequenceMetric[]> {
  const admin = createAdminClient();

  // Load sequences
  const { data: sequences, error: seqError } = await admin
    .from("hv_sequences")
    .select("id, name, status")
    .eq("kinetiks_id", accountId)
    .order("updated_at", { ascending: false });

  if (seqError) {
    console.error("[analytics] Failed to query sequences:", seqError.message);
    throw new Error(`Failed to calculate sequence metrics: ${seqError.message}`);
  }

  if (!sequences || sequences.length === 0) return [];

  const typedSequences = sequences as SequenceRow[];
  const sequenceIds = typedSequences.map((s) => s.id);

  // Load all enrollments for these sequences
  const { data: enrollments, error: enrollError } = await admin
    .from("hv_enrollments")
    .select("sequence_id, status")
    .eq("kinetiks_id", accountId)
    .in("sequence_id", sequenceIds);

  if (enrollError) {
    console.error("[analytics] Failed to query enrollments:", enrollError.message);
    throw new Error(`Failed to calculate sequence metrics: ${enrollError.message}`);
  }

  const typedEnrollments = (enrollments ?? []) as EnrollmentRow[];

  // Group enrollments by sequence
  const enrollmentsBySequence = new Map<string, EnrollmentRow[]>();
  for (const enrollment of typedEnrollments) {
    const existing = enrollmentsBySequence.get(enrollment.sequence_id) ?? [];
    existing.push(enrollment);
    enrollmentsBySequence.set(enrollment.sequence_id, existing);
  }

  // Build metrics for each sequence
  return typedSequences.map((sequence) => {
    const seqEnrollments = enrollmentsBySequence.get(sequence.id) ?? [];
    const enrolled = seqEnrollments.length;
    const completed = seqEnrollments.filter((e) => e.status === "completed").length;
    const replied = seqEnrollments.filter((e) => e.status === "replied").length;
    const bounced = seqEnrollments.filter((e) => e.status === "bounced").length;

    return {
      id: sequence.id,
      name: sequence.name,
      status: sequence.status,
      enrolled,
      completed,
      replied,
      bounced,
      completion_rate: rate(completed, enrolled),
      reply_rate: rate(replied, enrolled),
    };
  });
}
