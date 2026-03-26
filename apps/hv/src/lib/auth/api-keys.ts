import { createHash, randomBytes } from "crypto";

const KEY_PREFIX = "kntk_";
const KEY_RANDOM_LENGTH = 30;

/**
 * Generate a new Kinetiks API key.
 * Format: kntk_{40_random_base64url_chars}
 * Returns the full key (shown once to user), its SHA-256 hash, and display prefix.
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const randomPart = randomBytes(KEY_RANDOM_LENGTH).toString("base64url");
  const key = `${KEY_PREFIX}${randomPart}`;
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 12);

  return { key, hash, prefix };
}

/**
 * Hash an API key with SHA-256 for storage.
 * The full key is never stored - only the hash.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Check if a string looks like a Kinetiks API key.
 */
export function isKineticsApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > 12;
}
