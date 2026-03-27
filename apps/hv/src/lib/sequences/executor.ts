import type { SupabaseClient } from "@supabase/supabase-js";
import type { SequenceStep } from "@/types/sequences";
import type { HvEnrollment, StepExecutionResult } from "@/types/execution";
import { sendHarvestEmail } from "@/lib/email/send";

/**
 * Execute the current step for an enrollment.
 *
 * Handles three step types:
 * - email: creates draft in hv_emails, sends via sendHarvestEmail
 * - delay: calculates next_step_at and waits for CRON
 * - condition: checks email engagement signals, routes accordingly
 *
 * After execution, advances current_step and calculates next timing.
 */
export async function executeStep(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
): Promise<StepExecutionResult> {
  // 1. Load sequence
  const { data: sequence, error: seqError } = await admin
    .from("hv_sequences")
    .select("id, name, steps")
    .eq("id", enrollment.sequence_id)
    .single();

  if (seqError || !sequence) {
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "unknown",
      action: "error",
      detail: "Sequence not found",
    };
  }

  const steps = (sequence.steps ?? []) as SequenceStep[];

  // 2. Get current step
  if (enrollment.current_step >= steps.length) {
    // Already past all steps - mark completed
    await markCompleted(admin, enrollment);
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "none",
      action: "completed",
      detail: "All steps completed",
    };
  }

  const step = steps[enrollment.current_step];
  let result: StepExecutionResult;

  // 3. Execute based on step type
  switch (step.type) {
    case "email":
      result = await executeEmailStep(admin, enrollment, step, sequence.name);
      break;
    case "delay":
      result = await executeDelayStep(admin, enrollment, step);
      break;
    case "condition":
      result = await executeConditionStep(admin, enrollment, step, steps);
      break;
    default:
      result = {
        enrollment_id: enrollment.id,
        step_index: enrollment.current_step,
        step_type: step.type,
        action: "error",
        detail: `Unknown step type: ${step.type}`,
      };
  }

  return result;
}

/**
 * Execute an email step: create draft, send it, advance.
 */
async function executeEmailStep(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
  step: SequenceStep,
  sequenceName: string,
): Promise<StepExecutionResult> {
  // Load contact
  const { data: contact, error: contactError } = await admin
    .from("hv_contacts")
    .select("id, email, first_name, last_name")
    .eq("id", enrollment.contact_id)
    .single();

  if (contactError || !contact) {
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "email",
      action: "error",
      detail: "Contact not found",
    };
  }

  if (!contact.email) {
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "email",
      action: "error",
      detail: "Contact has no email address",
    };
  }

  // Create email draft in hv_emails
  const { data: emailRow, error: emailError } = await admin
    .from("hv_emails")
    .insert({
      kinetiks_id: enrollment.kinetiks_id,
      contact_id: enrollment.contact_id,
      sequence_id: enrollment.sequence_id,
      campaign_id: enrollment.campaign_id,
      step_number: enrollment.current_step,
      subject: step.subject_line ?? `Step ${enrollment.current_step + 1}`,
      body: step.template ?? "",
      body_plain: null,
      status: "draft",
    })
    .select("id")
    .single();

  if (emailError || !emailRow) {
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "email",
      action: "error",
      detail: `Failed to create email draft: ${emailError?.message ?? "unknown error"}`,
    };
  }

  // Send the email
  const sendResult = await sendHarvestEmail(emailRow.id, enrollment.kinetiks_id);

  if (!sendResult.success) {
    // Don't advance - CRON will retry next run
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "email",
      action: "error",
      detail: `Send failed: ${sendResult.error ?? "unknown"}. Will retry on next CRON run.`,
    };
  }

  // Advance to next step
  const steps = await loadSteps(admin, enrollment.sequence_id);
  await advanceStep(admin, enrollment, steps);

  // Log activity
  await logActivity(admin, enrollment, "email_sequence_sent", {
    email_id: emailRow.id,
    step_number: enrollment.current_step,
    sequence_name: sequenceName,
    subject: step.subject_line,
    to: contact.email,
  });

  return {
    enrollment_id: enrollment.id,
    step_index: enrollment.current_step,
    step_type: "email",
    action: "executed",
    detail: `Email sent to ${contact.email}`,
  };
}

