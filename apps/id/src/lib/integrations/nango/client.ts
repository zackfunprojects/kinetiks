/**
 * Nango Node SDK wrapper.
 *
 * Single entry point for fetching records out of Nango. Webhook handlers
 * call `fetchRecords()` after the route hands them a `connectionId`; the
 * SDK handles pagination cursors, auth, retries.
 *
 * Configuration:
 *   NANGO_SECRET_KEY  required at runtime — the boot env validator marks
 *                     it optional so apps boot without it during the D2
 *                     migration; absence throws here when a handler runs.
 *   NANGO_HOST        optional override (default: https://api.nango.dev).
 */

import "server-only";

import { Nango } from "@nangohq/node";

let _client: Nango | null = null;

/**
 * Lazy-initialize the Nango client. Throws a typed error if the env var
 * is missing — handlers catch and convert to a sync_log row.
 */
export function getNangoClient(): Nango {
  if (_client) return _client;

  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new NangoMisconfiguredError(
      "NANGO_SECRET_KEY is not set; cannot reach Nango records API"
    );
  }
  const host = process.env.NANGO_HOST || "https://api.nango.dev";
  _client = new Nango({ secretKey, host });
  return _client;
}

/** Test escape hatch. */
export function _resetNangoClientForTests(): void {
  _client = null;
}

/** Programmer error — the env was not set when a handler needed Nango. */
export class NangoMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NangoMisconfiguredError";
  }
}

// ─── fetchRecords ──────────────────────────────────────────

export interface FetchRecordsInput {
  connectionId: string;
  providerConfigKey: string;
  model: string;
  /** ISO timestamp; only return records modified at or after this. */
  modifiedAfter?: string;
  /** Pagination cursor from a prior call's `next_cursor`. */
  cursor?: string;
  /** Max records per page (Nango caps at 1000). */
  limit?: number;
}

export interface FetchRecordsPage<T = Record<string, unknown>> {
  records: T[];
  nextCursor: string | null;
}

/**
 * Fetch one page of records. The Nango SDK exposes a paginated `listRecords`;
 * callers loop using `nextCursor` until null.
 *
 * Records carry a `_nango_metadata` field with cursor + last-modified
 * timestamps; we surface it as-is so handlers can dedup intra-page.
 */
export async function fetchRecordsPage<T = Record<string, unknown>>(
  input: FetchRecordsInput
): Promise<FetchRecordsPage<T>> {
  const client = getNangoClient();
  const result = (await client.listRecords({
    connectionId: input.connectionId,
    providerConfigKey: input.providerConfigKey,
    model: input.model,
    modifiedAfter: input.modifiedAfter,
    cursor: input.cursor,
    limit: input.limit ?? 100,
  })) as { records: T[]; next_cursor: string | null };

  return {
    records: result.records ?? [],
    nextCursor: result.next_cursor ?? null,
  };
}

/**
 * Iterate every page for a sync, calling onPage with each batch. Caller
 * is responsible for writing records to the DB; this just orchestrates
 * the cursor walk.
 *
 * Guard rails:
 *   - MAX_PAGES caps the walk at 100 pages per call to prevent runaway
 *     loops when a sync explodes. Webhook handlers process up to ~10K
 *     records per arrival; anything beyond is logged and skipped.
 */
export async function fetchAllRecords<T = Record<string, unknown>>(
  input: Omit<FetchRecordsInput, "cursor">,
  onPage: (page: T[]) => Promise<void>
): Promise<{ totalRecords: number; pages: number; capReached: boolean }> {
  const MAX_PAGES = 100;
  let cursor: string | null | undefined = undefined;
  let totalRecords = 0;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page: FetchRecordsPage<T> = await fetchRecordsPage<T>({
      ...input,
      cursor: cursor ?? undefined,
    });
    if (page.records.length > 0) {
      await onPage(page.records);
      totalRecords += page.records.length;
    }
    pages += 1;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return {
    totalRecords,
    pages,
    capReached: pages >= MAX_PAGES,
  };
}
