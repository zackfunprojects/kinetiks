/**
 * Retry helper for the Runtime. Backoff is exponential with full jitter,
 * bounded by `maxBackoffMs`. Only the configured error classes retry.
 */

import { ToolError, type ToolErrorClass } from "@kinetiks/tools";
import type { RetryPolicy } from "./types";

const DEFAULTS: Required<Omit<RetryPolicy, "retryableClasses">> & {
  retryableClasses: readonly ToolErrorClass[];
} = {
  maxAttempts: 2,
  initialBackoffMs: 200,
  maxBackoffMs: 2_000,
  retryableClasses: ["transient", "timeout"],
};

export function resolveRetryPolicy(policy?: RetryPolicy): {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  retryableClasses: readonly ToolErrorClass[];
} {
  return {
    maxAttempts: clampInt(policy?.maxAttempts ?? DEFAULTS.maxAttempts, 1, 10),
    initialBackoffMs: clampInt(
      policy?.initialBackoffMs ?? DEFAULTS.initialBackoffMs,
      0,
      30_000,
    ),
    maxBackoffMs: clampInt(policy?.maxBackoffMs ?? DEFAULTS.maxBackoffMs, 0, 60_000),
    retryableClasses: policy?.retryableClasses ?? DEFAULTS.retryableClasses,
  };
}

export function backoffMs(
  attempt: number,
  initialBackoffMs: number,
  maxBackoffMs: number,
): number {
  // attempt is 1-indexed. 1 → initial, 2 → 2x, 3 → 4x, etc., capped.
  const base = initialBackoffMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(maxBackoffMs, base);
  return Math.floor(Math.random() * capped); // full jitter
}

export function isRetryable(
  err: unknown,
  classes: readonly ToolErrorClass[],
): err is ToolError {
  if (!(err instanceof ToolError)) return false;
  return classes.includes(err.errorClass);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class AbortError extends Error {
  constructor(message = "aborted") {
    super(message);
    this.name = "AbortError";
  }
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
