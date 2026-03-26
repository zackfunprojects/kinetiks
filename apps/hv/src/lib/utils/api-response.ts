import { NextResponse } from "next/server";
import type { ApiResponseMeta } from "@kinetiks/types";

/**
 * Wrap a successful response in the standard API envelope.
 * Shape: { success: true, data: T, meta?: {...} }
 */
export function apiSuccess<T>(data: T, meta?: ApiResponseMeta): NextResponse {
  const body: { success: true; data: T; meta?: ApiResponseMeta } = {
    success: true,
    data,
  };
  if (meta) {
    body.meta = meta;
  }
  return NextResponse.json(body);
}

/**
 * Wrap an error response in the standard API envelope.
 * Shape: { success: false, error: string, details?: unknown }
 */
export function apiError(
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  const body: { success: false; error: string; details?: unknown } = {
    success: false,
    error: message,
  };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}

/**
 * Wrap a paginated response in the standard API envelope.
 * Shape: { success: true, data: T[], meta: { page, per_page, total } }
 */
export function apiPaginated<T>(
  data: T[],
  page: number,
  perPage: number,
  total: number
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    meta: { page, per_page: perPage, total },
  });
}
