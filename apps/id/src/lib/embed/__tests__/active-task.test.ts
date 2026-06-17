import { describe, expect, it } from "vitest";
import { applySkipStep } from "../active-task";
import type { ActiveTaskStep } from "@kinetiks/types";

const STEPS: ActiveTaskStep[] = [
  { index: 0, app_name: "Dark Madder", label: "Draft blog post", status: "done" },
  { index: 1, app_name: "Harvest", label: "Build sequence", status: "working" },
  { index: 2, app_name: "Litmus", label: "Draft PR pitch", status: "queued" },
];

describe("applySkipStep (skip current step, §8.4)", () => {
  it("marks the skipped step skipped and advances the next queued step to working", () => {
    const out = applySkipStep(STEPS, 1, 1);
    expect(out.steps[1].status).toBe("skipped");
    expect(out.steps[2].status).toBe("working");
    expect(out.currentStepIndex).toBe(2);
  });

  it("does not advance the index past the last step", () => {
    const out = applySkipStep(STEPS, 2, 2);
    expect(out.steps[2].status).toBe("skipped");
    expect(out.currentStepIndex).toBe(2); // no step 3 — index unchanged
  });

  it("only promotes the next step when it is queued", () => {
    const allDone: ActiveTaskStep[] = STEPS.map((s) => ({ ...s, status: "done" }));
    const out = applySkipStep(allDone, 1, 1);
    expect(out.steps[1].status).toBe("skipped");
    expect(out.steps[2].status).toBe("done"); // not promoted
  });

  it("does not mutate the input array", () => {
    const copy = STEPS.map((s) => ({ ...s }));
    applySkipStep(STEPS, 1, 1);
    expect(STEPS).toEqual(copy);
  });
});
