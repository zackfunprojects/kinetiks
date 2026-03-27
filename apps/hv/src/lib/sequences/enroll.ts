import type { SupabaseClient } from "@supabase/supabase-js";
import type { SequenceStep } from "@/types/sequences";
import type { EnrollResult, EnrollBatchResult } from "@/types/execution";

/** Row shape returned by hv_contacts select queries in this module. */
interface ContactRow {
  id: string;
  email: string | null;
  suppressed: boolean;
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * Calculate the first next_step_at based on the sequence steps.
 * If the first step is a delay, add delay_days. Otherwise, execute immediately.
 */
function calculateFirstStepAt(steps: SequenceStep[]): string {
  if (steps.length === 0) {
    return new Date().toISOString();
  }

  const firstStep = steps[0];
  if (firstStep.type === "delay" && firstStep.delay_days) {
    const date = new Date();
    date.setDate(date.getDate() + firstStep.delay_days);
    if (firstStep.delay_hours) {
      date.setHours(date.getHours() + firstStep.delay_hours);
    }
    return date.toISOString();
  }

  // For email or condition steps, execute immediately
  return new Date().toISOString();
}

/**
 * Enroll a single contact into a sequence.
 *
 * Checks:
 * 1. Contact is not suppressed
 * 2. Contact is not already enrolled in this sequence
 * 3. Sequence exists and has steps
 *
 * Creates the enrollment row and logs an activity.
 */
export async function enrollContact(
  admin: SupabaseClient,
  accountId: string,
  contactId: string,
  sequenceId: string,
  campaignId?: string,
): Promise<{ success: true; result: EnrollResult } | { success: false; error: string }> {
  // Load contact to check suppression
  const { data: contact, error: contactError } = await admin
    .from("hv_contacts")
    .select("id, email, suppressed, first_name, last_name")
    .eq("id", contactId)
    .eq("kinetiks_id", accountId)
    .single();

  if (contactError || !contact) {
    return { success: false, error: "Contact not found" };
  }

  if (contact.suppressed) {
    return { success: false, error: "Contact is suppressed" };
  }

  // Check email suppression list
  if (contact.email) {
    const { data: suppressed } = await admin.rpc("hv_check_suppression", {
      p_kinetiks_id: accountId,
      p_email: contact.email,
    });
    if (suppressed) {
      return { success: false, error: `Email ${contact.email} is on the suppression list` };
    }
  }

  // Check existing enrollment
  const { data: existing } = await admin
    .from("hv_enrollments")
    .select("id, status")
    .eq("contact_id", contactId)
    .eq("sequence_id", sequenceId)
    .maybeSingle();

  if (existing) {
    return { success: false, error: `Contact already enrolled (status: ${existing.status})` };
  }

  // Load sequence to get steps
  const { data: sequence, error: seqError } = await admin
    .from("hv_sequences")
    .select("id, name, steps, status")
    .eq("id", sequenceId)
    .eq("kinetiks_id", accountId)
    .single();

  if (seqError || !sequence) {
    return { success: false, error: "Sequence not found" };
  }

  // Assertion: hv_sequences.steps is jsonb; schema enforced at write time to match SequenceStep[]
  const steps = (sequence.steps ?? []) as SequenceStep[];
  if (steps.length === 0) {
    return { success: false, error: "Sequence has no steps" };
  }

  const nextStepAt = calculateFirstStepAt(steps);

  // Insert enrollment
  const { data: enrollment, error: insertError } = await admin
    .from("hv_enrollments")
    .insert({
      kinetiks_id: accountId,
      contact_id: contactId,
      sequence_id: sequenceId,
      campaign_id: campaignId ?? null,
      current_step: 0,
      status: "active",
      next_step_at: nextStepAt,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Log activity
  await admin
    .from("hv_activities")
    .insert({
      kinetiks_id: accountId,
      contact_id: contactId,
      type: "enrollment_started",
      content: {
        enrollment_id: enrollment.id,
        sequence_id: sequenceId,
        sequence_name: sequence.name,
        campaign_id: campaignId ?? null,
      },
      source_app: "harvest",
      source_operator: "sequence_engine",
    })
    .then(({ error: activityErr }) => {
      if (activityErr) console.error("[enroll] Failed to log activity:", activityErr.message);
    });

  return {
    success: true,
    result: {
      enrollment_id: enrollment.id,
      contact_id: contactId,
      next_step_at: nextStepAt,
    },
  };
}

/**
 * Enroll multiple contacts into a sequence.
 *
 * Filters out suppressed contacts and those already enrolled.
 * Returns counts of enrolled vs skipped.
 */
export async function enrollBatch(
  admin: SupabaseClient,
  accountId: string,
  contactIds: string[],
  sequenceId: string,
  campaignId?: string,
): Promise<EnrollBatchResult> {
  if (contactIds.length === 0) {
    return { enrolled: 0, skipped: 0, results: [] };
  }

  // Load sequence once for all contacts
  const { data: sequence, error: seqError } = await admin
    .from("hv_sequences")
    .select("id, name, steps, status")
    .eq("id", sequenceId)
    .eq("kinetiks_id", accountId)
    .single();

  if (seqError || !sequence) {
    return { enrolled: 0, skipped: contactIds.length, results: [] };
  }

  // Assertion: hv_sequences.steps is jsonb; schema enforced at write time to match SequenceStep[]
  const steps = (sequence.steps ?? []) as SequenceStep[];
  if (steps.length === 0) {
    return { enrolled: 0, skipped: contactIds.length, results: [] };
  }

  // Filter out suppressed contacts
  const { data: contacts } = await admin
    .from("hv_contacts")
    .select("id, email, suppressed")
    .in("id", contactIds)
    .eq("kinetiks_id", accountId);

  if (!contacts || contacts.length === 0) {
    return { enrolled: 0, skipped: contactIds.length, results: [] };
  }

  const activeContacts = (contacts as ContactRow[]).filter(
    (c) => !c.suppressed
  );

  // Filter out already-enrolled contacts
  const { data: existingEnrollments } = await admin
    .from("hv_enrollments")
    .select("contact_id")
    .eq("sequence_id", sequenceId)
    .in("contact_id", activeContacts.map((c) => c.id));

  const enrolledContactIds = new Set(
    // Assertion: Supabase .select("contact_id") returns rows with contact_id string field
    (existingEnrollments ?? []).map((e: { contact_id: string }) => e.contact_id)
  );

  const eligibleContacts = activeContacts.filter(
    (c) => !enrolledContactIds.has(c.id)
  );

  if (eligibleContacts.length === 0) {
    return {
      enrolled: 0,
      skipped: contactIds.length,
      results: [],
    };
  }

  // Check email suppressions in bulk
  const emailsToCheck = eligibleContacts
    .filter((c) => c.email)
    // Assertion: c.email is non-null after the filter above
    .map((c) => ({ id: c.id, email: c.email as string }));

  const suppressedContactIds = new Set<string>();

  // Check each email against the suppression list
  for (const { id, email } of emailsToCheck) {
    const { data: suppressed } = await admin.rpc("hv_check_suppression", {
      p_kinetiks_id: accountId,
      p_email: email,
    });
    if (suppressed) {
      suppressedContactIds.add(id);
    }
  }

  const finalContacts = eligibleContacts.filter(
    (c) => !suppressedContactIds.has(c.id)
  );

  if (finalContacts.length === 0) {
    return {
      enrolled: 0,
      skipped: contactIds.length,
      results: [],
    };
  }

  const nextStepAt = calculateFirstStepAt(steps);
  const now = new Date().toISOString();

  // Bulk insert enrollments
  const rows = finalContacts.map((c) => ({
    kinetiks_id: accountId,
    contact_id: c.id,
    sequence_id: sequenceId,
    campaign_id: campaignId ?? null,
    current_step: 0,
    status: "active",
    next_step_at: nextStepAt,
    started_at: now,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("hv_enrollments")
    .insert(rows)
    .select("id, contact_id");

  if (insertError || !inserted) {
    console.error("[enrollBatch] Insert failed:", insertError);
    return {
      enrolled: 0,
      skipped: contactIds.length,
      results: [],
    };
  }

  // Bulk log activities
  // Assertion: Supabase .select("id, contact_id") returns rows with these two string fields
  const activities = inserted.map((e: { id: string; contact_id: string }) => ({
    kinetiks_id: accountId,
    contact_id: e.contact_id,
    type: "enrollment_started",
    content: {
      enrollment_id: e.id,
      sequence_id: sequenceId,
      sequence_name: sequence.name,
      campaign_id: campaignId ?? null,
    },
    source_app: "harvest",
    source_operator: "sequence_engine",
  }));

  await admin
    .from("hv_activities")
    .insert(activities)
    .then(({ error: activityErr }) => {
      if (activityErr) console.error("[enrollBatch] Failed to log activities:", activityErr.message);
    });

  // Assertion: same inserted rows as above with id and contact_id fields
  const results: EnrollResult[] = inserted.map((e: { id: string; contact_id: string }) => ({
    enrollment_id: e.id,
    contact_id: e.contact_id,
    next_step_at: nextStepAt,
  }));

  return {
    enrolled: inserted.length,
    skipped: contactIds.length - inserted.length,
    results,
  };
}
