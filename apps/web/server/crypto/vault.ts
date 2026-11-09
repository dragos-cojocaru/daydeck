// AES-256-GCM encryption for secrets at rest (Buffer tokens) and in cookies (OAuth state).
// The master key comes from TOKEN_ENCRYPTION_KEY. Each use derives its own key with HKDF, so
// a value sealed for one purpose cannot be opened as another.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export interface Keyring {
  /** A short fingerprint of the master key. Stored next to sealed values to allow rotation. */
  keyId: string;
  masterKey: Buffer;
}

export type Purpose = "buffer-tokens" | "oauth-state";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function createKeyring(base64Key: string): Keyring {
  const masterKey = Buffer.from(base64Key, "base64");
  if (masterKey.length !== 32) throw new Error("The encryption key must be 32 bytes, base64");
  const keyId = createHash("sha256").update(masterKey).digest("hex").slice(0, 16);
  return { keyId, masterKey };
}

function deriveKey(keyring: Keyring, purpose: Purpose): Buffer {
  return Buffer.from(hkdfSync("sha256", keyring.masterKey, "", `daydeck/${purpose}/v1`, 32));
}

/**
 * Encrypts `plaintext`. `context` is bound to the result as additional authenticated data, so a
 * value sealed for one user or field fails to open anywhere else.
 */
export function seal(keyring: Keyring, purpose: Purpose, plaintext: string, context: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(keyring, purpose), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, ciphertext, tag].map(encode).join(".");
}

/** Decrypts a value from seal(). Throws if it was changed, or sealed with another key or context. */
export function open(keyring: Keyring, purpose: Purpose, sealed: string, context: string): string {
  const [version, iv, ciphertext, tag, ...rest] = sealed.split(".");
  if (version !== VERSION || !iv || !ciphertext || !tag || rest.length > 0) {
    throw new Error("Sealed value has an unknown format");
  }
  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new Error("Sealed value has an unknown format");
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(keyring, purpose), ivBytes);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tagBytes);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function encode(part: string | Buffer): string {
  return typeof part === "string" ? part : part.toString("base64url");
}
