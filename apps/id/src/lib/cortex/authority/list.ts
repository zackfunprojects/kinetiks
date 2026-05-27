/**
 * Shared Authority Grants read helper per the Kinetiks Contract Addendum §2.
 *
 * Both the Cortex Authority sub-tab UI (Phase 4 — Chunk 8) and the
 * future `query_actions_authority` tool consume this. The single
 * shared helper enforces account scoping and any UI-vs-tool filtering
 * differences at one place, mirroring the Pattern Library precedent
 * at `apps/id/src/lib/cortex/patterns/list.ts`.
 *
 * Pagination: keyset (cursor) per CLAUDE.md — offset/range is forbidden
 * because it drifts as rows shift and gets slower as offset grows.
 * Authority grants are an unbounded list and explicitly named in the
 * CLAUDE.md keyset-required list.
 *
 * Cursor shape: `{ proposed_at, id }`. Sort: `proposed_at DESC, id DESC`.
 * `proposed_at` is always set (initial NOT NULL DEFAULT now() on the
 * row) so the cursor never null-misses; tie-break on `id` keeps order
 * stable across rows created in the same microsecond.
 *
 * Server-side only: imports `server-only` so client bundles fail at
 * compile time on accidental import.
 */

import "server-only";
import {
  buildPage,
  clampLimit,
  decodeCursor,
  encodeCursor,
  type Page,
} from "@kinetiks/lib/pagination";
import type {
  AuthorityGrant,
  AuthorityGrantStatus,
  AuthorityGrantScopeType,
} from "@kinetiks/types";

/** Minimal admin client seam (same shape as patterns/list.ts). */
interface AdminLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface GrantCursor {
  proposed_at: string;
  id: string;
}

export interface ListGrantsInput {
  account_id: string;
  /** Filter by status. Default: all non-terminal (proposed, active, paused). */
  status_in?: ReadonlyArray<AuthorityGrantStatus>;
  /** Filter by scope_type. */
  scope_type?: AuthorityGrantScopeType;
  /** Filter by scope_id. */
  scope_id?: string | null;
  /** Filter by parent_grant_id (for nesting). */
  parent_grant_id?: string | null;
  /** Filter for grants expiring within the next N days. */
  expiring_within_days?: number;
  /** Page size. Clamped to [1, 100]. Default 20. */
  limit?: number;
  /**
   * Opaque cursor returned as `nextCursor` from a previous call.
   * Undefined fetches the first page.
   */
  cursor?: string;
}

export type ListGrantsResult = Page<AuthorityGrant, string>;

const NON_TERMINAL_STATUSES: ReadonlyArray<AuthorityGrantStatus> = [
  "proposed",
  "active",
  "paused",
];

export async function listGrants(
  admin: AdminLike,
  input: ListGrantsInput,
): Promise<ListGrantsResult> {
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT, DEFAULT_LIMIT);
  const statusFilter = input.status_in
    ? [...input.status_in]
    : [...NON_TERMINAL_STATUSES];

  let query = admin
    .from("kinetiks_authority_grants")
    .select("*")
    .eq("account_id", input.account_id)
    .in("status", statusFilter);

  if (input.scope_type !== undefined) {
    query = query.eq("scope_type", input.scope_type);
  }
  if (input.scope_id !== undefined) {
    if (input.scope_id === null) {
      query = query.is("scope_id", null);
    } else {
      query = query.eq("scope_id", input.scope_id);
    }
  }
  if (input.parent_grant_id !== undefined) {
    if (input.parent_grant_id === null) {
      query = query.is("parent_grant_id", null);
    } else {
      query = query.eq("parent_grant_id", input.parent_grant_id);
    }
  }
  if (input.expiring_within_days !== undefined && input.expiring_within_days > 0) {
    const cutoff = new Date(
      Date.now() + input.expiring_within_days * 24 * 60 * 60 * 1000,
    ).toISOString();
    query = query.not("expires_at", "is", null).lte("expires_at", cutoff);
  }

  // Keyset cursor: WHERE (proposed_at, id) < (cursor.proposed_at, cursor.id)
  // expressed via OR composition for Supabase JS, then ORDER BY DESC for
  // both columns so the strict-less-than walks the index forward.
  const cursor = decodeCursor<GrantCursor>(input.cursor);
  if (cursor) {
    query = query.or(
      `proposed_at.lt.${cursor.proposed_at},and(proposed_at.eq.${cursor.proposed_at},id.lt.${cursor.id})`,
    );
  }

  query = query
    .order("proposed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const { data, error } = await query;
  if (error) {
    throw new Error(`[authority/list] ${error.message ?? "query failed"}`);
  }

  const rows = (data ?? []) as AuthorityGrant[];
  return buildPage<AuthorityGrant, string>(rows, limit, (row) =>
    encodeCursor({ proposed_at: row.proposed_at, id: row.id } satisfies GrantCursor),
  );
}

/**
 * Convenience reader: fetch a single grant by id (account-scoped).
 * Returns null if not found.
 */
export async function getGrantById(
  admin: AdminLike,
  args: { account_id: string; grant_id: string },
): Promise<AuthorityGrant | null> {
  const { data, error } = await admin
    .from("kinetiks_authority_grants")
    .select("*")
    .eq("account_id", args.account_id)
    .eq("id", args.grant_id)
    .maybeSingle();
  if (error) {
    throw new Error(`[authority/list] getGrantById: ${error.message}`);
  }
  return (data as AuthorityGrant | null) ?? null;
}
