/**
 * Shared Authority Grants read helper per the Kinetiks Contract Addendum §2.
 *
 * Both the Cortex Authority sub-tab UI (Phase 4 — Chunk 8) and the
 * future `query_actions_authority` tool consume this. The single
 * shared helper enforces account scoping and any UI-vs-tool filtering
 * differences at one place, mirroring the Pattern Library precedent
 * at `apps/id/src/lib/cortex/patterns/list.ts`.
 *
 * Server-side only: imports `server-only` so client bundles fail at
 * compile time on accidental import.
 */

import "server-only";
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
  /** Pagination. */
  limit?: number;
  offset?: number;
}

export interface ListGrantsResult {
  grants: AuthorityGrant[];
  total: number;
}

const NON_TERMINAL_STATUSES: ReadonlyArray<AuthorityGrantStatus> = [
  "proposed",
  "active",
  "paused",
];

export async function listGrants(
  admin: AdminLike,
  input: ListGrantsInput,
): Promise<ListGrantsResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, input.offset ?? 0);
  const statusFilter = input.status_in
    ? [...input.status_in]
    : [...NON_TERMINAL_STATUSES];

  let query = admin
    .from("kinetiks_authority_grants")
    .select("*", { count: "exact" })
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

  query = query
    .order("granted_at", { ascending: false, nullsFirst: false })
    .order("proposed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`[authority/list] ${error.message ?? "query failed"}`);
  }
  return {
    grants: (data ?? []) as AuthorityGrant[],
    total: count ?? 0,
  };
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