/**
 * Execute a delay step: calculate next_step_at and update enrollment.
 * The CRON will pick this up once the delay has elapsed.
 */
async function executeDelayStep(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
  step: SequenceStep,
): Promise<StepExecutionResult> {
  const delayDays = step.delay_days ?? 1;
  const delayHours = step.delay_hours ?? 0;

  const nextAt = new Date();
  nextAt.setDate(nextAt.getDate() + delayDays);
  nextAt.setHours(nextAt.getHours() + delayHours);

  // Advance past the delay step, set next_step_at for the step after delay
  const nextStep = enrollment.current_step + 1;

  await admin
    .from("hv_enrollments")
    .update({
      current_step: nextStep,
      next_step_at: nextAt.toISOString(),
    })
    .eq("id", enrollment.id);

  return {
    enrollment_id: enrollment.id,
    step_index: enrollment.current_step,
    step_type: "delay",
    action: "delayed",
    detail: `Waiting ${delayDays}d ${delayHours}h. Next step at ${nextAt.toISOString()}`,
  };
}

/**
 * Execute a condition step: check engagement signals and route accordingly.
 *
 * Conditions:
 * - replied: any email for this enrollment has replied_at IS NOT NULL
 * - opened: any email has opened_at IS NOT NULL
 * - clicked: any email has clicked_at IS NOT NULL
 * - bounced: any email has status = 'bounced'
 *
 * Actions:
 * - stop: mark enrollment completed
 * - skip: advance current_step by 2 (skip next step)
 * - (default): advance normally
 */
async function executeConditionStep(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
  step: SequenceStep,
  allSteps: SequenceStep[],
): Promise<StepExecutionResult> {
  const conditionType = step.condition_type;
  const conditionAction = step.condition_action ?? "stop";

  if (!conditionType) {
    // No condition set - advance normally
    await advanceStep(admin, enrollment, allSteps);
    return {
      enrollment_id: enrollment.id,
      step_index: enrollment.current_step,
      step_type: "condition",
      action: "condition_not_met",
      detail: "No condition type specified, advancing",
    };
  }

  // Check condition against hv_emails for this enrollment
  let conditionMet = false;

  const { data: emails } = await admin
    .from("hv_emails")
    .select("id, status, opened_at, clicked_at, replied_at")
    .eq("kinetiks_id", enrollment.kinetiks_id)
    .eq("contact_id", enrollment.contact_id)
    .eq("sequence_id", enrollment.sequence_id);

  if (emails && emails.length > 0) {
    switch (conditionType) {
      case "replied":
        conditionMet = emails.some(
          (e: { replied_at: string | null }) => e.replied_at !== null
        );
        break;
      case "opened":
        conditionMet = emails.some(
          (e: { opened_at: string | null }) => e.opened_at !== null
        );
        break;
      case "clicked":
        conditionMet = emails.some(
          (e: { clicked_at: string | null }) => e.clicked_at !== null
        );
        break;
      case "bounced":
        conditionMet = emails.some(
          (e: { status: string }) => e.status === "bounced"
        );
        break;
    }
  }

  if (conditionMet) {
    if (conditionAction === "stop") {
      await markCompleted(admin, enrollment);
      await logActivity(admin, enrollment, "enrollment_condition_stop", {
        condition: conditionType,
        step_number: enrollment.current_step,
      });
      return {
        enrollment_id: enrollment.id,
        step_index: enrollment.current_step,
        step_type: "condition",
        action: "condition_met",
        detail: `Condition "${conditionType}" met - stopping sequence`,
      };
    }

    if (conditionAction === "skip") {
      // Skip next step (advance by 2 instead of 1)
      const skipTo = enrollment.current_step + 2;
      if (skipTo >= allSteps.length) {
        await markCompleted(admin, enrollment);
        return {
          enrollment_id: enrollment.id,
          step_index: enrollment.current_step,
          step_type: "condition",
          action: "completed",
          detail: `Condition "${conditionType}" met - skipped past end, sequence complete`,
        };
      }

      const nextStepAt = calculateNextStepAt(allSteps, skipTo);
      await admin
        .from("hv_enrollments")
        .update({
          current_step: skipTo,
          next_step_at: nextStepAt,
        })
        .eq("id", enrollment.id);

      return {
        enrollment_id: enrollment.id,
        step_index: enrollment.current_step,
        step_type: "condition",
        action: "condition_met",
        detail: `Condition "${conditionType}" met - skipping to step ${skipTo}`,
      };
    }
  }

  // Condition not met (or unknown action) - advance normally
  await advanceStep(admin, enrollment, allSteps);

  return {
    enrollment_id: enrollment.id,
    step_index: enrollment.current_step,
    step_type: "condition",
    action: "condition_not_met",
    detail: `Condition "${conditionType}" not met - advancing normally`,
  };
}

