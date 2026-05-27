/**
 * Shared fetch helper for dispatcher modules (Slack, Gmail, Calendar,
 * Google OAuth token refresh) per Phase 4 — Chunk 6 CR feedback.
 *
 * Adds an AbortController-based timeout to every outbound API call so
 * a stalled upstream cannot hang the runtime indefinitely, and maps
 * the timeout / network / parse failure modes onto ToolError shapes
 * the runtime can act on (retry transient, surface permanent).
 *
 * Per CLAUDE.md: every async operation has an error path; no
 * unhandled promise rejections.
 */

import "server-only";

import { ToolError } from "@kinetiks/tools";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchWithTimeoutInput {
  url: string;
  init?: RequestInit;
  /** Override the default 10s timeout. */
  timeoutMs?: number;
  /** Tool name used in error context. */
  tool: string;
  /** Extra context fields, e.g. account_id. */
  context?: Record<string, string | number | boolean | string[]>;
}

export async function fetchWithTimeout(
  input: FetchWithTimeoutInput,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const response = await fetch(input.url, {
      ...input.init,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    // AbortError fires when our timeout aborts. Treat as transient so
    // the runtime's retry policy can act; preserve the original
    // message in context.
    const isAbort = (err as Error)?.name === "AbortError";
    throw new ToolError(
      "transient",
      `${input.tool}: ${isAbort ? "request timed out" : "network failure"} — ${
        (err as Error)?.message ?? "unknown"
      }`,
      {
        context: {
          tool: input.tool,
          timed_out: isAbort,
          ...(input.context ?? {}),
        },
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a response body as JSON, mapping parse failures to ToolError.
 * Classifies non-JSON 5xx / 429 as transient (likely a momentary
 * upstream outage) and other non-JSON statuses as permanent (almost
 * always a misconfiguration or upstream contract change).
 */
export async function parseJsonOrToolError<T>(
  response: Response,
  input: { tool: string; context?: Record<string, string | number | boolean | string[]> },
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (err) {
    const isTransient = response.status >= 500 || response.status === 429;
    throw new ToolError(
      isTransient ? "transient" : "permanent",
      `${input.tool}: failed to parse response JSON (HTTP ${response.status}): ${
        (err as Error)?.message ?? "unknown"
      }`,
      {
        context: {
          tool: input.tool,
          http_status: response.status,
          ...(input.context ?? {}),
        },
      },
    );
  }
}

/**
 * Classify an HTTP status code into a retryable bucket. 429 (rate
 * limit) and 5xx (server error) are transient; everything else is
 * permanent. Callers can override per upstream.
 */
export function classifyHttpStatus(
  status: number,
): "transient" | "permanent" {
  if (status === 429 || status >= 500) return "transient";
  return "permanent";
}
