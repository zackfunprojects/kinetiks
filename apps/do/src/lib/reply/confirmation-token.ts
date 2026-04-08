/**
 * Human confirmation token — the in-memory side of the human-only
 * publishing constraint.
 *
 * Per CLAUDE.md §Architecture Principles:
 *
 *   The human_confirmation_token is a short-lived, single-use token
 *   generated when the user clicks "Post" in the DeskOf UI. It cannot
 *   be generated via API. This is the enforcement mechanism that
 *   ensures human-only publishing even when agents interact via MCP.
 *
 * Properties of the token:
 *   - Generated server-side only when an authenticated UI session
 *     calls /api/reply/prepare-confirmation
 *   - Single-use: consumed on the first /api/reply/post call
 *   - Short-lived: 5-minute TTL (matches the DB-level posted_at /
 *     human_confirmed_at constraint)
 *   - Bound to a SHA-256 hash of the reply content — changing the
 *     content invalidates the token
 *   - Stored in memory only (process-local Map). Never persisted to
 *     the database, never sent over webhooks, never logged.
 *
 * Phase 2 ships the in-memory implementation. Phase 8 hardens this
 * for multi-instance deployments by either:
 *   (a) using a Redis store with TTL + content-hash key
 *   (b) using a stateless signed JWT with embedded content hash + nbf/exp
 *
 * Until Phase 8, the deployment must run on a single Node.js instance
 * for posting to work end-to-end. The DB-level constraint
 * `reply_requires_human_confirmation` is the second line of defense.
 */
import "server-only";
import { createHash, randomBytes } from "crypto";

interface PendingToken {
  token: string;
  user_id: string;
  opportunity_id: string;
  /** SHA-256 of the normalized reply content */
  content_hash: string;
  /** Unix ms */
  expires_at: number;
}

const TTL_MS = 5 * 60 * 1000;
const tokens = new Map<string, PendingToken>();

/**
 * Hash the reply content for binding to a confirmation token. Uses
 * SHA-256 over the trimmed UTF-8 bytes — the same content always
 * produces the same hash, but a single character change invalidates
 * the token.
 */
export function hashReplyContent(content: string): string {
  return createHash("sha256").update(content.trim(), "utf8").digest("hex");
}

/**
 * Issue a fresh confirmation token bound to the given content hash.
 * Called from /api/reply/prepare-confirmation when the user confirms
 * the gate-cleared reply in the editor.
 */
export function issueConfirmationToken(opts: {
  user_id: string;
  opportunity_id: string;
  content: string;
}): { token: string; expires_at: number } {
  prune();
  const token = randomBytes(32).toString("base64url");
  const expires_at = Date.now() + TTL_MS;
  tokens.set(token, {
    token,
    user_id: opts.user_id,
    opportunity_id: opts.opportunity_id,
    content_hash: hashReplyContent(opts.content),
    expires_at,
  });
  return { token, expires_at };
}

/**
 * Consume a confirmation token. Returns the bound metadata if the
 * token is valid AND the content hash still matches; otherwise
 * returns null. The token is removed from the map on first lookup
 * regardless of validity (single-use semantics).
 */
export function consumeConfirmationToken(opts: {
  token: string;
  user_id: string;
  content: string;
}): { ok: true; opportunity_id: string } | { ok: false; reason: string } {
  prune();
  const entry = tokens.get(opts.token);
  tokens.delete(opts.token);

  if (!entry) {
    return { ok: false, reason: "Unknown or already-used confirmation token" };
  }
  if (entry.user_id !== opts.user_id) {
    return { ok: false, reason: "Confirmation token does not belong to this user" };
  }
  if (entry.expires_at < Date.now()) {
    return { ok: false, reason: "Confirmation token expired" };
  }

  const expectedHash = hashReplyContent(opts.content);
  if (entry.content_hash !== expectedHash) {
    return {
      ok: false,
      reason: "Reply content changed since confirmation — re-confirm to post",
    };
  }

  return { ok: true, opportunity_id: entry.opportunity_id };
}

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of tokens) {
    if (entry.expires_at < now) tokens.delete(key);
  }
}

// Test helpers — exported for unit tests, not for production callers
export function __testHelpers() {
  return {
    size: () => tokens.size,
    clear: () => tokens.clear(),
  };
}
