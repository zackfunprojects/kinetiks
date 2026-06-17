import { z } from "zod";

/**
 * Request contracts for the embed API routes (`/api/id/embed/*`). These
 * validate the shapes coming from the embed surface before any account-scoped
 * action. The collaborative data types live in @kinetiks/types; these are the
 * runtime validators for the wire.
 */

export const presenceEventSchema = z.object({
  participant: z.enum(["agent", "user"]),
  event_type: z.enum(["focus", "blur", "select", "type", "scroll", "hover", "uncertain"]),
  target: z.object({
    component_id: z.string().min(1),
    field_name: z.string().optional(),
    coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  metadata: z
    .object({
      uncertainty_reason: z.string().optional(),
      selection_range: z.object({ start: z.number(), end: z.number() }).optional(),
      typing_content: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().datetime(),
});

export const presenceRequestSchema = z.object({
  thread_id: z.string().min(1),
  event: presenceEventSchema,
});

export const annotationIntentSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    thread_id: z.string().min(1),
    kind: z.enum(["decision_note", "data_reference", "skip_note", "suggestion"]),
    component_id: z.string().min(1),
    field_name: z.string().min(1),
    position: z.enum(["above", "below", "inline", "tooltip"]).default("below"),
    summary: z.string().min(1),
    body: z.string().min(1),
  }),
  z.object({ op: z.literal("dismiss"), thread_id: z.string().min(1), annotation_id: z.string().uuid() }),
  z.object({ op: z.literal("pin"), thread_id: z.string().min(1), annotation_id: z.string().uuid() }),
  z.object({
    op: z.literal("reply"),
    thread_id: z.string().min(1),
    annotation_id: z.string().uuid(),
    body: z.string().min(1),
  }),
]);

export const undoRequestSchema = z.object({
  thread_id: z.string().min(1),
  action_id: z.string().uuid(),
});

export const workspaceActionSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("record"),
    thread_id: z.string().min(1),
    participant: z.enum(["agent", "user"]),
    action_type: z.enum([
      "field_update",
      "entity_create",
      "entity_delete",
      "reorder",
      "configuration",
    ]),
    target: z.string().min(1),
    previous_value: z.unknown().optional(),
    new_value: z.unknown().optional(),
  }),
  z.object({
    op: z.literal("undo"),
    thread_id: z.string().min(1),
    action_id: z.string().uuid(),
  }),
]);

export type PresenceRequest = z.infer<typeof presenceRequestSchema>;
export type AnnotationIntent = z.infer<typeof annotationIntentSchema>;
export type UndoRequest = z.infer<typeof undoRequestSchema>;
export type WorkspaceActionRequest = z.infer<typeof workspaceActionSchema>;

/**
 * The reference surface is a sequence builder; its intervention signals (kill,
 * undo, grab) and in-panel approvals all calibrate one representative action
 * category. A real suite app would carry the actual category for the work.
 */
export const REFERENCE_ACTION_CATEGORY = "sequence_adjustment" as const;

// ── Task drawer (spec §8) — kinetiks_active_tasks lifecycle ──────────
const taskStepSchema = z.object({
  index: z.number().int().min(0),
  app_name: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["queued", "working", "done", "skipped", "failed"]),
});

export const activeTaskSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("open"),
    thread_id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    app_name: z.string().min(1),
    steps: z.array(taskStepSchema).default([]),
    current_step_index: z.number().int().min(0).default(0),
    progress: z.number().int().min(0).max(100).default(0),
    command_id: z.string().optional(),
  }),
  z.object({
    op: z.literal("progress"),
    thread_id: z.string().min(1),
    task_id: z.string().uuid(),
    progress: z.number().int().min(0).max(100).optional(),
    current_step_index: z.number().int().min(0).optional(),
    steps: z.array(taskStepSchema).optional(),
  }),
  z.object({ op: z.literal("pause"), thread_id: z.string().min(1), task_id: z.string().uuid() }),
  z.object({ op: z.literal("resume"), thread_id: z.string().min(1), task_id: z.string().uuid() }),
  z.object({ op: z.literal("complete"), thread_id: z.string().min(1), task_id: z.string().uuid() }),
  z.object({
    op: z.literal("skip_step"),
    thread_id: z.string().min(1),
    task_id: z.string().uuid(),
    step_index: z.number().int().min(0),
  }),
]);

export type ActiveTaskRequest = z.infer<typeof activeTaskSchema>;

// Kill is a dedicated route (`/api/id/embed/active-task/kill`): it transitions
// the task, reverts in-progress agent work via the undo stack, and fires the 2×
// kill learning signal (§8.3). Distinct from the lifecycle ops above.
export const killTaskSchema = z.object({
  thread_id: z.string().min(1),
  task_id: z.string().uuid(),
  reason_code: z.enum(["wrong_tone", "wrong_data", "wrong_approach", "wrong_target", "other"]),
  feedback: z.string().max(2000).optional(),
});

export type KillTaskRequest = z.infer<typeof killTaskSchema>;

// ── Intervention signal (spec §9.3) — grab. (Undo folds into the
//    workspace-actions route, where the undo already happens.) ─────────
export const interventionSchema = z.object({
  signal: z.literal("grab"),
  component_id: z.string().min(1),
  field_name: z.string().optional(),
});

export type InterventionRequest = z.infer<typeof interventionSchema>;

// ── In-panel visual approval (spec §9.1) ────────────────────────────
export const embedApprovalSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({
    decision: z.literal("approve_with_edits"),
    original: z.record(z.unknown()),
    edited: z.record(z.unknown()),
  }),
  z.object({ decision: z.literal("reject"), reason: z.string().min(1).max(2000) }),
]);

export type EmbedApprovalRequest = z.infer<typeof embedApprovalSchema>;
