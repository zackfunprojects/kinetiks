import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { get, post } from "../client.js";
import { formatApprovals, formatGeneric } from "../formatters.js";

export const approvalTools: Tool[] = [
  {
    name: "list_approvals",
    description:
      "List proposals (escalated, accepted, declined, or all). Escalated proposals need user decisions - use resolve_proposal to accept or decline them.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["escalated", "accepted", "declined", "submitted", "all"],
          description: "Filter by status (default: escalated)",
        },
        source_app: { type: "string", description: "Filter by source app (e.g. dark_madder)" },
        target_layer: {
          type: "string",
          enum: ["org", "products", "voice", "customers", "narrative", "competitive", "market", "brand"],
          description: "Filter by target context layer",
        },
        page: { type: "number", description: "Page number (default: 1)" },
        per_page: { type: "number", description: "Results per page (default: 20)" },
      },
      required: [],
    },
  },
  {
    name: "resolve_proposal",
    description:
      "Accept or decline an escalated proposal. Accepting merges the proposed data into the context layer and recalculates confidence. Declining dismisses it.",
    inputSchema: {
      type: "object",
      properties: {
        proposal_id: { type: "string", description: "ID of the proposal to resolve" },
        decision: { type: "string", enum: ["accept", "decline"], description: "Accept or decline" },
        reason: { type: "string", description: "Optional reason for the decision" },
      },
      required: ["proposal_id", "decision"],
    },
  },
];

export async function handleApprovalTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "list_approvals": {
      const params: Record<string, string> = {};
      if (args.status) params.status = args.status as string;
      if (args.source_app) params.source_app = args.source_app as string;
      if (args.target_layer) params.target_layer = args.target_layer as string;
      if (args.page) params.page = String(args.page);
      if (args.per_page) params.per_page = String(args.per_page);

      const result = await get<{ proposals: Array<Record<string, unknown>>; meta?: Record<string, unknown> }>(
        "/api/approvals",
        Object.keys(params).length > 0 ? params : undefined
      );
      return {
        content: [{ type: "text", text: formatApprovals(result.proposals ?? [], result.meta) }],
      };
    }

    case "resolve_proposal": {
      const result = await post<Record<string, unknown>>("/api/approvals", {
        proposal_id: args.proposal_id,
        decision: args.decision,
        reason: args.reason,
      });
      const decision = args.decision as string;
      return {
        content: [{ type: "text", text: `Proposal ${decision}ed.\n${formatGeneric(result)}` }],
      };
    }

    default:
      return { content: [{ type: "text", text: `Unknown approval tool: ${name}` }], isError: true };
  }
}
