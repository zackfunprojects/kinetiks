import { describe, expect, it } from "vitest";
import { computeThresholdUpdate, computeInterventionUpdate } from "../threshold-math";

function startingThreshold(overrides: Partial<{
  auto_approve_threshold: number;
  consecutive_approvals: number;
  total_approvals: number;
  total_rejections: number;
}> = {}) {
  return {
    auto_approve_threshold: 100,
    consecutive_approvals: 0,
    total_approvals: 0,
    total_rejections: 0,
    ...overrides,
  };
}

describe("trust expansion (approved_clean)", () => {
  it("increments consecutive_approvals and total_approvals", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold(),
      event: "approved_clean",
    });
    expect(out.consecutive_approvals).toBe(1);
    expect(out.total_approvals).toBe(1);
    expect(out.auto_approve_threshold).toBe(100);
  });

  it("does NOT drop threshold before the 20-consecutive milestone", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ consecutive_approvals: 18 }),
      event: "approved_clean",
    });
    expect(out.consecutive_approvals).toBe(19);
    expect(out.auto_approve_threshold).toBe(100);
  });

  it("drops threshold by 5 at the 20th consecutive clean approval", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ consecutive_approvals: 19 }),
      event: "approved_clean",
    });
    expect(out.consecutive_approvals).toBe(20);
    expect(out.auto_approve_threshold).toBe(95);
  });

  it("drops threshold by another 5 at the 50th consecutive clean approval", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ consecutive_approvals: 49, auto_approve_threshold: 95 }),
      event: "approved_clean",
    });
    expect(out.consecutive_approvals).toBe(50);
    expect(out.auto_approve_threshold).toBe(90);
  });

  it("clamps threshold at 0 (never negative)", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ consecutive_approvals: 19, auto_approve_threshold: 3 }),
      event: "approved_clean",
    });
    expect(out.auto_approve_threshold).toBe(0);
  });
});

describe("approved_with_edits resets the streak but counts as approval", () => {
  it("zeros consecutive_approvals", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ consecutive_approvals: 17, total_approvals: 17 }),
      event: "approved_with_edits",
    });
    expect(out.consecutive_approvals).toBe(0);
    expect(out.total_approvals).toBe(18);
    expect(out.auto_approve_threshold).toBe(100);
  });

  it("computes the new approval_rate including the edit-approval", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ total_approvals: 7, total_rejections: 3 }),
      event: "approved_with_edits",
    });
    // 8 approvals / 11 total = 72.73
    expect(out.approval_rate).toBe(72.73);
    expect(out.total_approvals).toBe(8);
  });
});

describe("trust contraction (rejected)", () => {
  it("first rejection: +10 to threshold, resets consecutive", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({
        auto_approve_threshold: 75,
        consecutive_approvals: 12,
        total_approvals: 12,
      }),
      event: "rejected",
      recentRejections: 1,
    });
    expect(out.auto_approve_threshold).toBe(85);
    expect(out.consecutive_approvals).toBe(0);
    expect(out.total_rejections).toBe(1);
    expect(out.last_rejection_at).toBeDefined();
  });

  it("two rejections in 7 days: +20 to threshold", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ auto_approve_threshold: 75 }),
      event: "rejected",
      recentRejections: 2,
    });
    expect(out.auto_approve_threshold).toBe(95);
  });

  it("three rejections in 7 days: hard reset to 100 (always ask)", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ auto_approve_threshold: 65 }),
      event: "rejected",
      recentRejections: 3,
    });
    expect(out.auto_approve_threshold).toBe(100);
  });

  it("rejection clamps threshold at 100 maximum", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ auto_approve_threshold: 95 }),
      event: "rejected",
      recentRejections: 1,
    });
    expect(out.auto_approve_threshold).toBe(100); // 95 + 10 capped at 100
  });

  it("approval_rate recomputes after rejection", () => {
    const out = computeThresholdUpdate({
      existing: startingThreshold({ total_approvals: 10, total_rejections: 2 }),
      event: "rejected",
      recentRejections: 1,
    });
    // 10 approvals / 13 total = 76.92
    expect(out.approval_rate).toBe(76.92);
    expect(out.total_rejections).toBe(3);
  });
});

