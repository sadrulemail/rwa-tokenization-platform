import { type Address, keccak256, toHex, zeroHash } from "viem";

import { deployments } from "./generated/deployments";

export * from "./generated/abis";
export { deployments };

export type Deployment = {
  chainId: number;
  startBlock: number;
  settlementToken: Address;
  identityRegistry: Address;
  assetRegistry: Address;
  assetTokenImplementation: Address;
  assetComplianceImplementation: Address;
  issuanceDesk: Address;
  assetFactory: Address;
  roles: Record<"admin" | "officer" | "operator" | "valuator" | "treasury" | "registrar", Address>;
};

export function getDeployment(chainId: number): Deployment {
  const deployment = (deployments as Record<number, unknown>)[chainId];
  if (!deployment) throw new Error(`No deployment for chain ${chainId}. Run the deploy script first.`);
  return deployment as Deployment;
}

/** Settlement token (USDC style) has 6 decimals; asset shares have 18. */
export const SETTLEMENT_DECIMALS = 6;
export const SHARE_DECIMALS = 18;

export const ROLES = {
  DEFAULT_ADMIN: zeroHash,
  AGENT: keccak256(toHex("AGENT_ROLE")),
  ISSUER: keccak256(toHex("ISSUER_ROLE")),
  VALUATOR: keccak256(toHex("VALUATOR_ROLE")),
  DISTRIBUTOR: keccak256(toHex("DISTRIBUTOR_ROLE")),
  COMPLIANCE: keccak256(toHex("COMPLIANCE_ROLE")),
  REGISTRAR: keccak256(toHex("REGISTRAR_ROLE")),
  RECORDS: keccak256(toHex("RECORDS_ROLE")),
  ASSET_MANAGER: keccak256(toHex("ASSET_MANAGER_ROLE")),
  OPERATOR: keccak256(toHex("OPERATOR_ROLE")),
  APPROVER: keccak256(toHex("APPROVER_ROLE")),
} as const;

export const ASSET_CLASSES = ["Real estate", "Private credit", "Investment fund"] as const;
export const ASSET_STATUSES = ["Active", "Suspended", "Retired"] as const;
export const REQUEST_KINDS = ["Subscription", "Redemption", "Allocation"] as const;
export const REQUEST_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"] as const;

export const INVESTOR_TIERS: Record<number, string> = {
  1: "Retail",
  2: "Professional",
  3: "Institutional",
};

/** Messages for TransferCode values returned by AssetToken.transferStatus. */
export const TRANSFER_CODES: Record<number, string> = {
  0: "Allowed",
  1: "Trading in this asset is paused",
  2: "The sending wallet is frozen",
  3: "The receiving wallet is frozen",
  4: "The sender's KYC is missing or expired",
  5: "The receiver is not a verified investor",
  6: "Amount exceeds the wallet balance",
  7: "Part of the balance is locked for a pending redemption",
  8: "The lock-up period is still running",
  9: "The receiver's investor tier is below the asset minimum",
  10: "The receiver's country is restricted for this asset",
  11: "The asset has reached its maximum number of holders",
  12: "The receiver would exceed the per-investor holding limit",
  13: "The asset's maximum supply would be exceeded",
};

export type Country = { alpha2: string; numeric: number; name: string };

