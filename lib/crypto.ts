import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

// ── Key validation ────────────────────────────────────────────────────────────
// Fail fast at module load: a misconfigured key would silently break all
// pending signups, so we assert immediately rather than at first use.
const RAW_SECRET = process.env.PENDING_SIGNUP_SECRET;
if (!RAW_SECRET || !/^[0-9a-f]{64}$/i.test(RAW_SECRET)) {
  throw new Error(
    "PENDING_SIGNUP_SECRET must be a 64-character hex string. " +
      "Generate one with: openssl rand -hex 32",
  );
}
const ENCRYPTION_KEY = Buffer.from(RAW_SECRET, "hex"); // 32 bytes → AES-256

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random raw token (256-bit entropy).
 * This is sent in the verification email link — never stored.
 */
export function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Returns the SHA-256 hex digest of a raw token.
 * This is what gets stored in pending_registrations.token_hash.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ── Password encryption ───────────────────────────────────────────────────────
//
// Format: base64( iv[12] || authTag[16] || ciphertext[n] )
// AES-256-GCM provides both confidentiality and integrity (authTag prevents
// tampering — decryptPassword throws if the ciphertext is modified).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;   // 96-bit IV — recommended for GCM
const TAG_LENGTH = 16;  // 128-bit authentication tag

/**
 * Encrypts a plaintext password for temporary storage in pending_registrations.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 */
export function encryptPassword(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack: iv (12) + tag (16) + ciphertext (variable)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypts a password that was encrypted with encryptPassword.
 * Throws if the ciphertext is invalid, tampered with, or the key is wrong.
 */
export function decryptPassword(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64");

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid ciphertext: too short.");
  }

  const iv  = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}
