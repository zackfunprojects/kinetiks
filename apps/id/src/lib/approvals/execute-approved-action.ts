import "server-only";
import { getTool, ToolError } from "@kinetiks/tools";
import { startAgentRun } from "@kinetiks/runtime";
import { platformAvailabilityResolvers } from "@/lib/tools/availability";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitInsight } from "@/lib/insights";
import type { ApprovalRecord } from "./types";

/** Shape stored in `preview.content` for a re-executable tool action. */
interface ToolActionContent {
  tool_name?: unknown;
  action_class?: unknown;
  action_input?: unknown;
  invoked_by_agent?: unknown;
  grant_id?: unknown;
}

/**
 * Execute a consequential tool action the customer has just approved — a
 * per-action approval or an approved escalation. Both carry a
 * `preview.type === "tool_action"` payload.
 *
 * The action runs through the Agent Runtime with `preApproved: true` so
 * authority is NOT re-resolved; re-resolution would re-trigger the
 * per-action gate / escalation and re-queue the action forever. The
 * caller (processApprovalDecision) has already atomically claimed the
 * approval, so this runs at most once per approval.
 *
 * Failures are logged as an Insight but do NOT revert the approval: the
 * customer's decision stands; a downstream send failure surfaces as
 * notable signal rather than by silently un-approving.
 *
 * Returns true when the action executed, false when the preview was not a
 * runnable tool action, the tool is no longer registered, or execution
 * failed.
 */
export async function executeApprovedAction(
  approval: ApprovalRecord,
): Promise<boolean> {
  if (approval.preview?.type !== "tool_action") return false;

  const content = approval.preview.content as ToolActionContent;
  const toolName = content.tool_name;
  if (typeof toolName !== "string" || toolName.length === 0) return false;

  const tool = getTool(toolName);
  if (!tool) {
    await logApprovedActionFailure(approval, toolName, "tool_not_registered");
    return false;
  }

  const run = startAgentRun({
    accountId: approval.account_id,
    invokedByAgent:
      typeof content.invoked_by_agent === "string"
        ? content.invoked_by_agent
        : approval.source_operator ?? "approval_system",
    availability: platformAvailabilityResolvers,
  });

  try {
    await run.invokeTool(tool, content.action_input, {
      preApproved: true,
      approvalId: approval.id,
      grantId: typeof content.grant_id === "string" ? content.grant_id : undefined,
    });
    return true;
  } catch (err) {
    // PII-safe reason: a ToolError's errorClass is an enum; a raw message
    // could carry action content, so never log it into insight evidence.
    const reason = err instanceof ToolError ? err.errorClass : "execution_failed";
    await logApprovedActionFailure(approval, toolName, reason);
    return false;
  }
}

async function logApprovedActionFailure(
  approval: ApprovalRecord,
  toolName: string,
  reason: string,
): Promise<void> {
  const admin = createAdminClient();
  void emitInsight(admin, {
    account_id: approval.account_id,
    type: "approval_outcome",
    severity: "notable",
    summary: `An approved action could not complete: ${approval.title}.`,
    evidence: {
      approval_id: approval.id,
      tool_name: toolName,
      reason,
    },
    source_app: approval.source_app,
    source_operator: "approval_system",
    approval_id: approval.id,
  });
}