/** ISO 3166-1 countries offered in onboarding. The identity registry stores the numeric code. */
export const COUNTRIES: Country[] = [
  { alpha2: "AE", numeric: 784, name: "United Arab Emirates" },
  { alpha2: "AU", numeric: 36, name: "Australia" },
  { alpha2: "BD", numeric: 50, name: "Bangladesh" },
  { alpha2: "BE", numeric: 56, name: "Belgium" },
  { alpha2: "BR", numeric: 76, name: "Brazil" },
  { alpha2: "CA", numeric: 124, name: "Canada" },
  { alpha2: "CH", numeric: 756, name: "Switzerland" },
  { alpha2: "CN", numeric: 156, name: "China" },
  { alpha2: "CU", numeric: 192, name: "Cuba" },
  { alpha2: "DE", numeric: 276, name: "Germany" },
  { alpha2: "DK", numeric: 208, name: "Denmark" },
  { alpha2: "ES", numeric: 724, name: "Spain" },
  { alpha2: "FI", numeric: 246, name: "Finland" },
  { alpha2: "FR", numeric: 250, name: "France" },
  { alpha2: "GB", numeric: 826, name: "United Kingdom" },
  { alpha2: "HK", numeric: 344, name: "Hong Kong" },
  { alpha2: "IE", numeric: 372, name: "Ireland" },
  { alpha2: "IN", numeric: 356, name: "India" },
  { alpha2: "IR", numeric: 364, name: "Iran" },
  { alpha2: "IT", numeric: 380, name: "Italy" },
  { alpha2: "JP", numeric: 392, name: "Japan" },
  { alpha2: "KP", numeric: 408, name: "North Korea" },
  { alpha2: "KR", numeric: 410, name: "South Korea" },
  { alpha2: "LU", numeric: 442, name: "Luxembourg" },
  { alpha2: "MY", numeric: 458, name: "Malaysia" },
  { alpha2: "NL", numeric: 528, name: "Netherlands" },
  { alpha2: "NO", numeric: 578, name: "Norway" },
  { alpha2: "NZ", numeric: 554, name: "New Zealand" },
  { alpha2: "PK", numeric: 586, name: "Pakistan" },
  { alpha2: "QA", numeric: 634, name: "Qatar" },
  { alpha2: "SA", numeric: 682, name: "Saudi Arabia" },
  { alpha2: "SE", numeric: 752, name: "Sweden" },
  { alpha2: "SG", numeric: 702, name: "Singapore" },
  { alpha2: "SY", numeric: 760, name: "Syria" },
  { alpha2: "US", numeric: 840, name: "United States" },
  { alpha2: "ZA", numeric: 710, name: "South Africa" },
];

export const countryByNumeric = (numeric: number) => COUNTRIES.find((c) => c.numeric === numeric);
export const countryByAlpha2 = (alpha2: string) =>
  COUNTRIES.find((c) => c.alpha2 === alpha2.toUpperCase());

/** Comprehensively sanctioned jurisdictions: onboarding screening rejects these outright. */
export const SANCTIONED_COUNTRIES = ["CU", "IR", "KP", "SY"];

/** Staff roles used by the API and web app. */
export const STAFF_ROLES = ["ADMIN", "COMPLIANCE_OFFICER", "ASSET_MANAGER", "VALUATOR", "TREASURY"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type AppRole = StaffRole | "INVESTOR";

export const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

/**
 * Who each Anvil development account plays in the local environment. Index = HD address index.
 * Index 5 is the KYC service wallet used by the API only.
 */
export const LOCAL_ACCOUNTS: { index: number; label: string; role: AppRole | "REGISTRAR" }[] = [
  { index: 0, label: "Platform admin", role: "ADMIN" },
  { index: 1, label: "Compliance officer", role: "COMPLIANCE_OFFICER" },
  { index: 2, label: "Asset manager", role: "ASSET_MANAGER" },
  { index: 3, label: "Valuer", role: "VALUATOR" },
  { index: 4, label: "Treasury", role: "TREASURY" },
  { index: 5, label: "KYC service", role: "REGISTRAR" },
  { index: 6, label: "Amelia Hart", role: "INVESTOR" },
  { index: 7, label: "Daniel Brooks", role: "INVESTOR" },
  { index: 8, label: "Tan Mei Lin", role: "INVESTOR" },
  { index: 9, label: "Lukas Weber", role: "INVESTOR" },
  { index: 10, label: "Sofia Marino", role: "INVESTOR" },
  { index: 11, label: "Rahim Chowdhury", role: "INVESTOR" },
];
