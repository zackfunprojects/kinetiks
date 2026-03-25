#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { initClient } from "./client.js";
import { contextTools, handleContextTool } from "./tools/context.js";
import { cartographerTools, handleCartographerTool } from "./tools/cartographer.js";
import { approvalTools, handleApprovalTool } from "./tools/approvals.js";
import { summaryTools, handleSummaryTool } from "./tools/summary.js";
import { connectionTools, handleConnectionTool } from "./tools/connections.js";
import { marcusTools, handleMarcusTool } from "./tools/marcus.js";

// Collect all tools and their handlers
const allTools: Tool[] = [
  ...contextTools,
  ...cartographerTools,
  ...approvalTools,
  ...summaryTools,
  ...connectionTools,
  ...marcusTools,
];

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;

const toolHandlers: Record<string, ToolHandler> = {};

function registerTools(tools: Tool[], handler: ToolHandler): void {
  for (const tool of tools) {
    toolHandlers[tool.name] = handler;
  }
}

registerTools(contextTools, handleContextTool);
registerTools(cartographerTools, handleCartographerTool);
registerTools(approvalTools, handleApprovalTool);
registerTools(summaryTools, handleSummaryTool);
registerTools(connectionTools, handleConnectionTool);
registerTools(marcusTools, handleMarcusTool);

// Create server
const server = new Server(
  { name: "kinetiks-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Register list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

// Register call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = toolHandlers[name];

  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}. Available: ${allTools.map((t) => t.name).join(", ")}` }],
      isError: true,
    };
  }

  try {
    return await handler(name, (args ?? {}) as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start
async function main(): Promise<void> {
  try {
    initClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to initialize";
    process.stderr.write(`kinetiks-mcp: ${msg}\n`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`kinetiks-mcp: connected (${allTools.length} tools)\n`);
}

main().catch((err) => {
  process.stderr.write(`kinetiks-mcp fatal: ${err}\n`);
  process.exit(1);
});
