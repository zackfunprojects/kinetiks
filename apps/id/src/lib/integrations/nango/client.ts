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

// ─── Connect session ──────────────────────────────────────

export interface CreateConnectSessionInput {
  end_user: {
    id: string;
    /** Customer-visible name shown in the Connect modal. Optional. */
    display_name?: string;
    /** Customer email. Optional but Nango uses it to seed OAuth forms. */
    email?: string;
  };
  /** Lock the modal to one integration (the provider the customer picked). */
  allowed_integrations: string[];
}

export interface ConnectSession {
  token: string;
  expires_at: string;
}

/**
 * Mint a Connect session token for the frontend's `nango.openConnectUI()`.
 * One-shot, 30-minute TTL by default (Nango-controlled). The token is
 * scoped to a single Kinetiks end_user.id; OAuth completion fires the
 * `connection.created` webhook for that end_user.
 */
export async function createConnectSession(
  input: CreateConnectSessionInput,
): Promise<ConnectSession> {
  const client = getNangoClient();
  const result = (await (client as unknown as {
    createConnectSession: (i: unknown) => Promise<{
      data: { token: string; expires_at: string };
    }>;
  }).createConnectSession({
    end_user: input.end_user,
    allowed_integrations: input.allowed_integrations,
  }));
  return {
    token: result.data.token,
    expires_at: result.data.expires_at,
  };
}

// ─── Connection lifecycle ─────────────────────────────────

export interface DeleteConnectionInput {
  connection_id: string;
  provider_config_key: string;
}

/**
 * Revoke a Nango connection. Nango cancels in-flight syncs, calls
 * the provider's revoke endpoint (where available), and fires a
 * `connection.deleted` webhook for our records. Idempotent at the
 * Nango layer: a second call for an already-deleted connection
 * returns success.
 */
export async function deleteConnection(input: DeleteConnectionInput): Promise<void> {
  const client = getNangoClient();
  await client.deleteConnection(input.connection_id, input.provider_config_key);
}

// ─── Sync trigger ─────────────────────────────────────────

export interface TriggerSyncInput {
  connection_id: string;
  provider_config_key: string;
  /** Sync names declared on the Nango integration. */
  sync_names: string[];
}

/**
 * Kick off an immediate run of one or more syncs on a connection.
 * Nango queues the run and the sync webhook fires on completion.
 * Used after `connection.created` to populate data quickly rather
 * than waiting for the next scheduled run.
 */
export async function triggerSync(input: TriggerSyncInput): Promise<void> {
  const client = getNangoClient();
  await client.triggerSync(
    input.provider_config_key,
    input.sync_names,
    input.connection_id,
  );
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
  // Distinguishes "we hit MAX_PAGES with more records still available"
  // from "we hit MAX_PAGES on the natural last page". The latter is not
  // truncation and should not be reported as such.
  let capReached = false;

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
    if (pages >= MAX_PAGES) {
      // We exhausted the budget AND there is more data the cursor would
      // have fetched. This is real truncation.
      capReached = true;
      break;
    }
    cursor = page.nextCursor;
  }

  return { totalRecords, pages, capReached };
}
