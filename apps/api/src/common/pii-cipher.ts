import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for personal data at rest. Each value gets a fresh 12-byte IV; the stored
 * format is `v1.<iv>.<tag>.<ciphertext>` in base64url, so a key rotation can add `v2`.
 */
export class PiiCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("PII key must be 32 bytes");
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
  }

  decrypt(stored: string): string {
    const [version, iv, tag, data] = stored.split(".");
    if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Unsupported cipher text");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  }

  /** Keyed hash for duplicate detection without storing the clear value. */
  fingerprint(value: string): string {
    return createHmac("sha256", this.key).update(value.trim().toUpperCase()).digest("hex");
  }
}
