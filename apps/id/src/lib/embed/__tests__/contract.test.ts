import { describe, it, expect } from "vitest";
import {
  presenceRequestSchema,
  annotationIntentSchema,
  undoRequestSchema,
} from "../contract";

describe("presenceRequestSchema", () => {
  it("accepts a well-formed presence beat", () => {
    const r = presenceRequestSchema.safeParse({
      thread_id: "thr-1",
      event: {
        participant: "user",
        event_type: "focus",
        target: { component_id: "subject", field_name: "subject_line" },
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown event_type", () => {
    const r = presenceRequestSchema.safeParse({
      thread_id: "thr-1",
      event: {
        participant: "user",
        event_type: "teleport",
        target: { component_id: "x" },
        timestamp: "t",
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    const r = presenceRequestSchema.safeParse({
      thread_id: "thr-1",
      event: {
        participant: "user",
        event_type: "focus",
        target: { component_id: "x" },
        timestamp: "not-a-date",
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing thread_id", () => {
    const r = presenceRequestSchema.safeParse({
      event: {
        participant: "agent",
        event_type: "uncertain",
        target: { component_id: "x" },
        timestamp: "t",
      },
    });
    expect(r.success).toBe(false);
  });
});

describe("annotationIntentSchema", () => {
  it("accepts a create intent and defaults position to below", () => {
    const r = annotationIntentSchema.safeParse({
      op: "create",
      thread_id: "thr-1",
      kind: "decision_note",
      component_id: "subject",
      field_name: "subject_line",
      summary: "Chose directness",
      body: "Voice profile emphasizes directness.",
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.op === "create") expect(r.data.position).toBe("below");
  });

  it("accepts a dismiss intent and requires a uuid", () => {
    expect(
      annotationIntentSchema.safeParse({
        op: "dismiss",
        thread_id: "thr-1",
        annotation_id: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(true);
    expect(
      annotationIntentSchema.safeParse({
        op: "dismiss",
        thread_id: "thr-1",
        annotation_id: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});

describe("undoRequestSchema", () => {
  it("requires a uuid action_id", () => {
    expect(
      undoRequestSchema.safeParse({
        thread_id: "thr-1",
        action_id: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(true);
    expect(undoRequestSchema.safeParse({ thread_id: "thr-1", action_id: "x" }).success).toBe(false);
  });
});
