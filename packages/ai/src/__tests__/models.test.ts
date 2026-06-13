import { afterEach, describe, expect, it } from "vitest";

import {
  SEED_MODELS,
  familyOf,
  resolveModel,
  configureModelAssignmentReader,
  _resetModelAssignmentReaderForTests,
  type ModelRole,
} from "../models";

afterEach(() => {
  _resetModelAssignmentReaderForTests();
});

describe("resolveModel", () => {
  it("returns the seed pin for every role when no reader is configured", () => {
    expect(resolveModel("fast")).toBe(SEED_MODELS.fast);
    expect(resolveModel("balanced")).toBe(SEED_MODELS.balanced);
    expect(resolveModel("deep")).toBe(SEED_MODELS.deep);
  });

  it("returns the reader's assignment when one is configured", () => {
    configureModelAssignmentReader({
      getModel: (role: ModelRole) =>
        role === "balanced" ? "claude-sonnet-9-9" : null,
    });
    expect(resolveModel("balanced")).toBe("claude-sonnet-9-9");
  });

  it("falls back to the seed when the reader returns null for a role", () => {
    configureModelAssignmentReader({ getModel: () => null });
    expect(resolveModel("fast")).toBe(SEED_MODELS.fast);
  });

  it("falls back to the seed when the reader throws (never breaks the call path)", () => {
    configureModelAssignmentReader({
      getModel: () => {
        throw new Error("db unreachable");
      },
    });
    expect(resolveModel("deep")).toBe(SEED_MODELS.deep);
  });
});

describe("familyOf", () => {
  it("parses the three known families from concrete ids", () => {
    expect(familyOf("claude-haiku-4-5-20251001")).toBe("haiku");
    expect(familyOf("claude-sonnet-4-6")).toBe("sonnet");
    expect(familyOf("claude-opus-4-8")).toBe("opus");
  });

  it("returns null for ids outside the allowlisted families", () => {
    // Unknown / experimental families must never be auto-adopted.
    expect(familyOf("claude-fable-5")).toBeNull();
    expect(familyOf("some-other-model")).toBeNull();
  });
});

describe("SEED_MODELS", () => {
  it("pins a non-empty id for every role and carries no retired Sonnet 4 snapshot", () => {
    for (const id of Object.values(SEED_MODELS)) {
      expect(id.length).toBeGreaterThan(0);
      expect(id).not.toBe("claude-sonnet-4-20250514");
    }
  });
});
