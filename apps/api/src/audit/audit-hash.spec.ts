import { canonicalJson, chainHash, GENESIS_HASH, type HashableEntry } from "./audit-hash";

const entry = (over: Partial<HashableEntry> = {}): HashableEntry => ({
  occurredAt: new Date("2026-11-05T10:00:00.000Z"),
  actorWallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  actorRole: "COMPLIANCE_OFFICER",
  action: "KYC_APPROVED",
  entityType: "KYC_APPLICATION",
  entityId: "a1",
  summary: "Approved",
  details: { tier: 2, nested: { b: 1, a: 2 } },
  txHash: null,
  ...over,
});

describe("audit hash chain", () => {
  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalJson({ a: [3, 1, { z: 1, y: 2 }] })).toBe('{"a":[3,1,{"y":2,"z":1}]}');
  });

  it("is deterministic and depends on the previous hash", () => {
    const first = chainHash(GENESIS_HASH, entry());
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(chainHash(GENESIS_HASH, entry())).toBe(first);
    expect(chainHash(first, entry())).not.toBe(first);
  });

  it("detects any change to a field", () => {
    const original = chainHash(GENESIS_HASH, entry());
    expect(chainHash(GENESIS_HASH, entry({ summary: "Approved!" }))).not.toBe(original);
    expect(chainHash(GENESIS_HASH, entry({ details: { tier: 3, nested: { a: 2, b: 1 } } }))).not.toBe(original);
    expect(chainHash(GENESIS_HASH, entry({ occurredAt: new Date("2026-11-05T10:00:00.001Z") }))).not.toBe(original);
  });

  it("verifying a chain finds the tampered link", () => {
    const rows = [entry({ entityId: "1" }), entry({ entityId: "2" }), entry({ entityId: "3" })];
    const hashes: string[] = [];
    let prev = GENESIS_HASH;
    for (const r of rows) {
      prev = chainHash(prev, r);
      hashes.push(prev);
    }
    rows[1] = { ...rows[1]!, summary: "edited later" };
    let check = GENESIS_HASH;
    let broken = -1;
    rows.forEach((r, i) => {
      const h = chainHash(check, r);
      if (broken < 0 && h !== hashes[i]) broken = i;
      check = hashes[i]!;
    });
    expect(broken).toBe(1);
  });
});
