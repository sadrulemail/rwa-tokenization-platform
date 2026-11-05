import { createHash } from "node:crypto";

import { ANVIL_MNEMONIC } from "@rwa/contracts";
import { type Hex, toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export const APP_CONFIG = Symbol("APP_CONFIG");

export type AppConfig = {
  production: boolean;
  port: number;
  webOrigin: string;
  publicApiUrl: string;
  databaseUrl: string;
  indexerSchema: string;
  chainId: number;
  rpcUrl: string;
  jwtSecret: string;
  jwtTtl: string;
  piiKey: Buffer;
  registrarKey: Hex;
  kycValidityDays: number;
};

/**
 * Reads configuration from the environment. Outside production every value has a local
 * default that matches `pnpm chain` + `pnpm db:up`, so the stack runs without an .env file.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const value = (name: string, localDefault: () => string): string => {
    const v = env[name]?.trim();
    if (v) return v;
    if (production) throw new Error(`${name} must be set in production`);
    return localDefault();
  };

  const chainId = Number(value("CHAIN_ID", () => "31337"));
  const piiKeyHex = value("PII_ENCRYPTION_KEY", () =>
    createHash("sha256").update("rwa-local-pii-key").digest("hex"),
  );
  if (!/^[0-9a-fA-F]{64}$/.test(piiKeyHex)) throw new Error("PII_ENCRYPTION_KEY must be 64 hex characters");

  const registrarKey = value("REGISTRAR_PRIVATE_KEY", () => {
    if (chainId !== 31337) throw new Error("REGISTRAR_PRIVATE_KEY must be set outside the local chain");
    // Anvil development account #5. Public key material, valid on the local chain only.
    const hd = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 5 }).getHdKey();
    return toHex(hd.privateKey!);
  }) as Hex;

  const jwtSecret = value("JWT_SECRET", () => "local-development-secret-change-me-in-production");
  if (production && jwtSecret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

  return {
    production,
    port: Number(value("PORT", () => "4000")),
    webOrigin: value("WEB_ORIGIN", () => "http://localhost:3000"),
    publicApiUrl: value("PUBLIC_API_URL", () => "http://localhost:4000"),
    databaseUrl: value("DATABASE_URL", () => "postgres://rwa:rwa@localhost:5433/rwa"),
    indexerSchema: value("INDEXER_SCHEMA", () => "indexer"),
    chainId,
    rpcUrl: value("RPC_URL", () => "http://127.0.0.1:8545"),
    jwtSecret,
    jwtTtl: value("JWT_TTL", () => "8h"),
    piiKey: Buffer.from(piiKeyHex, "hex"),
    registrarKey,
    kycValidityDays: Number(value("KYC_VALIDITY_DAYS", () => "365")),
  };
}
