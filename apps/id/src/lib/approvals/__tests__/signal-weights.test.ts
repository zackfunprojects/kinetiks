import { describe, it, expect } from "vitest";
import {
  SIGNAL_WEIGHTS,
  applySignalToThreshold,
  type InterventionSignal,
} from "../signal-weights";

describe("SIGNAL_WEIGHTS", () => {
  it("weights a kill at 2x a standard rejection (+20 vs +10)", () => {
    expect(SIGNAL_WEIGHTS.kill.thresholdDelta).toBe(20);
    expect(SIGNAL_WEIGHTS.undo.thresholdDelta).toBeLessThan(SIGNAL_WEIGHTS.kill.thresholdDelta);
  });

  it("treats undo + grab as contractions, non_intervention as an expansion", () => {
    expect(SIGNAL_WEIGHTS.undo.thresholdDelta).toBeGreaterThan(0);
    expect(SIGNAL_WEIGHTS.grab.thresholdDelta).toBeGreaterThan(0);
    expect(SIGNAL_WEIGHTS.non_intervention.thresholdDelta).toBeLessThan(0);
  });

  it("breaks the streak on every signal except non_intervention", () => {
    const breakers: InterventionSignal[] = ["kill", "undo", "grab", "edit"];
    breakers.forEach((s) => expect(SIGNAL_WEIGHTS[s].resetsStreak).toBe(true));
    expect(SIGNAL_WEIGHTS.non_intervention.resetsStreak).toBe(false);
  });

  it("only kill/undo/grab carry a dedicated ledger event type", () => {
    expect(SIGNAL_WEIGHTS.kill.ledgerEventType).toBe("task_killed");
    expect(SIGNAL_WEIGHTS.undo.ledgerEventType).toBe("intervention_undo");
    expect(SIGNAL_WEIGHTS.grab.ledgerEventType).toBe("intervention_grab");
    expect(SIGNAL_WEIGHTS.edit.ledgerEventType).toBeNull();
    expect(SIGNAL_WEIGHTS.non_intervention.ledgerEventType).toBeNull();
  });

  it("clamps the applied threshold to [0, 100]", () => {
    expect(applySignalToThreshold(90, "kill")).toBe(100); // 90+20 -> clamp 100
    expect(applySignalToThreshold(1, "non_intervention")).toBe(0); // 1-2 -> clamp 0
    expect(applySignalToThreshold(50, "undo")).toBe(55);
  });
});
