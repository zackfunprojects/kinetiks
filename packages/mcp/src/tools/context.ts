import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { get, patch } from "../client.js";
import { formatContext, formatContextLayer, formatConfidence, formatGeneric } from "../formatters.js";

const LAYERS = ["org", "products", "voice", "customers", "narrative", "competitive", "market", "brand"] as const;
type Layer = (typeof LAYERS)[number];

function validateLayer(value: unknown): Layer {
  if (typeof value !== "string" || !LAYERS.includes(value as Layer)) {
    throw new Error(`Invalid layer: "${String(value)}". Must be one of: ${LAYERS.join(", ")}`);
  }
  return value as Layer;
}

export const contextTools: Tool[] = [
  {
    name: "get_context",
    description:
      "Get the full Kinetiks Context Structure - all 8 layers (org, products, voice, customers, narrative, competitive, market, brand) plus confidence scores in one call. Use this for a complete picture of the business identity.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_context_layer",
    description:
      "Get detailed data for a single context layer. Use when you need full detail for one specific layer rather than the overview.",
    inputSchema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          enum: [...LAYERS],
          description: "The context layer to fetch",
        },
      },
      required: ["layer"],
    },
  },
  {
    name: "get_confidence",
    description:
      "Get confidence scores for all context layers plus the weighted aggregate. Shows how complete and reliable the business identity data is.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_schema",
    description:
      "Get the JSON Schema for a context layer. Useful for understanding what fields are available before writing data.",
    inputSchema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          enum: [...LAYERS],
          description: "The layer to get the schema for. Omit for all layers.",
        },
      },
      required: [],
    },
  },
  {
    name: "update_context",
    description:
      "Update a context layer using deep merge (RFC 7386 JSON Merge Patch). Nested objects merge recursively, arrays replace entirely, null values delete keys. Only include the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        layer: {
          type: "string",
          enum: [...LAYERS],
          description: "The context layer to update",
        },
        data: {
          type: "object",
          description: "Partial data to merge into the layer. Only include fields to change.",
        },
      },
      required: ["layer", "data"],
    },
  },
];

export async function handleContextTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (name) {
    case "get_context": {
      const result = await get<{ layers: Record<string, unknown>; confidence: unknown }>("/api/context");
      return {
        content: [{ type: "text", text: formatContext(
          result.layers as Parameters<typeof formatContext>[0],
          result.confidence as Parameters<typeof formatContext>[1]
        ) }],
      };
    }

    case "get_context_layer": {
      const layer = validateLayer(args.layer);
      const result = await get<{ data: unknown }>(`/api/context/${layer}`);
      return {
        content: [{ type: "text", text: formatContextLayer(layer, result.data as Parameters<typeof formatContextLayer>[1]) }],
      };
    }

    case "get_confidence": {
      const result = await get<Record<string, unknown>>("/api/context/confidence");
      return {
        content: [{ type: "text", text: formatConfidence(result as unknown as Parameters<typeof formatConfidence>[0]) }],
      };
    }

    case "get_schema": {
      const params = args.layer ? { layer: args.layer as string } : undefined;
      const result = await get<unknown>("/api/context/schema", params);
      return {
        content: [{ type: "text", text: formatGeneric(result) }],
      };
    }

    case "update_context": {
      const layer = validateLayer(args.layer);
      const data = args.data as Record<string, unknown>;
      const result = await patch<unknown>(`/api/context/${layer}`, { data });
      return {
        content: [{ type: "text", text: `Context layer "${layer}" updated successfully.\n${formatGeneric(result)}` }],
      };
    }

    default:
      return { content: [{ type: "text", text: `Unknown context tool: ${name}` }], isError: true };
  }
}
