/**
 * Token Encryption/Decryption
 *
 * Uses AES-256-GCM for encrypting OAuth tokens at rest.
 * The encryption key is derived from a machine-specific secret.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

const DATA_DIR = join(homedir(), ".claude-code-ui");
const SECRET_PATH = join(DATA_DIR, ".integration-key");

/**
 * Get or create the encryption key
 * Key is derived from a random secret stored in ~/.claude-code-ui/.integration-key
 */
function getEncryptionKey(): Buffer {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  let secret: string;

  if (existsSync(SECRET_PATH)) {
    secret = readFileSync(SECRET_PATH, "utf-8").trim();
  } else {
    // Generate a new random secret
    secret = randomBytes(64).toString("hex");
    writeFileSync(SECRET_PATH, secret, { mode: 0o600 }); // Read/write only for owner
  }

  // Derive a key from the secret using scrypt
  // Using a fixed salt since we're already using a random secret
  const salt = Buffer.from("navi-integrations-v1");
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypt a string (typically an OAuth token)
 * Returns base64-encoded encrypted data with IV and auth tag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: IV (16) + AuthTag (16) + EncryptedData
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a string
 * Expects base64-encoded data from encrypt()
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertext, "base64");

  // Extract IV, auth tag, and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Test if the encryption system is working
 */
export function testEncryption(): boolean {
  try {
    const testData = "test-oauth-token-12345";
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    return decrypted === testData;
  } catch (e) {
    console.error("Encryption test failed:", e);
    return false;
  }
}
