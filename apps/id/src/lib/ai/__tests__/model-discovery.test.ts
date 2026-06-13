import { describe, expect, it } from "vitest";

import type { AnthropicModelInfo } from "@kinetiks/ai";
import {
  selectModelCandidates,
  type AssignmentState,
} from "../model-discovery";

function model(id: string, createdAtMs: number | null): AnthropicModelInfo {
  return { id, createdAtMs, displayName: id };
}

const ASSIGN: AssignmentState[] = [
  { role: "fast", assigned_model_id: "claude-haiku-4-5-20251001", frozen: false },
  { role: "balanced", assigned_model_id: "claude-sonnet-4-6", frozen: false },
  { role: "deep", assigned_model_id: "claude-opus-4-8", frozen: false },
];

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("selectModelCandidates", () => {
  it("proposes a flip when a strictly-newer model exists in a role's family", () => {
    const models = [
      model("claude-haiku-4-5-20251001", T0),
      model("claude-sonnet-4-6", T0),
      model("claude-sonnet-4-7", T0 + 30 * DAY), // newer balanced model
      model("claude-opus-4-8", T0),
    ];
    const candidates = selectModelCandidates(ASSIGN, models);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      role: "balanced",
      from_model: "claude-sonnet-4-6",
      to_model: "claude-sonnet-4-7",
      family: "sonnet",
    });
  });

  it("proposes nothing when every role is already on the newest model", () => {
    const models = [
      model("claude-haiku-4-5-20251001", T0),
      model("claude-sonnet-4-6", T0),
      model("claude-opus-4-8", T0),
    ];
    expect(selectModelCandidates(ASSIGN, models)).toEqual([]);
  });

  it("never proposes an unfamiliar/experimental family (allowlist)", () => {
    const models = [
      model("claude-haiku-4-5-20251001", T0),
      model("claude-sonnet-4-6", T0),
      model("claude-opus-4-8", T0),
      // A new family the system doesn't map to any role.
      model("claude-fable-5", T0 + 90 * DAY),
    ];
    expect(selectModelCandidates(ASSIGN, models)).toEqual([]);
  });

  it("is forward-only: an OLDER model in-family is never proposed", () => {
    const models = [
      model("claude-haiku-4-5-20251001", T0),
      model("claude-sonnet-4-6", T0),
      model("claude-sonnet-4-5-old", T0 - 60 * DAY), // older sonnet present
      model("claude-opus-4-8", T0),
    ];
    expect(selectModelCandidates(ASSIGN, models)).toEqual([]);
  });

  it("skips a frozen role even when a newer model exists", () => {
    const frozen: AssignmentState[] = [
      { role: "balanced", assigned_model_id: "claude-sonnet-4-6", frozen: true },
    ];
    const models = [
      model("claude-sonnet-4-6", T0),
      model("claude-sonnet-4-7", T0 + 30 * DAY),
    ];
    expect(selectModelCandidates(frozen, models)).toEqual([]);
  });

  it("proposes the newest when the assigned model has vanished from the list (deprecated)", () => {
    // assigned sonnet-4-6 is no longer returned by the API; newest is 4-7.
    const models = [
      model("claude-haiku-4-5-20251001", T0),
      model("claude-sonnet-4-7", T0 + 30 * DAY),
      model("claude-opus-4-8", T0),
    ];
    const candidates = selectModelCandidates(ASSIGN, models);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ role: "balanced", to_model: "claude-sonnet-4-7" });
  });

  it("proposes nothing for a role whose family is absent from the list", () => {
    // No opus model returned at all → deep role has no candidate.
    const models = [model("claude-sonnet-4-6", T0), model("claude-haiku-4-5-20251001", T0)];
    const candidates = selectModelCandidates(
      [{ role: "deep", assigned_model_id: "claude-opus-4-8", frozen: false }],
      models,
    );
    expect(candidates).toEqual([]);
  });

  it("picks the newest when multiple newer models exist in the family", () => {
    const models = [
      model("claude-sonnet-4-6", T0),
      model("claude-sonnet-4-7", T0 + 30 * DAY),
      model("claude-sonnet-4-8", T0 + 60 * DAY),
    ];
    const candidates = selectModelCandidates(
      [{ role: "balanced", assigned_model_id: "claude-sonnet-4-6", frozen: false }],
      models,
    );
    expect(candidates[0].to_model).toBe("claude-sonnet-4-8");
    expect(candidates[0].released_at_ms).toBe(T0 + 60 * DAY);
  });
});