/**
 * Advance the enrollment to the next step, or mark completed if done.
 */
async function advanceStep(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
  allSteps: SequenceStep[],
): Promise<void> {
  const nextStep = enrollment.current_step + 1;

  if (nextStep >= allSteps.length) {
    await markCompleted(admin, enrollment);
    return;
  }

  const nextStepAt = calculateNextStepAt(allSteps, nextStep);

  await admin
    .from("hv_enrollments")
    .update({
      current_step: nextStep,
      next_step_at: nextStepAt,
    })
    .eq("id", enrollment.id);
}

/**
 * Calculate when the next step should execute.
 * If the next step is a delay, add the delay. Otherwise, execute immediately.
 */
function calculateNextStepAt(steps: SequenceStep[], stepIndex: number): string {
  if (stepIndex >= steps.length) {
    return new Date().toISOString();
  }

  const nextStep = steps[stepIndex];
  if (nextStep.type === "delay") {
    const date = new Date();
    date.setDate(date.getDate() + (nextStep.delay_days ?? 1));
    if (nextStep.delay_hours) {
      date.setHours(date.getHours() + nextStep.delay_hours);
    }
    return date.toISOString();
  }

  // Email or condition steps execute immediately
  return new Date().toISOString();
}

/**
 * Mark an enrollment as completed.
 */
async function markCompleted(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
): Promise<void> {
  const now = new Date().toISOString();

  await admin
    .from("hv_enrollments")
    .update({
      status: "completed",
      completed_at: now,
      next_step_at: null,
    })
    .eq("id", enrollment.id);

  await logActivity(admin, enrollment, "enrollment_completed", {
    sequence_id: enrollment.sequence_id,
    campaign_id: enrollment.campaign_id,
    steps_completed: enrollment.current_step + 1,
  });
}

/**
 * Load steps for a sequence.
 */
async function loadSteps(
  admin: SupabaseClient,
  sequenceId: string,
): Promise<SequenceStep[]> {
  const { data } = await admin
    .from("hv_sequences")
    .select("steps")
    .eq("id", sequenceId)
    .single();

  return (data?.steps ?? []) as SequenceStep[];
}

/**
 * Log an activity for the enrollment's contact.
 */
async function logActivity(
  admin: SupabaseClient,
  enrollment: HvEnrollment,
  type: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("hv_activities")
    .insert({
      kinetiks_id: enrollment.kinetiks_id,
      contact_id: enrollment.contact_id,
      type,
      content: detail,
      source_app: "harvest",
      source_operator: "sequence_engine",
    })
    .then(({ error: activityErr }) => {
      if (activityErr) console.error(`[executor] Failed to log activity (${type}):`, activityErr.message);
    });
}
