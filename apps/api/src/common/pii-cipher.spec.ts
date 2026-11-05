import { randomBytes } from "node:crypto";

import { PiiCipher } from "./pii-cipher";

describe("PiiCipher", () => {
  const cipher = new PiiCipher(randomBytes(32));

  it("round-trips UTF-8 values", () => {
    for (const value of ["Amelia Hart", "rahim@example.com", "Flat 4, 12 Gulshan Avenue, Dhaka 1212", "Zoë Ünal"]) {
      expect(cipher.decrypt(cipher.encrypt(value))).toBe(value);
    }
  });

  it("uses a fresh IV each time", () => {
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("rejects tampered cipher text and other keys", () => {
    const stored = cipher.encrypt("secret");
    const [v, iv, tag, data] = stored.split(".");
    const flipped = Buffer.from(data!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => cipher.decrypt([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
    expect(() => new PiiCipher(randomBytes(32)).decrypt(stored)).toThrow();
  });

  it("fingerprints are stable and keyed", () => {
    expect(cipher.fingerprint(" ab123 ")).toBe(cipher.fingerprint("AB123"));
    expect(new PiiCipher(randomBytes(32)).fingerprint("AB123")).not.toBe(cipher.fingerprint("AB123"));
  });

  it("requires a 32-byte key", () => {
    expect(() => new PiiCipher(randomBytes(16))).toThrow();
  });
});
