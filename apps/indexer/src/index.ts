import { assetComplianceAbi, assetRegistryAbi, assetTokenAbi } from "@rwa/contracts";
import { replaceBigInts } from "ponder";
import { type Context, type Event, ponder } from "ponder:registry";
import {
  activity,
  asset,
  complianceRules,
  deskRequest,
  distribution,
  holding,
  incomeClaim,
  investor,
  shareTransfer,
  valuation,
} from "ponder:schema";
import { type Address, zeroAddress } from "viem";

// ------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------

type AnyEvent = Event;
type AnyContext = Context;

const eventId = (event: AnyEvent) => `${event.transaction.hash}-${event.log.logIndex}`;
const lower = (a: Address) => a.toLowerCase() as Address;

async function record(
  event: AnyEvent,
  context: AnyContext,
  contract: string,
  name: string,
  refs: { token?: Address; account?: Address } = {},
) {
  await context.db
    .insert(activity)
    .values({
      id: eventId(event),
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
      logIndex: event.log.logIndex,
      txHash: event.transaction.hash,
      sender: lower(event.transaction.from),
      contract,
      event: name,
      token: refs.token ? lower(refs.token) : null,
      account: refs.account ? lower(refs.account) : null,
      data: replaceBigInts((event as { args?: Record<string, unknown> }).args ?? {}, (v) => v.toString()),
    })
    .onConflictDoNothing();
}

async function upsertHolding(
  context: AnyContext,
  token: Address,
  account: Address,
  timestamp: bigint,
  change: (row: { balance: bigint; locked: bigint; frozen: boolean; incomeClaimed: bigint }) => Partial<{
    balance: bigint;
    locked: bigint;
    frozen: boolean;
    incomeClaimed: bigint;
  }>,
) {
  const key = { token: lower(token), account: lower(account) };
  const existing = await context.db.find(holding, key);
  const base = existing ?? { balance: 0n, locked: 0n, frozen: false, incomeClaimed: 0n, firstAcquiredAt: null };
  const next = { ...base, ...change(base) };
  const firstAcquiredAt = base.firstAcquiredAt ?? (next.balance > 0n ? timestamp : null);
  await context.db
    .insert(holding)
    .values({ ...key, ...next, firstAcquiredAt, updatedAt: timestamp })
    .onConflictDoUpdate({ ...next, firstAcquiredAt, updatedAt: timestamp });
}

async function updateAsset(
  context: AnyContext,
  token: Address,
  change: (row: typeof asset.$inferSelect) => Partial<typeof asset.$inferInsert>,
) {
  const row = await context.db.find(asset, { token: lower(token) });
  if (row) await context.db.update(asset, { token: lower(token) }).set(change(row));
}

// ------------------------------------------------------------------------------------------
// Identity registry
// ------------------------------------------------------------------------------------------

ponder.on("IdentityRegistry:InvestorRegistered", async ({ event, context }) => {
  const { wallet, country, tier, expiresAt } = event.args;
  const values = {
    registered: true,
    country,
    tier,
    expiresAt,
    updatedAt: event.block.timestamp,
  };
  await context.db
    .insert(investor)
    .values({ wallet: lower(wallet), ...values, registeredAt: event.block.timestamp })
    .onConflictDoUpdate({ ...values, registeredAt: event.block.timestamp });
  await record(event, context, "IdentityRegistry", "InvestorRegistered", { account: wallet });
});

ponder.on("IdentityRegistry:InvestorUpdated", async ({ event, context }) => {
  const { wallet, country, tier, expiresAt } = event.args;
  await context.db
    .update(investor, { wallet: lower(wallet) })
    .set({ registered: true, country, tier, expiresAt, updatedAt: event.block.timestamp });
  await record(event, context, "IdentityRegistry", "InvestorUpdated", { account: wallet });
});

ponder.on("IdentityRegistry:InvestorRevoked", async ({ event, context }) => {
  await context.db
    .update(investor, { wallet: lower(event.args.wallet) })
    .set({ registered: false, updatedAt: event.block.timestamp });
  await record(event, context, "IdentityRegistry", "InvestorRevoked", { account: event.args.wallet });
});

// ------------------------------------------------------------------------------------------
// Asset factory and registry
// ------------------------------------------------------------------------------------------

