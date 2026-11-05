import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatShares, formatUsd, parseAmount, payoutFor, sharesFor, shortAddress, walletLabel } from "./format";

describe("format helpers", () => {
  it("formats stablecoin amounts", () => {
    assert.equal(formatUsd("1234560000"), "$1,234.56");
    assert.equal(formatUsd("4262124000000", { compact: true }), "$4.26M");
    assert.equal(formatUsd(null), "$0.00");
  });

  it("formats share amounts", () => {
    assert.equal(formatShares("94500000000000000000000"), "94,500");
    assert.equal(formatShares("1500000000000000000"), "1.5");
  });

  it("parses user input safely", () => {
    assert.equal(parseAmount("1,250.5", 6), 1_250_500_000n);
    assert.equal(parseAmount("0.0000001", 6), null);
    assert.equal(parseAmount("abc", 6), null);
    assert.equal(parseAmount("-1", 6), null);
  });

  it("prices subscriptions and redemptions at NAV", () => {
    const nav = 10_480_000n; // $10.48
    assert.equal(sharesFor(10_480_000_000n, nav), 1_000n * 10n ** 18n);
    assert.equal(payoutFor(1_000n * 10n ** 18n, nav), 10_480_000_000n);
    assert.equal(sharesFor(1n, 0n), 0n);
  });

  it("labels local development wallets", () => {
    assert.equal(walletLabel("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), "Compliance officer");
    assert.equal(walletLabel("0x0000000000000000000000000000000000000001"), null);
    assert.equal(shortAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), "0x7099…79C8");
  });
});
