/**
 * PII hashing and stripping helpers for CRM ingest.
 *
 * The plan-doc's hard rule: HubSpot raw entities arrive with real names,
 * emails, phones, addresses. We never store any of those at rest. Before
 * writing to `kinetiks_crm_entities.data`:
 *
 *   - emails  → email_lower_hash (sha256 hex of lowercased+trimmed addr)
 *   - phones  → phone_lower_hash (sha256 hex of digits-only)
 *   - names   → dropped (no hash; we don't need to correlate by name)
 *   - addrs   → only city / state / country / domain retained
 *   - URLs    → only the host kept; query strings + paths dropped
 *
 * This module is pure and synchronous. Tested.
 */

import { createHash } from "node:crypto";

/** SHA-256 hex of a lowercased, trimmed input. Null in → null out. */
export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

/** SHA-256 hex of a digits-only normalization of the phone string. */
export function hashPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (digits.length === 0) return null;
  return createHash("sha256").update(digits).digest("hex");
}

/**
 * Extract the host (domain) from a URL. Returns null on parse failure.
 * Strips paths, queries, ports.
 */
export function urlDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Subset of an address payload that's safe to retain. Drops street, postcode,
 * full address line. City + state + country + domain are aggregate-only.
 */
export interface SafeAddressFields {
  city?: string;
  state?: string;
  country?: string;
}

export function pickSafeAddress(
  input: Record<string, unknown> | null | undefined
): SafeAddressFields {
  if (!input) return {};
  const out: SafeAddressFields = {};
  if (typeof input.city === "string") out.city = input.city;
  if (typeof input.state === "string") out.state = input.state;
  if (typeof input.country === "string") out.country = input.country;
  return out;
}

/**
 * Phase 7: SHA-256 hex of a normalized social-media handle, truncated
 * to 16 characters. Used by the social-post sync handlers to redact
 * mention handles in metadata while still letting Marcus's read
 * tools detect "this post mentioned the same handle as that one"
 * without ever surfacing the handle itself.
 *
 * Truncation matches the imported_from_account_id_hash pattern in
 * Pattern Library exports — 16 hex chars (64 bits) is collision-
 * resistant enough for the per-account hash space.
 */
export function hashHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const normalized = handle.trim().toLowerCase().replace(/^@+/, "");
  if (normalized.length === 0) return null;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
