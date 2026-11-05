import type { AppRole } from "@rwa/contracts";

import { API_URL } from "./env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: { token?: string | null; method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join("; ") : (data?.message ?? res.statusText);
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---- API response types (amounts are decimal strings) ------------------------------------

export type SessionUser = { wallet: string; role: AppRole };

export type KycStatus = {
  applicationId: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "REVOKED" | "EXPIRED";
  submittedAt: string;
  requestedTier: number;
  approvedTier: number | null;
  expiresAt: string | null;
  decisionReason: string | null;
  txHash: string | null;
};

export type Me = SessionUser & { kyc: KycStatus | null };

export type Asset = {
  token: `0x${string}`;
  assetId: string;
  compliance: `0x${string}`;
  name: string;
  symbol: string;
  assetClass: number;
  jurisdiction: string;
  metadataUri: string;
  documentHash: string;
  custodian: string;
  status: number;
  paused: boolean;
  maxSupply: string;
  totalSupply: string;
  holderCount: number;
  navPerShare: string;
  assetValue: string;
  valuationAt: string;
  valuationReportHash: string;
  incomeDeposited: string;
  incomeClaimed: string;
  distributionCount: number;
  createdAt: string;
  createdTx: string;
  marketValue: string;
  profileId: string | null;
  location: string | null;
  description: string | null;
  highlights: string[] | null;
  documents: { name: string; sha256: string }[] | null;
  targetYieldBps: number | null;
  distributionFrequency: string | null;
  minTier: number | null;
  maxHolders: string | null;
  lockupUntil: string | null;
  maxBalance: string | null;
  blockedCountries: number[] | null;
  initialNavPerShare: string | null;
};

export type Summary = {
  assets: number;
  marketValue: string;
  assetValue: string;
  incomeDistributed: string;
  holderPositions: number;
  investors: number;
  pendingRequests: number;
  transfers: number;
};

export type Valuation = {
  navPerShare: string;
  assetValue: string;
  reportHash: string;
  timestamp: string;
  txHash: string;
};

export type Distribution = {
  distributionId: string;
  amount: string;
  totalSupply: string;
  statementHash: string;
  timestamp: string;
  txHash: string;
};

export type ShareTransfer = {
  id: string;
  fromAccount: string;
  toAccount: string;
  amount: string;
  kind: "MINT" | "BURN" | "TRANSFER";
  timestamp: string;
  txHash: string;
};

export type Holder = {
  account: string;
  balance: string;
  locked: string;
  frozen: boolean;
  incomeClaimed: string;
  firstAcquiredAt: string | null;
  country: number | null;
  tier: number | null;
  expiresAt: string | null;
  registered: boolean | null;
};

export type Activity = {
  id: string;
  timestamp: string;
  blockNumber: string;
  txHash: string;
  sender: string;
  contract: string;
  event: string;
  token: string | null;
  account: string | null;
  data: Record<string, string | number | boolean | Record<string, string>>;
  symbol: string | null;
  assetName: string | null;
};

export type DeskRequest = {
  id: string;
  kind: 0 | 1 | 2;
  status: 0 | 1 | 2 | 3;
  token: `0x${string}`;
  account: string;
  requestedBy: string;
  amount: string;
  minimumOut: string;
  settled: string | null;
  reason: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  createdTx: string;
  decidedTx: string | null;
  assetName: string;
  symbol: string;
  navPerShare: string;
};

export type Portfolio = {
  holdings: {
    token: `0x${string}`;
    name: string;
    symbol: string;
    assetClass: number;
    balance: string;
    locked: string;
    frozen: boolean;
    incomeClaimed: string;
    navPerShare: string;
    valuationAt: string;
    value: string;
    firstAcquiredAt: string | null;
  }[];
  identity: { registered: boolean; country: number; tier: number; expiresAt: string } | null;
  claims: { token: string; symbol: string; amount: string; timestamp: string; txHash: string }[];
};

export type ScreeningCheck = { name: string; result: "CLEAR" | "REVIEW" | "FAIL"; detail: string };

export type KycApplication = {
  id: string;
  wallet: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "REVOKED";
  fullName: string;
  email: string;
  dateOfBirth: string | null;
  addressLine: string | null;
  documentType: string;
  documentNumber: string;
  country: { alpha2: string; numeric: number; name?: string };
  requestedTier: number;
  approvedTier: number | null;
  sourceOfFunds: string;
  screening: {
    provider: string;
    checkedAt: string;
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    recommendation: "APPROVE" | "REVIEW" | "REJECT";
    checks: ScreeningCheck[];
  };
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionReason: string | null;
  txHash: string | null;
  expiresAt: string | null;
};

export type AuditEntry = {
  id: string;
  occurredAt: string;
  actorWallet: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown>;
  txHash: string | null;
  prevHash: string;
  hash: string;
};

export type AuditVerification = { valid: boolean; checked: number; brokenAt: string | null; head: string };

export type Dashboard = {
  summary: Summary;
  pendingKyc: number;
  audit: AuditVerification;
  recent: Activity[];
};
