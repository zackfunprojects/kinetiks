/**
 * ToolCallLogger seam.
 *
 * The executor calls `getToolCallLogger()` once per attempt and forwards
 * the payload. Apps wire up a logger at boot (typically
 * Supabase-backed). Tests register an in-memory logger and inspect
 * payloads.
 *
 * If no logger is configured, a one-time dev warning is emitted and the
 * call path continues — never break the call to log.
 */

import type { ToolCallLogger, ToolCallLogPayload } from "./types";

let _logger: ToolCallLogger | null = null;

export function configureToolCallLogger(logger: ToolCallLogger | null): void {
  _logger = logger;
}

export function getToolCallLogger(): ToolCallLogger | null {
  return _logger;
}

export async function emitToolCallLog(payload: ToolCallLogPayload): Promise<void> {
  const logger = _logger;
  if (!logger) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[tools] no logger configured; dropping tool_calls row for tool=${payload.toolName}`,
      );
    }
    return;
  }
  try {
    await logger(payload);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[tools] logger failed", e);
  }
}
