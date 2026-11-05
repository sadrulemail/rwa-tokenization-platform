import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("runs locally with no environment", () => {
    const config = loadConfig({});
    expect(config.chainId).toBe(31337);
    expect(config.piiKey).toHaveLength(32);
    expect(config.registrarKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("requires secrets in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/must be set in production/);
  });

  it("rejects a malformed PII key", () => {
    expect(() => loadConfig({ PII_ENCRYPTION_KEY: "abc" })).toThrow(/64 hex/);
  });

  it("never falls back to a development key on a public chain", () => {
    expect(() => loadConfig({ CHAIN_ID: "421614" })).toThrow(/REGISTRAR_PRIVATE_KEY/);
  });
});
