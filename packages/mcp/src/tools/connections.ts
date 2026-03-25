import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { get } from "../client.js";
import { formatConnections } from "../formatters.js";

export const connectionTools: Tool[] = [
  {
    name: "list_connections",
    description:
      "List all data connections (GA4, Google Search Console, Stripe, social accounts, etc.) and their status. Shows which data sources are active, when they last synced, and which are disconnected.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export async function handleConnectionTool(
  name: string,
  _args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "list_connections": {
      const result = await get<{ connections: Array<Record<string, unknown>> }>("/api/connections");
      return {
        content: [{ type: "text", text: formatConnections(result.connections ?? []) }],
      };
    }

    default:
      return { content: [{ type: "text", text: `Unknown connection tool: ${name}` }], isError: true };
  }
}
