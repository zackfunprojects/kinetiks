/**
 * AES-256-GCM encryption for OAuth tokens and API keys stored in kinetiks_connections.
 *
 * Credentials are encrypted before writing to the database and decrypted on read.
 * Uses KINETIKS_ENCRYPTION_KEY from environment (must be 32 bytes / 64 hex chars).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.KINETIKS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "KINETIKS_ENCRYPTION_KEY is not set. Cannot encrypt/decrypt credentials."
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `KINETIKS_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${hex.length} hex chars.`
    );
  }
  return buf;
}

/**
 * Encrypt a credentials object to a base64 string for database storage.
 * Format: base64(iv + authTag + ciphertext)
 */
export function encryptCredentials(data: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64 string from the database back to a credentials object.
 */
export function decryptCredentials(
  encrypted: string
): Record<string, unknown> {
  const key = getEncryptionKey();
  const packed = Buffer.from(encrypted, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted credentials: data too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
}
