import * as crypto from "crypto";

/**
 * Server-only passport encryption utilities.
 * This module must NEVER be imported in client components.
 *
 * Encryption uses AES-256-GCM with a key derived from PASSPORT_ENCRYPTION_KEY.
 * The output is base64-encoded for storage in the database.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

function getEncryptionKey(): Buffer {
  let keyString = process.env.PASSPORT_ENCRYPTION_KEY;
  
  // For development: generate a temporary key if not set
  // WARNING: This should NEVER be used in production!
  // Data encrypted with a generated key cannot be decrypted if the server restarts.
  if (!keyString) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PASSPORT_ENCRYPTION_KEY environment variable is not set. " +
        "This is required in production for passport encryption."
      );
    }
    
    // Development fallback: use a deterministic key based on a fixed seed
    // This allows development but is NOT secure for production
    console.warn(
      "WARNING: PASSPORT_ENCRYPTION_KEY not set. Using development fallback key. " +
      "Set PASSPORT_ENCRYPTION_KEY in production for proper security."
    );
    keyString = "DEV_FALLBACK_KEY_DO_NOT_USE_IN_PRODUCTION";
  }

  // Derive a consistent 32-byte key from the env var
  // Using SHA-256 to ensure exactly 32 bytes regardless of input length
  return crypto.createHash("sha256").update(keyString).digest();
}

/**
 * Encrypts a passport number.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 *
 * @param plaintext - The passport number to encrypt
 * @returns Base64-encoded encrypted string
 */
export function encryptPassportNumber(plaintext: string): string {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("Plaintext must be a non-empty string");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data
  const combined = Buffer.concat([iv, authTag, encrypted]);

  // Return base64-encoded for database storage
  return combined.toString("base64");
}

/**
 * Decrypts a passport number.
 * This function is server-only and must NEVER be called from client code.
 *
 * @param ciphertext - Base64-encoded encrypted string from encryptPassportNumber
 * @returns Decrypted passport number
 */
export function decryptPassportNumber(ciphertext: string): string {
  if (!ciphertext || typeof ciphertext !== "string") {
    throw new Error("Ciphertext must be a non-empty string");
  }

  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext, "base64");

  // Extract IV, authTag, and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

