import { index, onchainTable, primaryKey } from "ponder";

/** One row per tokenized asset: deed data, live supply, valuation and income totals. */
export const asset = onchainTable(
  "asset",
  (t) => ({
    token: t.hex().primaryKey(),
    assetId: t.bigint().notNull(),
    compliance: t.hex().notNull(),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    assetClass: t.integer().notNull(),
    jurisdiction: t.text().notNull(),
    metadataUri: t.text().notNull(),
    documentHash: t.hex().notNull(),
    custodian: t.hex().notNull(),
    status: t.integer().notNull(),
    maxSupply: t.bigint().notNull(),
    totalSupply: t.bigint().notNull(),
    holderCount: t.integer().notNull(),
    navPerShare: t.bigint().notNull(),
    assetValue: t.bigint().notNull(),
    valuationAt: t.bigint().notNull(),
    valuationReportHash: t.hex().notNull(),
    incomeDeposited: t.bigint().notNull(),
    incomeClaimed: t.bigint().notNull(),
    distributionCount: t.integer().notNull(),
    paused: t.boolean().notNull(),
    createdAt: t.bigint().notNull(),
    createdTx: t.hex().notNull(),
  }),
  (table) => ({ assetIdIdx: index().on(table.assetId) }),
);

export const valuation = onchainTable(
  "valuation",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    navPerShare: t.bigint().notNull(),
    assetValue: t.bigint().notNull(),
    reportHash: t.hex().notNull(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ tokenIdx: index().on(table.token, table.timestamp) }),
);

export const holding = onchainTable(
  "holding",
  (t) => ({
    token: t.hex().notNull(),
    account: t.hex().notNull(),
    balance: t.bigint().notNull(),
    locked: t.bigint().notNull(),
    frozen: t.boolean().notNull(),
    incomeClaimed: t.bigint().notNull(),
    firstAcquiredAt: t.bigint(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.token, table.account] }),
    accountIdx: index().on(table.account),
  }),
);

export const shareTransfer = onchainTable(
  "share_transfer",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    fromAccount: t.hex().notNull(),
    toAccount: t.hex().notNull(),
    amount: t.bigint().notNull(),
    kind: t.text().notNull(), // MINT | BURN | TRANSFER
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    tokenIdx: index().on(table.token, table.timestamp),
    fromIdx: index().on(table.fromAccount),
    toIdx: index().on(table.toAccount),
  }),
);

export const distribution = onchainTable(
  "distribution",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    distributionId: t.bigint().notNull(),
    amount: t.bigint().notNull(),
    totalSupply: t.bigint().notNull(),
    statementHash: t.hex().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ tokenIdx: index().on(table.token, table.timestamp) }),
);

export const incomeClaim = onchainTable(
  "income_claim",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    account: t.hex().notNull(),
    amount: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({ accountIdx: index().on(table.account) }),
);

export const deskRequest = onchainTable(
  "desk_request",
  (t) => ({
    id: t.bigint().primaryKey(),
    kind: t.integer().notNull(), // 0 subscription, 1 redemption, 2 allocation
    status: t.integer().notNull(), // 0 pending, 1 approved, 2 rejected, 3 cancelled
    token: t.hex().notNull(),
    account: t.hex().notNull(),
    requestedBy: t.hex().notNull(),
    amount: t.bigint().notNull(),
    minimumOut: t.bigint().notNull(), // min shares (subscription) or min payout (redemption)
    settled: t.bigint(),
    reason: t.text(),
    decidedBy: t.hex(),
    createdAt: t.bigint().notNull(),
    decidedAt: t.bigint(),
    createdTx: t.hex().notNull(),
    decidedTx: t.hex(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
    accountIdx: index().on(table.account),
    tokenIdx: index().on(table.token),
  }),
);

export const investor = onchainTable("investor", (t) => ({
  wallet: t.hex().primaryKey(),
  registered: t.boolean().notNull(),
  country: t.integer().notNull(),
  tier: t.integer().notNull(),
  expiresAt: t.bigint().notNull(),
  registeredAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
}));

export const complianceRules = onchainTable("compliance_rules", (t) => ({
  compliance: t.hex().primaryKey(),
  minTier: t.integer().notNull(),
  maxHolders: t.bigint().notNull(),
  lockupUntil: t.bigint().notNull(),
  maxBalance: t.bigint().notNull(),
  blockedCountries: t.json().$type<number[]>().notNull(),
  updatedAt: t.bigint().notNull(),
}));

/** Every platform event in order: the on-chain half of the audit trail. */
export const activity = onchainTable(
  "activity",
  (t) => ({
    id: t.text().primaryKey(),
    timestamp: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    logIndex: t.integer().notNull(),
    txHash: t.hex().notNull(),
    sender: t.hex().notNull(),
    contract: t.text().notNull(),
    event: t.text().notNull(),
    token: t.hex(),
    account: t.hex(),
    data: t.json().$type<Record<string, unknown>>().notNull(),
  }),
  (table) => ({
    timeIdx: index().on(table.timestamp),
    tokenIdx: index().on(table.token),
    accountIdx: index().on(table.account),
  }),
);
