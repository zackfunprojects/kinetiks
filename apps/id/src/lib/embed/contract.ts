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
  timestamp: z.string(),
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

export type PresenceRequest = z.infer<typeof presenceRequestSchema>;
export type AnnotationIntent = z.infer<typeof annotationIntentSchema>;
export type UndoRequest = z.infer<typeof undoRequestSchema>;
