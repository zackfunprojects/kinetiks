/**
 * Keyset pagination utilities.
 *
 * Per CLAUDE.md: use keyset pagination on every unbounded list (proposals,
 * ledger entries, insights, approvals, threads, ai_calls, harvest contacts,
 * dark madder articles, patterns, authority grants). Offset pagination
 * is forbidden because it gets slower as offset grows and is unstable when
 * rows shift.
 *
 * Cursors are base64url-encoded JSON of the sort-key tuple. Forward only.
 */

export interface PageRequest<TCursor = unknown> {
  /** Decoded cursor; undefined = first page. */
  cursor?: TCursor;
  /** Max items to return; the implementor should clamp to a sane upper bound. */
  limit: number;
}

export interface Page<TItem, TCursor = unknown> {
  items: TItem[];
  /** Cursor for the NEXT page; undefined when at the end. */
  nextCursor?: TCursor;
}

export function clampLimit(requested: number, max = 100, fallback = 25): number {
  if (!Number.isFinite(requested) || requested <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(requested)), max);
}

export function encodeCursor(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8")
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeCursor<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const final = pad ? padded + "=".repeat(4 - pad) : padded;
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(final, "base64").toString("utf8")
        : new TextDecoder().decode(
            Uint8Array.from(atob(final), (c) => c.charCodeAt(0)),
          );
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/**
 * Helper that ties Supabase-style results to the Page<T> shape.
 * Caller fetches `limit + 1` rows; this trims and produces the cursor.
 */
export function buildPage<TItem, TCursor>(
  rows: TItem[],
  limit: number,
  cursorOf: (row: TItem) => TCursor,
): Page<TItem, TCursor> {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: cursorOf(last) };
  }
  return { items: rows };
}