ponder.on("AssetFactory:AssetCreated", async ({ event, context }) => {
  const { assetId, token, compliance, assetClass, name, symbol } = event.args;
  const blockNumber = event.block.number;
  const registry = context.contracts.AssetRegistry.address as Address;
  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) =>
    context.client.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never, blockNumber }) as Promise<T>;

  const [record_, custodian, maxSupply, navPerShare, assetValue, valuationAt, reportHash, rules] = await Promise.all([
    read<{ status: number; metadataURI: string; documentHash: `0x${string}`; jurisdiction: string }>(
      registry,
      assetRegistryAbi,
      "assetOf",
      [assetId],
    ),
    read<Address>(registry, assetRegistryAbi, "ownerOf", [assetId]),
    read<bigint>(token, assetTokenAbi, "maxSupply"),
    read<bigint>(token, assetTokenAbi, "navPerShare"),
    read<bigint>(token, assetTokenAbi, "assetValue"),
    read<bigint>(token, assetTokenAbi, "valuationTimestamp"),
    read<`0x${string}`>(token, assetTokenAbi, "valuationReportHash"),
    read<{ minTier: number; maxHolders: number; lockupUntil: bigint; maxBalance: bigint }>(
      compliance,
      assetComplianceAbi,
      "rules",
    ),
  ]);

  await context.db.insert(asset).values({
    token: lower(token),
    assetId,
    compliance: lower(compliance),
    name,
    symbol,
    assetClass,
    jurisdiction: record_.jurisdiction,
    metadataUri: record_.metadataURI,
    documentHash: record_.documentHash,
    custodian: lower(custodian),
    status: record_.status,
    maxSupply,
    totalSupply: 0n,
    holderCount: 0,
    navPerShare,
    assetValue,
    valuationAt: BigInt(valuationAt),
    valuationReportHash: reportHash,
    incomeDeposited: 0n,
    incomeClaimed: 0n,
    distributionCount: 0,
    paused: false,
    createdAt: event.block.timestamp,
    createdTx: event.transaction.hash,
  });

  // Rules from the clone's initializer; blocked countries arrive as their own events.
  await context.db
    .insert(complianceRules)
    .values({
      compliance: lower(compliance),
      minTier: rules.minTier,
      maxHolders: BigInt(rules.maxHolders),
      lockupUntil: BigInt(rules.lockupUntil),
      maxBalance: rules.maxBalance,
      blockedCountries: [],
      updatedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  await record(event, context, "AssetFactory", "AssetCreated", { token });
});

ponder.on("AssetRegistry:AssetStatusChanged", async ({ event, context }) => {
  const token = await context.client.readContract({
    address: context.contracts.AssetRegistry.address as Address,
    abi: assetRegistryAbi,
    functionName: "assetOf",
    args: [event.args.assetId],
    blockNumber: event.block.number,
  });
  await updateAsset(context, token.shareToken, () => ({ status: event.args.status }));
  await record(event, context, "AssetRegistry", "AssetStatusChanged", { token: token.shareToken });
});

ponder.on("AssetRegistry:AssetDocumentsUpdated", async ({ event, context }) => {
  const record_ = await context.client.readContract({
    address: context.contracts.AssetRegistry.address as Address,
    abi: assetRegistryAbi,
    functionName: "assetOf",
    args: [event.args.assetId],
    blockNumber: event.block.number,
  });
  await updateAsset(context, record_.shareToken, () => ({
    metadataUri: event.args.metadataURI,
    documentHash: event.args.documentHash,
  }));
  await record(event, context, "AssetRegistry", "AssetDocumentsUpdated", { token: record_.shareToken });
});

ponder.on("AssetRegistry:CustodyTransferred", async ({ event, context }) => {
  const record_ = await context.client.readContract({
    address: context.contracts.AssetRegistry.address as Address,
    abi: assetRegistryAbi,
    functionName: "assetOf",
    args: [event.args.assetId],
    blockNumber: event.block.number,
  });
  await updateAsset(context, record_.shareToken, () => ({ custodian: lower(event.args.to) }));
  await record(event, context, "AssetRegistry", "CustodyTransferred", { token: record_.shareToken });
});

// ------------------------------------------------------------------------------------------
// Compliance modules
// ------------------------------------------------------------------------------------------

ponder.on("AssetCompliance:RulesUpdated", async ({ event, context }) => {
  const { rules } = event.args;
  const values = {
    minTier: rules.minTier,
    maxHolders: BigInt(rules.maxHolders),
    lockupUntil: BigInt(rules.lockupUntil),
    maxBalance: rules.maxBalance,
    updatedAt: event.block.timestamp,
  };
  await context.db
    .insert(complianceRules)
    .values({ compliance: lower(event.log.address), ...values, blockedCountries: [] })
    .onConflictDoUpdate(values);
  await record(event, context, "AssetCompliance", "RulesUpdated");
});

