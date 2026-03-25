import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { postSSE } from "../client.js";
import { formatMarcusResponse } from "../formatters.js";

export const marcusTools: Tool[] = [
  {
    name: "chat_with_marcus",
    description:
      "Send a message to Marcus, the Kinetiks conversational intelligence. Marcus is a strategic advisor who synthesizes cross-app data, coordinates campaigns, and extracts intelligence from conversations. Responses reference specific data and give grounded recommendations. Marcus speaks with stoic clarity - direct, evidence-based, no filler.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Your message to Marcus" },
        thread_id: { type: "string", description: "Thread ID to continue a conversation. Omit to start a new thread." },
      },
      required: ["message"],
    },
  },
];

export async function handleMarcusTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "chat_with_marcus": {
      const { text, threadId, actions } = await postSSE("/api/marcus/chat", {
        message: args.message,
        thread_id: args.thread_id,
        channel: "mcp",
      });
      return {
        content: [{ type: "text", text: formatMarcusResponse(text, threadId, actions) }],
      };
    }

    default:
      return { content: [{ type: "text", text: `Unknown marcus tool: ${name}` }], isError: true };
  }
}