describe("trust contraction is one-way at the rejection layer", () => {
  it("recovers from contracted threshold only via 20+ clean approvals after rejection", () => {
    // After 1 rejection, threshold went from 75 → 85
    const afterReject = computeThresholdUpdate({
      existing: startingThreshold({
        auto_approve_threshold: 75,
        consecutive_approvals: 0,
        total_approvals: 12,
      }),
      event: "rejected",
      recentRejections: 1,
    });
    expect(afterReject.auto_approve_threshold).toBe(85);

    // 19 clean approvals later — no further drop
    let state = {
      auto_approve_threshold: afterReject.auto_approve_threshold,
      consecutive_approvals: afterReject.consecutive_approvals,
      total_approvals: afterReject.total_approvals,
      total_rejections: afterReject.total_rejections,
    };
    for (let i = 0; i < 19; i++) {
      const next = computeThresholdUpdate({ existing: state, event: "approved_clean" });
      state = {
        auto_approve_threshold: next.auto_approve_threshold,
        consecutive_approvals: next.consecutive_approvals,
        total_approvals: next.total_approvals,
        total_rejections: next.total_rejections,
      };
    }
    expect(state.auto_approve_threshold).toBe(85);
    expect(state.consecutive_approvals).toBe(19);

    // The 20th drops by 5
    const after20 = computeThresholdUpdate({ existing: state, event: "approved_clean" });
    expect(after20.auto_approve_threshold).toBe(80);
    expect(after20.consecutive_approvals).toBe(20);
  });
});

describe("intervention signals (computeInterventionUpdate)", () => {
  it("kill is 2x a rejection: +20 to threshold, resets streak, counts a rejection", () => {
    const out = computeInterventionUpdate({
      existing: startingThreshold({ auto_approve_threshold: 60, consecutive_approvals: 9, total_approvals: 9 }),
      signal: "kill",
    });
    expect(out.auto_approve_threshold).toBe(80); // 60 + 20
    expect(out.consecutive_approvals).toBe(0);
    expect(out.total_rejections).toBe(1);
    expect(out.last_rejection_at).toBeDefined();
  });

  it("undo is a weak rejection: +5, rejection-class", () => {
    const out = computeInterventionUpdate({
      existing: startingThreshold({ auto_approve_threshold: 50 }),
      signal: "undo",
    });
    expect(out.auto_approve_threshold).toBe(55);
    expect(out.total_rejections).toBe(1);
    expect(out.last_rejection_at).toBeDefined();
  });

  it("grab is a field-level penalty: +3, NOT a category rejection", () => {
    const out = computeInterventionUpdate({
      existing: startingThreshold({ auto_approve_threshold: 50, total_rejections: 2 }),
      signal: "grab",
    });
    expect(out.auto_approve_threshold).toBe(53);
    expect(out.consecutive_approvals).toBe(0);
    expect(out.total_rejections).toBe(2); // unchanged
    expect(out.last_rejection_at).toBeUndefined();
  });

  it("edit moves the threshold 0 but resets the streak (training signal)", () => {
    const out = computeInterventionUpdate({
      existing: startingThreshold({ auto_approve_threshold: 70, consecutive_approvals: 5 }),
      signal: "edit",
    });
    expect(out.auto_approve_threshold).toBe(70);
    expect(out.consecutive_approvals).toBe(0);
    expect(out.total_rejections).toBe(0);
  });

  it("non_intervention is a trust boost: -2, keeps the streak", () => {
    const out = computeInterventionUpdate({
      existing: startingThreshold({ auto_approve_threshold: 70, consecutive_approvals: 5 }),
      signal: "non_intervention",
    });
    expect(out.auto_approve_threshold).toBe(68);
    expect(out.consecutive_approvals).toBe(5); // preserved
    expect(out.last_rejection_at).toBeUndefined();
  });

  it("clamps to [0, 100]", () => {
    expect(
      computeInterventionUpdate({
        existing: startingThreshold({ auto_approve_threshold: 90 }),
        signal: "kill",
      }).auto_approve_threshold,
    ).toBe(100);
    expect(
      computeInterventionUpdate({
        existing: startingThreshold({ auto_approve_threshold: 1 }),
        signal: "non_intervention",
      }).auto_approve_threshold,
    ).toBe(0);
  });
});
