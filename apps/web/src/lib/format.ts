import { ANVIL_MNEMONIC, LOCAL_ACCOUNTS } from "@rwa/contracts";
import { formatUnits, parseUnits } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export const USDC = 6;
export const SHARES = 18;

type Amount = string | bigint | null | undefined;

const big = (v: Amount) => (v === null || v === undefined || v === "" ? 0n : BigInt(v));

export function toNumber(value: Amount, decimals: number): number {
  return Number(formatUnits(big(value), decimals));
}

/** "$1,234.56", or "$4.26M" with compact. */
export function formatUsd(value: Amount, opts: { compact?: boolean; decimals?: number } = {}): string {
  const n = toNumber(value, opts.decimals ?? USDC);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 2 : 2,
    minimumFractionDigits: opts.compact ? 0 : 2,
  }).format(n);
}

export function formatShares(value: Amount, maxFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(toNumber(value, SHARES));
}

export function formatNumber(n: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(n);
}

export function formatPct(fraction: number, digits = 2): string {
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(digits)}%`;
}

export function shortAddress(address?: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDate(unixSeconds: Amount | number | Date, withTime = false): string {
  const date =
    unixSeconds instanceof Date ? unixSeconds : new Date(Number(typeof unixSeconds === "number" ? unixSeconds : big(unixSeconds)) * 1000);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

/** Parses user input like "1,250.5" into token units; null when invalid. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const clean = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const [, fraction = ""] = clean.split(".");
  if (fraction.length > decimals) return null;
  try {
    return parseUnits(clean, decimals);
  } catch {
    return null;
  }
}

/** Shares bought for `payment` stablecoin at `navPerShare`. */
export function sharesFor(payment: bigint, navPerShare: bigint): bigint {
  return navPerShare === 0n ? 0n : (payment * 10n ** 18n) / navPerShare;
}

/** Stablecoin paid for redeeming `shares` at `navPerShare`. */
export function payoutFor(shares: bigint, navPerShare: bigint): bigint {
  return (shares * navPerShare) / 10n ** 18n;
}

let localLabels: Map<string, string> | null = null;

/** Display names of the local Anvil accounts (local chain only). */
export function walletLabel(address?: string | null): string | null {
  if (!address) return null;
  if (!localLabels) {
    localLabels = new Map(
      LOCAL_ACCOUNTS.map((a) => [
        mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: a.index }).address.toLowerCase(),
        a.label,
      ]),
    );
  }
  return localLabels.get(address.toLowerCase()) ?? null;
}
