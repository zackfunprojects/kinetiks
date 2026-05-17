/**
 * PII redaction helpers.
 *
 * Per CLAUDE.md, the following must NEVER be passed into LLM prompts or
 * logged at any level:
 *   - Email addresses
 *   - Phone numbers
 *   - Full addresses
 *   - OAuth tokens / encrypted blobs
 *   - Service role keys
 *   - Full prompt content (for ai_calls.metadata)
 *
 * Contact names in prompts are limited to first name + last initial.
 *
 * These helpers are intentionally conservative. If a redacted value is
 * still recognizable, treat that as a bug and tighten the regex.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Phone: matches international/US-style sequences with optional + and separators
const PHONE_RE =
  /(?<!\d)(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}(?!\d)/g;
// 32+ char alphanumerics with optional dashes/underscores look like tokens or keys
const TOKEN_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

export function redactEmails(input: string): string {
  return input.replace(EMAIL_RE, "[email]");
}

export function redactPhones(input: string): string {
  return input.replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 7 ? "[phone]" : m));
}

export function redactTokens(input: string): string {
  return input.replace(TOKEN_RE, "[token]");
}

/** Apply every PII redaction pass; safe to call on any free-text string. */
export function redactAllPII(input: string): string {
  return redactTokens(redactPhones(redactEmails(input)));
}

/** Reduce a contact's full name to "Firstname L." per CLAUDE.md. */
export function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last[0].toUpperCase()}.`;
}

/**
 * Hash a value into a stable short fingerprint for logging — never reversible,
 * never PII. Useful when you need to correlate across log lines without
 * exposing the original value (e.g. tying a normalized GA4 query input to its
 * cached metric result).
 */
export async function fingerprint(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
  // Node fallback
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}
