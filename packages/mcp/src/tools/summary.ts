import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { get } from "../client.js";
import { formatGeneric } from "../formatters.js";

export const summaryTools: Tool[] = [
  {
    name: "get_daily_brief",
    description:
      "Get a pre-composed daily snapshot of the account: confidence scores, pending approvals, recent ledger activity, connection status, and active apps. Good starting point for understanding current state.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_context_summary",
    description:
      "Get a compact summary of all context layers: company name, product count, confidence scores, data gaps, and last-updated timestamps. Lighter than get_context - use when you just need an overview.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export async function handleSummaryTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "get_daily_brief": {
      const result = await get<Record<string, unknown>>("/api/summary/daily-brief");
      return { content: [{ type: "text", text: formatGeneric(result) }] };
    }

    case "get_context_summary": {
      const result = await get<Record<string, unknown>>("/api/summary/context");
      return { content: [{ type: "text", text: formatGeneric(result) }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown summary tool: ${name}` }], isError: true };
  }
}
