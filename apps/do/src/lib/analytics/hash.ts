/**
 * Browser-side SHA-256 hash for user_id anonymization.
 *
 * Final Supplement #5.7 requires user_id to be hashed before being
 * sent in analytics events, and the raw id to never leave the server.
 * The hash is stable per (user_id, salt) so events from the same user
 * group correctly without exposing the underlying id.
 *
 * Salt is per-app-version so we can invalidate hashes if needed by
 * bumping NEXT_PUBLIC_APP_VERSION.
 */

const SALT_PREFIX = "deskof:user:";

export async function hashUserId(userId: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "";
  }
  const salt =
    SALT_PREFIX + (process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0-dev");
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(salt + userId)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
