import { CONTEXT_SCHEMAS } from "@/lib/utils/context-schemas";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import type { ContextLayer } from "@kinetiks/types";
import { NextRequest } from "next/server";

const VALID_LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

/**
 * GET /api/context/schema
 * Returns JSON Schemas for context layers.
 * Query: ?layer=org (optional - returns single layer schema)
 * No auth required - schemas are public documentation.
 */
export async function GET(request: NextRequest) {
  const layer = request.nextUrl.searchParams.get("layer");

  if (layer) {
    if (!VALID_LAYERS.includes(layer as ContextLayer)) {
      return apiError(`Invalid layer. Must be one of: ${VALID_LAYERS.join(", ")}`, 400);
    }
    return apiSuccess({
      layer,
      schema: CONTEXT_SCHEMAS[layer as ContextLayer],
    });
  }

  return apiSuccess({
    layers: VALID_LAYERS,
    schemas: CONTEXT_SCHEMAS,
  });
}
