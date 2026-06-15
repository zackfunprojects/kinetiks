import { describe, it, expect } from "vitest";
import type { CommandResponse } from "@kinetiks/synapse";
import type { AppPanelOpen } from "@kinetiks/types";
import { aggregateResponses } from "../command-aggregator";

const panel: AppPanelOpen = {
  app_name: "harvest",
  entity_id: "seq_123",
  mode: "collaborative",
};

function success(
  app: string,
  data: Record<string, unknown>,
  extra: Partial<CommandResponse> = {}
): CommandResponse {
  return {
    command_id: `${app}-cmd`,
    app_name: app,
    status: "success",
    data,
    duration_ms: 5,
    ...extra,
  };
}

describe("aggregateResponses app_panel_open", () => {
  it("surfaces the first panel-open signal from a successful response", () => {
    const result = aggregateResponses([
      success("dm", { message: "drafted" }),
      success("harvest", { message: "sequence built" }, { app_panel_open: panel }),
    ]);
    expect(result.app_panel_open).toEqual(panel);
  });

  it("leaves app_panel_open undefined when no response requests a panel", () => {
    const result = aggregateResponses([success("dm", { message: "drafted" })]);
    expect(result.app_panel_open).toBeUndefined();
  });

  it("does not surface a panel from a failed-only result", () => {
    const result = aggregateResponses([
      {
        command_id: "x",
        app_name: "harvest",
        status: "error",
        data: null,
        error: "down",
        duration_ms: 1,
      },
    ]);
    expect(result.app_panel_open).toBeUndefined();
    expect(result.has_errors).toBe(true);
  });
});