ponder.on("AssetCompliance:CountryRestrictionUpdated", async ({ event, context }) => {
  const key = { compliance: lower(event.log.address) };
  const existing = await context.db.find(complianceRules, key);
  const current = new Set(existing?.blockedCountries ?? []);
  if (event.args.blocked) current.add(event.args.country);
  else current.delete(event.args.country);
  const blockedCountries = [...current].sort((a, b) => a - b);
  if (existing) {
    await context.db.update(complianceRules, key).set({ blockedCountries, updatedAt: event.block.timestamp });
  } else {
    await context.db.insert(complianceRules).values({
      ...key,
      minTier: 0,
      maxHolders: 0n,
      lockupUntil: 0n,
      maxBalance: 0n,
      blockedCountries,
      updatedAt: event.block.timestamp,
    });
  }
  await record(event, context, "AssetCompliance", "CountryRestrictionUpdated");
});

// ------------------------------------------------------------------------------------------
// Asset tokens
// ------------------------------------------------------------------------------------------

ponder.on("AssetToken:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  const token = event.log.address;
  const kind = from === zeroAddress ? "MINT" : to === zeroAddress ? "BURN" : "TRANSFER";
  const ts = event.block.timestamp;

  await context.db.insert(shareTransfer).values({
    id: eventId(event),
    token: lower(token),
    fromAccount: lower(from),
    toAccount: lower(to),
    amount: value,
    kind,
    timestamp: ts,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });

  let holderDelta = 0;
  if (from !== zeroAddress && value > 0n && from !== to) {
    const before = (await context.db.find(holding, { token: lower(token), account: lower(from) }))?.balance ?? 0n;
    if (before === value) holderDelta -= 1;
    await upsertHolding(context, token, from, ts, (h) => ({ balance: h.balance - value }));
  }
  if (to !== zeroAddress && value > 0n && from !== to) {
    const before = (await context.db.find(holding, { token: lower(token), account: lower(to) }))?.balance ?? 0n;
    if (before === 0n) holderDelta += 1;
    await upsertHolding(context, token, to, ts, (h) => ({ balance: h.balance + value }));
  }
  await updateAsset(context, token, (a) => ({
    totalSupply: kind === "MINT" ? a.totalSupply + value : kind === "BURN" ? a.totalSupply - value : a.totalSupply,
    holderCount: a.holderCount + holderDelta,
  }));
  await record(event, context, "AssetToken", "Transfer", { token, account: kind === "MINT" ? to : from });
});

