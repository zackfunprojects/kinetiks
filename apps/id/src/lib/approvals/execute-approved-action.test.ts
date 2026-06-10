import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeTool, startAgentRun, getTool, emitInsight } = vi.hoisted(() => {
  const invokeTool = vi.fn();
  return {
    invokeTool,
    startAgentRun: vi.fn(() => ({ invokeTool })),
    getTool: vi.fn(),
    emitInsight: vi.fn(),
  };
});

vi.mock("@kinetiks/runtime", () => ({ startAgentRun }));
vi.mock("@kinetiks/tools", () => ({
  getTool,
  ToolError: class ToolError extends Error {
    errorClass: string;
    constructor(errorClass: string, message: string) {
      super(message);
      this.errorClass = errorClass;
    }
  },
}));
vi.mock("@/lib/tools/availability", () => ({ platformAvailabilityResolvers: {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/insights", () => ({ emitInsight }));

import { executeApprovedAction } from "./execute-approved-action";
import type { ApprovalRecord } from "./types";

function approval(preview: ApprovalRecord["preview"]): ApprovalRecord {
  return {
    id: "appr-1",
    account_id: "acc-1",
    source_app: "kinetiks_id",
    source_operator: "marcus",
    action_category: "kinetiks_id.send_slack_notification",
    approval_type: "review",
    title: "Send slack notification",
    description: null,
    preview,
    deep_link: null,
    status: "approved",
    confidence_score: null,
    confidence_breakdown: null,
    auto_approved: false,
    user_edits: null,
    rejection_reason: null,
    rejection_classification: null,
    edit_classification: null,
    brand_gate_result: null,
    quality_gate_result: null,
    expires_at: null,
    created_at: "2026-06-10T00:00:00Z",
    acted_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("executeApprovedAction", () => {
  it("ignores an approval whose preview is not a tool action", async () => {
    const ran = await executeApprovedAction(
      approval({ type: "context_edit", content: {} }),
    );
    expect(ran).toBe(false);
    expect(getTool).not.toHaveBeenCalled();
    expect(startAgentRun).not.toHaveBeenCalled();
  });

  it("re-runs an approved tool action through the runtime as pre-approved, grant pinned", async () => {
    const tool = { name: "send_slack_notification" };
    getTool.mockReturnValue(tool);
    invokeTool.mockResolvedValue({ ok: true });

    const ran = await executeApprovedAction(
      approval({
        type: "tool_action",
        content: {
          tool_name: "send_slack_notification",
          action_class: "kinetiks_id.send_slack_notification",
          action_input: { channel: "general", message: "we hit the goal" },
          invoked_by_agent: "marcus",
          grant_id: "grant-9",
        },
      }),
    );

    expect(ran).toBe(true);
    expect(startAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-1", invokedByAgent: "marcus" }),
    );
    // The decisive assertion: the action runs preApproved (so the runtime
    // does NOT re-resolve and re-queue) with the approval + grant pinned.
    expect(invokeTool).toHaveBeenCalledWith(
      tool,
      { channel: "general", message: "we hit the goal" },
      expect.objectContaining({
        preApproved: true,
        approvalId: "appr-1",
        grantId: "grant-9",
      }),
    );
    expect(emitInsight).not.toHaveBeenCalled();
  });

  it("logs an Insight and returns false when the tool is no longer registered", async () => {
    getTool.mockReturnValue(undefined);
    const ran = await executeApprovedAction(
      approval({
        type: "tool_action",
        content: { tool_name: "removed_tool", action_class: "x", action_input: {} },
      }),
    );
    expect(ran).toBe(false);
    expect(invokeTool).not.toHaveBeenCalled();
    expect(emitInsight).toHaveBeenCalledTimes(1);
  });

  it("logs an Insight and returns false (does not throw) when execution fails", async () => {
    getTool.mockReturnValue({ name: "send_slack_notification" });
    invokeTool.mockRejectedValue(new Error("downstream send failed"));
    const ran = await executeApprovedAction(
      approval({
        type: "tool_action",
        content: {
          tool_name: "send_slack_notification",
          action_class: "x",
          action_input: {},
        },
      }),
    );
    expect(ran).toBe(false);
    expect(emitInsight).toHaveBeenCalledTimes(1);
  });
});
