import { createHash } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export type HashableEntry = {
  occurredAt: Date;
  actorWallet: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown>;
  txHash: string | null;
};

/** JSON with sorted keys, so the same entry always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** hash = sha256(prevHash || canonical(entry)). Changing any earlier row breaks every later hash. */
export function chainHash(prevHash: string, entry: HashableEntry): string {
  const body = canonicalJson({ ...entry, occurredAt: entry.occurredAt.toISOString() });
  return createHash("sha256").update(prevHash).update(body).digest("hex");
}
