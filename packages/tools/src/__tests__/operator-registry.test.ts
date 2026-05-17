import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  _resetOperatorRegistryForTests,
  getOperator,
  listAllOperators,
  listOperatorsForApp,
  registerOperators,
  ToolError,
} from "../index";
import type { OperatorDescriptor } from "@kinetiks/types";

afterEach(() => {
  _resetOperatorRegistryForTests();
});

const buildOperator = (overrides: Partial<OperatorDescriptor> = {}): OperatorDescriptor => ({
  key: "scout",
  description: "Sources prospects from the configured intel sources",
  inputs_schema: z.object({ icp: z.string() }),
  outputs_schema: z.object({ count: z.number().int().nonnegative() }),
  required_tools: ["noop_read"],
  required_patterns: [],
  action_classes: [],
  ...overrides,
});

describe("operator registry", () => {
  it("registers operators per app", () => {
    registerOperators("harvest", [buildOperator()]);
    expect(getOperator("harvest", "scout")).toBeDefined();
    expect(getOperator("dark_madder", "scout")).toBeUndefined();
  });

  it("is idempotent on identical re-registration", () => {
    registerOperators("harvest", [buildOperator()]);
    registerOperators("harvest", [buildOperator()]);
    expect(listOperatorsForApp("harvest")).toHaveLength(1);
  });

  it("rejects conflicting re-registration under same key", () => {
    registerOperators("harvest", [buildOperator()]);
    expect(() =>
      registerOperators("harvest", [
        buildOperator({ description: "different description for the conflict assertion" }),
      ]),
    ).toThrow(/conflicting/);
  });

  it("rejects invalid app key", () => {
    expect(() => registerOperators("BadApp", [buildOperator()])).toThrow(/snake_case/);
  });

  it("rejects invalid operator key", () => {
    expect(() => registerOperators("harvest", [buildOperator({ key: "BadOp" })])).toThrow(
      /snake_case/,
    );
  });

  it("rejects descriptor missing schemas", () => {
    const bad = { ...buildOperator(), inputs_schema: undefined as unknown as OperatorDescriptor["inputs_schema"] };
    expect(() => registerOperators("harvest", [bad])).toThrow(/Zod schema/);
  });

  it("listAllOperators returns both app and descriptor", () => {
    registerOperators("harvest", [buildOperator()]);
    registerOperators("dark_madder", [buildOperator({ key: "composer", description: "Composes content drafts from the editorial brief" })]);
    const all = listAllOperators();
    expect(all).toHaveLength(2);
    expect(all.map((e) => `${e.app}.${e.descriptor.key}`).sort()).toEqual([
      "dark_madder.composer",
      "harvest.scout",
    ]);
  });
});
