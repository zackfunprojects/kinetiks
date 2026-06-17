/**
 * Integration-seam tests for applyInterventionSignal (§8.3 kill, §9.3 undo/grab).
 * The pure delta math is covered in threshold-math.test.ts; this verifies the
 * persistence + Ledger wiring: the calibrated threshold is written (UPDATE vs
 * INSERT), rejection-class signals stamp last_rejection_at, and the right
 * fixture-labeled Ledger event type fires for exactly the right signals.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApprovalThreshold } from "../types";

const h = vi.hoisted(() => {
  const writes: Array<{ table: string; op: "update" | "insert"; vals: Record<string, unknown> }> = [];
  const stubAdmin = {
    from(table: string) {
      return {
        update(vals: Record<string, unknown>) {
          return {
            eq() {
              writes.push({ table, op: "update", vals });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(vals: Record<string, unknown>) {
          writes.push({ table, op: "insert", vals });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  const state: { current: ApprovalThreshold } = { current: {} as ApprovalThreshold };
  return { writes, stubAdmin, state };
});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.stubAdmin }));
vi.mock("../threshold", () => ({ getThreshold: () => Promise.resolve(h.state.current) }));

import { applyInterventionSignal } from "../intervention-signals";

function threshold(overrides: Partial<ApprovalThreshold> = {}): ApprovalThreshold {
  return {
    id: "thr-1",
    account_id: "acct-1",
    action_category: "sequence_adjustment",
    auto_approve_threshold: 60,
    override_rule: null,
    consecutive_approvals: 0,
    total_approvals: 0,
    total_rejections: 0,
    approval_rate: 0,
    edit_rate: 0,
    last_rejection_at: null,
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

const ledgerWrites = () => h.writes.filter((w) => w.table === "kinetiks_ledger");
const thresholdWrites = () => h.writes.filter((w) => w.table === "kinetiks_approval_thresholds");

beforeEach(() => {
  h.writes.length = 0;
  h.state.current = threshold();
});

describe("applyInterventionSignal", () => {
  it("kill applies the 2x delta (+20) and writes a task_killed ledger entry", async () => {
    h.state.current = threshold({ auto_approve_threshold: 60 });
    await applyInterventionSignal("acct-1", "sequence_adjustment", "kill", {
      extra: { task_id: "task-1", reason_code: "wrong_tone" },
    });

    const tw = thresholdWrites();
    expect(tw).toHaveLength(1);
    expect(tw[0].op).toBe("update"); // existing.id present
    expect(tw[0].vals.auto_approve_threshold).toBe(80);
    expect(tw[0].vals.total_rejections).toBe(1);
    expect(tw[0].vals.last_rejection_at).toBeDefined();

    const lw = ledgerWrites();
    expect(lw).toHaveLength(1);
    expect(lw[0].vals.event_type).toBe("task_killed");
    expect(lw[0].vals.source_app).toBe("kinetiks_fixtures");
    const detail = lw[0].vals.detail as Record<string, unknown>;
    expect(detail.is_fixture).toBe(true);
    expect(detail.signal).toBe("kill");
    expect(detail.threshold_delta).toBe(20);
    expect(detail.task_id).toBe("task-1");
  });

  it("undo writes an intervention_undo entry and counts a rejection", async () => {
    h.state.current = threshold({ auto_approve_threshold: 50 });
    await applyInterventionSignal("acct-1", "sequence_adjustment", "undo");
    expect(thresholdWrites()[0].vals.auto_approve_threshold).toBe(55);
    expect(thresholdWrites()[0].vals.last_rejection_at).toBeDefined();
    expect(ledgerWrites()[0].vals.event_type).toBe("intervention_undo");
  });

  it("grab writes intervention_grab but does NOT count a category rejection", async () => {
    h.state.current = threshold({ auto_approve_threshold: 50, total_rejections: 2 });
    await applyInterventionSignal("acct-1", "sequence_adjustment", "grab");
    const tw = thresholdWrites()[0];
    expect(tw.vals.auto_approve_threshold).toBe(53);
    expect(tw.vals.total_rejections).toBe(2); // unchanged
    expect(tw.vals.last_rejection_at).toBeUndefined();
    expect(ledgerWrites()[0].vals.event_type).toBe("intervention_grab");
  });

  it("edit and non_intervention write NO ledger entry", async () => {
    await applyInterventionSignal("acct-1", "sequence_adjustment", "edit");
    expect(ledgerWrites()).toHaveLength(0);
    h.writes.length = 0;
    await applyInterventionSignal("acct-1", "sequence_adjustment", "non_intervention");
    expect(ledgerWrites()).toHaveLength(0);
  });

  it("inserts a threshold row when none exists yet (no id)", async () => {
    h.state.current = threshold({ id: "" });
    await applyInterventionSignal("acct-1", "sequence_adjustment", "kill");
    const tw = thresholdWrites()[0];
    expect(tw.op).toBe("insert");
    expect(tw.vals.account_id).toBe("acct-1");
    expect(tw.vals.action_category).toBe("sequence_adjustment");
  });
});
