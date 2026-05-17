/**
 * F2 authority resolution stub.
 *
 * Per the 2027 addendum §2.9, the full authority resolution flow is:
 *
 *   1. Identify the `action_class`.
 *   2. Find any active grant whose scope applies (narrowest-scope wins).
 *   3. Check constraints, rate limits, spending envelope, escalation triggers.
 *   4. If all pass: execute with `grant_id` attached and outcome = "grant_covers".
 *      Otherwise: escalate to approval queue with full context.
 *   5. If no grant covers: fall back to the per-tool `autoApproveThreshold`
 *      and the standard per-action approval flow.
 *
 * L2a builds the live grant resolution. F2 ships a stub that always
 * resolves to the per-tool fallback (`auto_threshold`) — equivalent to
 * "no grants exist yet, every action follows its own confidence
 * threshold." Every `tool_calls` row produced under the F2 stub carries
 * `authority_outcome = "auto_threshold"` and `grant_id = null`.
 *
 * Replacing this module with a real implementation is L2a's primary
 * deliverable.
 */

import type { AgentTool, AuthorityOutcome } from "@kinetiks/tools";

export interface AuthorityResolution {
  outcome: AuthorityOutcome;
  grantId: string | null;
}

export interface ResolveAuthorityCtx {
  accountId: string;
  userId?: string | null;
  invokedByAgent: string;
  threadId?: string | null;
  metadata?: Record<string, string | number | boolean | string[]>;
}

export type AuthorityResolver = (
  tool: AgentTool<any, any>,
  ctx: ResolveAuthorityCtx,
) => Promise<AuthorityResolution>;

/**
 * F2 default: every call resolves to `auto_threshold`. L2a swaps in a
 * resolver that queries `kinetiks_authority_grants`.
 */
export const f2StubAuthorityResolver: AuthorityResolver = async () => ({
  outcome: "auto_threshold",
  grantId: null,
});

let _resolver: AuthorityResolver = f2StubAuthorityResolver;

/** Override the resolver (test-only or future L2a hook). */
export function configureAuthorityResolver(resolver: AuthorityResolver | null): void {
  _resolver = resolver ?? f2StubAuthorityResolver;
}

export function getAuthorityResolver(): AuthorityResolver {
  return _resolver;
}