ponder.on("AssetToken:ValuationUpdated", async ({ event, context }) => {
  const token = event.log.address;
  const { navPerShare, assetValue, reportHash, timestamp } = event.args;
  await context.db.insert(valuation).values({
    id: eventId(event),
    token: lower(token),
    navPerShare,
    assetValue,
    reportHash,
    timestamp: BigInt(timestamp),
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
  await updateAsset(context, token, () => ({
    navPerShare,
    assetValue,
    valuationAt: BigInt(timestamp),
    valuationReportHash: reportHash,
  }));
  await record(event, context, "AssetToken", "ValuationUpdated", { token });
});

ponder.on("AssetToken:IncomeDeposited", async ({ event, context }) => {
  const token = event.log.address;
  const { distributionId, amount, totalSupply, statementHash } = event.args;
  await context.db.insert(distribution).values({
    id: eventId(event),
    token: lower(token),
    distributionId,
    amount,
    totalSupply,
    statementHash,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  await updateAsset(context, token, (a) => ({
    incomeDeposited: a.incomeDeposited + amount,
    distributionCount: a.distributionCount + 1,
  }));
  await record(event, context, "AssetToken", "IncomeDeposited", { token });
});

ponder.on("AssetToken:IncomeClaimed", async ({ event, context }) => {
  const token = event.log.address;
  const { account, amount } = event.args;
  await context.db.insert(incomeClaim).values({
    id: eventId(event),
    token: lower(token),
    account: lower(account),
    amount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  await upsertHolding(context, token, account, event.block.timestamp, (h) => ({
    incomeClaimed: h.incomeClaimed + amount,
  }));
  await updateAsset(context, token, (a) => ({ incomeClaimed: a.incomeClaimed + amount }));
  await record(event, context, "AssetToken", "IncomeClaimed", { token, account });
});

ponder.on("AssetToken:AddressFrozen", async ({ event, context }) => {
  const token = event.log.address;
  await upsertHolding(context, token, event.args.account, event.block.timestamp, () => ({
    frozen: event.args.frozen,
  }));
  await record(event, context, "AssetToken", "AddressFrozen", { token, account: event.args.account });
});

ponder.on("AssetToken:SharesLocked", async ({ event, context }) => {
  const token = event.log.address;
  await upsertHolding(context, token, event.args.holder, event.block.timestamp, () => ({
    locked: event.args.totalLocked,
  }));
  await record(event, context, "AssetToken", "SharesLocked", { token, account: event.args.holder });
});

ponder.on("AssetToken:SharesUnlocked", async ({ event, context }) => {
  const token = event.log.address;
  await upsertHolding(context, token, event.args.holder, event.block.timestamp, () => ({
    locked: event.args.totalLocked,
  }));
  await record(event, context, "AssetToken", "SharesUnlocked", { token, account: event.args.holder });
});

ponder.on("AssetToken:ForcedTransfer", async ({ event, context }) => {
  await record(event, context, "AssetToken", "ForcedTransfer", {
    token: event.log.address,
    account: event.args.from,
  });
});

ponder.on("AssetToken:WalletRecovered", async ({ event, context }) => {
  const token = event.log.address;
  const { lostWallet, newWallet } = event.args;
  const lost = await context.db.find(holding, { token: lower(token), account: lower(lostWallet) });
  const moved = lost?.locked ?? 0n;
  if (moved > 0n) {
    await upsertHolding(context, token, lostWallet, event.block.timestamp, () => ({ locked: 0n }));
    await upsertHolding(context, token, newWallet, event.block.timestamp, (h) => ({ locked: h.locked + moved }));
  }
  await record(event, context, "AssetToken", "WalletRecovered", { token, account: lostWallet });
});

ponder.on("AssetToken:Paused", async ({ event, context }) => {
  await updateAsset(context, event.log.address, () => ({ paused: true }));
  await record(event, context, "AssetToken", "Paused", { token: event.log.address });
});

ponder.on("AssetToken:Unpaused", async ({ event, context }) => {
  await updateAsset(context, event.log.address, () => ({ paused: false }));
  await record(event, context, "AssetToken", "Unpaused", { token: event.log.address });
});

ponder.on("AssetToken:ComplianceUpdated", async ({ event, context }) => {
  await updateAsset(context, event.log.address, () => ({ compliance: lower(event.args.compliance) }));
  await record(event, context, "AssetToken", "ComplianceUpdated", { token: event.log.address });
});

ponder.on("AssetToken:MaxSupplyUpdated", async ({ event, context }) => {
  await updateAsset(context, event.log.address, () => ({ maxSupply: event.args.maxSupply }));
  await record(event, context, "AssetToken", "MaxSupplyUpdated", { token: event.log.address });
});

// ------------------------------------------------------------------------------------------
// Issuance desk
// ------------------------------------------------------------------------------------------

ponder.on("IssuanceDesk:RequestCreated", async ({ event, context }) => {
  const { id, kind, token, account, requestedBy, amount, limit } = event.args;
  await context.db.insert(deskRequest).values({
    id,
    kind,
    status: 0,
    token: lower(token),
    account: lower(account),
    requestedBy: lower(requestedBy),
    amount,
    minimumOut: limit,
    createdAt: event.block.timestamp,
    createdTx: event.transaction.hash,
  });
  await record(event, context, "IssuanceDesk", "RequestCreated", { token, account });
});

ponder.on("IssuanceDesk:RequestApproved", async ({ event, context }) => {
  const row = await context.db.update(deskRequest, { id: event.args.id }).set({
    status: 1,
    settled: event.args.settled,
    decidedBy: lower(event.args.approver),
    decidedAt: event.block.timestamp,
    decidedTx: event.transaction.hash,
  });
  await record(event, context, "IssuanceDesk", "RequestApproved", { token: row.token, account: row.account });
});

ponder.on("IssuanceDesk:RequestRejected", async ({ event, context }) => {
  const row = await context.db.update(deskRequest, { id: event.args.id }).set({
    status: 2,
    reason: event.args.reason,
    decidedBy: lower(event.args.approver),
    decidedAt: event.block.timestamp,
    decidedTx: event.transaction.hash,
  });
  await record(event, context, "IssuanceDesk", "RequestRejected", { token: row.token, account: row.account });
});

ponder.on("IssuanceDesk:RequestCancelled", async ({ event, context }) => {
  const row = await context.db.update(deskRequest, { id: event.args.id }).set({
    status: 3,
    decidedBy: lower(event.args.by),
    decidedAt: event.block.timestamp,
    decidedTx: event.transaction.hash,
  });
  await record(event, context, "IssuanceDesk", "RequestCancelled", { token: row.token, account: row.account });
});
