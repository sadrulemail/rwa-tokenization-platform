/**
 * Replays about eleven months of platform activity on the local chain, through the same paths the
 * web app uses: investors sign in with their wallets and submit KYC to the API, the compliance
 * officer reviews it, the asset manager lists three assets, investors subscribe, and the
 * valuer, treasury and officer run valuations, income distributions, transfers and redemptions.
 *
 * Needs: `pnpm chain`, `pnpm deploy:local`, the API (port 4000) and the indexer running.
 * Usage:  pnpm seed
 */
import {
  ANVIL_MNEMONIC,
  assetFactoryAbi,
  assetTokenAbi,
  getDeployment,
  issuanceDeskAbi,
  mockUSDCAbi,
} from "@rwa/contracts";
import {
  type Abi,
  type Address,
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  type Hex,
  http,
  keccak256,
  maxUint256,
  parseUnits,
  toHex,
} from "viem";
import { type HDAccount, mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { createSiweMessage } from "viem/siwe";

const API = process.env.API_URL ?? "http://localhost:4000";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const DAY = 86_400;

const d = getDeployment(31337);
const transport = http(RPC);
const pub = createPublicClient({ chain: foundry, transport });
const testClient = createTestClient({ chain: foundry, mode: "anvil", transport });
const acct = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });

const people = {
  admin: acct(0),
  officer: acct(1),
  manager: acct(2),
  valuer: acct(3),
  treasury: acct(4),
  amelia: acct(6),
  daniel: acct(7),
  tan: acct(8),
  lukas: acct(9),
  sofia: acct(10),
  rahim: acct(11),
};
type Person = keyof typeof people;

// ------------------------------------------------------------------------------------------
// Clock: the local chain starts in the past (pnpm chain), and every step moves it forward.
// ------------------------------------------------------------------------------------------

const now = Math.floor(Date.now() / 1000);
const start = now - 330 * DAY;
let clock = 0;
async function at(dayOffset: number, label: string) {
  const latest = Number((await pub.getBlock()).timestamp);
  const target = Math.max(start + dayOffset * DAY, latest + 1);
  await testClient.setNextBlockTimestamp({ timestamp: BigInt(target) });
  clock = target;
  console.log(`\n[${new Date(target * 1000).toISOString().slice(0, 10)}] ${label}`);
}

// ------------------------------------------------------------------------------------------
// API helpers (Sign-In with Ethereum, then bearer token)
// ------------------------------------------------------------------------------------------

const tokens = new Map<Person, string>();

async function api<T = unknown>(method: string, path: string, who?: Person, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (who) headers.authorization = `Bearer ${await session(who)}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function session(who: Person): Promise<string> {
  const cached = tokens.get(who);
  if (cached) return cached;
  const account = people[who];
  const { nonce } = await api<{ nonce: string }>("GET", "/auth/nonce");
  const message = createSiweMessage({
    domain: new URL(WEB_ORIGIN).host,
    address: account.address,
    statement: "Sign in to the RWA tokenization platform.",
    uri: WEB_ORIGIN,
    version: "1",
    chainId: foundry.id,
    nonce,
  });
  const signature = await account.signMessage({ message });
  const { token } = await api<{ token: string }>("POST", "/auth/verify", undefined, { message, signature });
  tokens.set(who, token);
  return token;
}

// ------------------------------------------------------------------------------------------
// Chain helpers
// ------------------------------------------------------------------------------------------

async function send(
  who: Person,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
  audit?: { action: string; entityType: string; entityId?: string; summary: string },
) {
  const account: HDAccount = people[who];
  const wallet = createWalletClient({ chain: foundry, transport, account });
  const { request } = await pub.simulateContract({ address, abi, functionName, args, account } as never);
  const hash: Hex = await wallet.writeContract(request as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  if (audit) await api("POST", "/audit/onchain", who, { ...audit, txHash: hash });
  return receipt;
}

const usdc = (n: number) => parseUnits(n.toFixed(2), 6);
const shares = (n: number) => parseUnits(String(n), 18);
const fmt = (v: bigint, decimals: number) => (Number(v) / 10 ** decimals).toLocaleString("en-GB");

// ------------------------------------------------------------------------------------------
// Scenario data
// ------------------------------------------------------------------------------------------

const kyc: Record<string, Record<string, unknown>> = {
  amelia: {
    fullName: "Amelia Hart",
    email: "amelia.hart@example.com",
    dateOfBirth: "1986-03-14",
    addressLine: "Flat 12, 4 Quay Street, Manchester M3 3HN",
    country: "GB",
    documentType: "PASSPORT",
    documentNumber: "533401287",
    requestedTier: 2,
    sourceOfFunds: "EMPLOYMENT_INCOME",
  },
  daniel: {
    fullName: "Daniel Brooks",
    email: "dbrooks@example.com",
    dateOfBirth: "1979-11-02",
    addressLine: "220 Hudson Street, Apt 5C, New York NY 10013",
    country: "US",
    documentType: "PASSPORT",
    documentNumber: "584127736",
    requestedTier: 2,
    sourceOfFunds: "BUSINESS_PROFITS",
  },
  tan: {
    fullName: "Tan Mei Lin",
    email: "meilin.tan@example.com",
    dateOfBirth: "1975-07-21",
    addressLine: "8 Marina View, #32-01, Singapore 018960",
    country: "SG",
    documentType: "NATIONAL_ID",
    documentNumber: "S7521634D",
    requestedTier: 3,
    sourceOfFunds: "INSTITUTIONAL_CAPITAL",
  },
  lukas: {
    fullName: "Lukas Weber",
    email: "lukas.weber@example.com",
    dateOfBirth: "1994-01-30",
    addressLine: "Bergmannstrasse 41, 10961 Berlin",
    country: "DE",
    documentType: "NATIONAL_ID",
    documentNumber: "L01X00T47",
    requestedTier: 1,
    sourceOfFunds: "SAVINGS",
  },
  sofia: {
    fullName: "Sofia Marino",
    email: "sofia.marino@example.com",
    dateOfBirth: "1990-09-09",
    addressLine: "Via Roma 1",
    country: "IT",
    documentType: "DRIVING_LICENCE",
    documentNumber: "U1H00T",
    requestedTier: 1,
    sourceOfFunds: "SAVINGS",
  },
  rahim: {
    fullName: "Rahim Chowdhury",
    email: "rahim.chowdhury@example.com",
    dateOfBirth: "1988-05-17",
    addressLine: "House 27, Road 11, Gulshan 2, Dhaka 1212",
    country: "BD",
    documentType: "PASSPORT",
    documentNumber: "EB0472251",
    requestedTier: 2,
    sourceOfFunds: "BUSINESS_PROFITS",
  },
};

const doc = (name: string) => ({ name, sha256: keccak256(toHex(name)).slice(2) });

const assets = [
  {
    key: "HBVR",
    profile: {
      name: "Harbourview Residences",
      assetClass: 0,
      location: "Salford Quays, Manchester, United Kingdom",
      description:
        "A 118-apartment build-to-rent block next to MediaCityUK, fully let since 2024. The SPV owns the freehold; net rent is distributed to holders every month.",
      highlights: ["118 apartments, 97% occupancy", "Freehold held by a UK SPV", "Monthly rent distributions"],
      documents: [doc("Title register MAN-448812"), doc("SPV articles of association"), doc("Valuation report Q4 2025")],
      targetYieldBps: 460,
      distributionFrequency: "Monthly",
    },
    symbol: "HBVR",
    jurisdiction: "GB",
    maxSupply: 2_400_000,
    nav: 10,
    assetValue: 24_000_000,
    rules: { minTier: 1, maxHolders: 500, lockupDays: 90, maxBalance: 0 },
    blocked: [] as number[],
  },
  {
    key: "MSCN",
    profile: {
      name: "Meridian SME Credit Note 2027",
      assetClass: 1,
      location: "Luxembourg",
      description:
        "Senior secured term loans to 40 mid-sized European manufacturers, held in a Luxembourg securitisation vehicle. 9% fixed coupon, paid quarterly; matures in December 2027.",
      highlights: ["Senior secured, average LTV 52%", "9.0% fixed coupon, quarterly", "Professional investors only"],
      documents: [doc("Offering memorandum"), doc("Loan tape December 2025"), doc("Security trustee deed")],
      targetYieldBps: 900,
      distributionFrequency: "Quarterly",
    },
    symbol: "MSCN",
    jurisdiction: "LU",
    maxSupply: 50_000,
    nav: 100,
    assetValue: 5_000_000,
    rules: { minTier: 2, maxHolders: 150, lockupDays: 0, maxBalance: 0 },
    blocked: [840], // Regulation S offering: not available to US persons
  },
  {
    key: "AIIF",
    profile: {
      name: "Atlas Infrastructure Income Fund",
      assetClass: 2,
      location: "Dublin, Ireland",
      description:
        "An open-ended fund holding minority stakes in operating solar parks, fibre networks and toll roads across the EU. NAV is struck monthly; dividends are paid twice a year.",
      highlights: ["14 operating assets in 6 countries", "Monthly NAV, semi-annual dividends", "Open to retail investors"],
      documents: [doc("Fund prospectus"), doc("Key information document"), doc("Annual report 2025")],
      targetYieldBps: 550,
      distributionFrequency: "Semi-annual",
    },
    symbol: "AIIF",
    jurisdiction: "IE",
    maxSupply: 1_000_000,
    nav: 25,
    assetValue: 25_000_000,
    rules: { minTier: 1, maxHolders: 0, lockupDays: 0, maxBalance: 0 },
    blocked: [] as number[],
  },
];

const tokenOf: Record<string, Address> = {};

// ------------------------------------------------------------------------------------------
// Scenario steps
// ------------------------------------------------------------------------------------------

async function onboard() {
  await at(0, "Investors onboard; the compliance officer reviews KYC");
  for (const name of ["amelia", "daniel", "tan", "lukas", "sofia", "rahim"] as Person[]) {
    const app = await api<{ id: string; screening: { recommendation: string } }>(
      "POST",
      "/kyc/applications",
      name,
      kyc[name],
    );
    console.log(`  ${kyc[name]!.fullName}: submitted, screening ${app.screening.recommendation}`);
  }
  const queue = await api<{ id: string; wallet: string; fullName: string; requestedTier: number }[]>(
    "GET",
    "/compliance/applications?status=SUBMITTED",
    "officer",
  );
  const byName = new Map(queue.map((a) => [a.fullName, a]));
  for (const [fullName, tier] of [
    ["Amelia Hart", 2],
    ["Daniel Brooks", 2],
    ["Tan Mei Lin", 3],
    ["Lukas Weber", 1],
  ] as const) {
    await api("POST", `/compliance/applications/${byName.get(fullName)!.id}/approve`, "officer", { tier });
    console.log(`  approved ${fullName} (tier ${tier})`);
  }
  await api("POST", `/compliance/applications/${byName.get("Sofia Marino")!.id}/reject`, "officer", {
    reason: "Proof of address is incomplete and the licence number could not be verified",
  });
  console.log("  rejected Sofia Marino; Rahim Chowdhury left in the review queue");
}

async function fundWallets() {
  await at(1, "Stablecoin balances for treasury and investors");
  const mint = (to: Address, amount: number) =>
    send("admin", d.settlementToken, mockUSDCAbi, "mint", [to, usdc(amount)]);
  await mint(people.treasury.address, 20_000_000);
  await mint(people.amelia.address, 600_000);
  await mint(people.daniel.address, 500_000);
  await mint(people.tan.address, 4_000_000);
  await mint(people.lukas.address, 80_000);
  await send("treasury", d.settlementToken, mockUSDCAbi, "approve", [d.issuanceDesk, maxUint256]);
}

async function listAssets() {
  await at(2, "The asset manager tokenizes three assets");
  for (const a of assets) {
    const profile = await api<{ metadataURI: string; documentHash: Hex }>(
      "POST",
      "/assets/profiles",
      "manager",
      a.profile,
    );
    const receipt = await send(
      "manager",
      d.assetFactory,
      assetFactoryAbi,
      "createAsset",
      [
        {
          name: a.profile.name,
          symbol: a.symbol,
          assetClass: a.profile.assetClass,
          jurisdiction: a.jurisdiction,
          metadataURI: profile.metadataURI,
          documentHash: profile.documentHash,
          maxSupply: shares(a.maxSupply),
          navPerShare: usdc(a.nav),
          assetValue: usdc(a.assetValue),
          valuationReportHash: keccak256(toHex(`${a.symbol} initial valuation`)),
          rules: {
            minTier: a.rules.minTier,
            maxHolders: a.rules.maxHolders,
            lockupUntil: BigInt(a.rules.lockupDays ? start + (2 + a.rules.lockupDays) * DAY : 0),
            maxBalance: shares(a.rules.maxBalance),
          },
          blockedCountries: a.blocked,
        },
      ],
      { action: "ASSET_CREATED", entityType: "ASSET", entityId: a.symbol, summary: `Tokenized ${a.profile.name}` },
    );
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: assetFactoryAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "AssetCreated") tokenOf[a.key] = ev.args.token;
      } catch {
        // not a factory event
      }
    }
    await send("treasury", d.settlementToken, mockUSDCAbi, "approve", [tokenOf[a.key]!, maxUint256]);
    console.log(`  ${a.symbol} -> ${tokenOf[a.key]}`);
  }
}

async function subscribe(who: Person, key: string, amount: number) {
  await send(who, d.settlementToken, mockUSDCAbi, "approve", [d.issuanceDesk, usdc(amount)]);
  const receipt = await send(
    who,
    d.issuanceDesk,
    issuanceDeskAbi,
    "requestSubscription",
    [tokenOf[key]!, usdc(amount), 0n],
    { action: "SUBSCRIPTION_REQUESTED", entityType: "ASSET", entityId: key, summary: `Requested ${key} for ${amount} USDC` },
  );
  return requestId(receipt.logs);
}

function requestId(logs: readonly { data: Hex; topics: readonly Hex[] }[]): bigint {
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi: issuanceDeskAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "RequestCreated") return ev.args.id;
    } catch {
      // other contract
    }
  }
  throw new Error("RequestCreated not found");
}

async function approve(id: bigint, note: string) {
  await send("officer", d.issuanceDesk, issuanceDeskAbi, "approve", [id], {
    action: "REQUEST_APPROVED",
    entityType: "DESK_REQUEST",
    entityId: id.toString(),
    summary: `Approved request #${id}: ${note}`,
  });
}

async function reject(id: bigint, reason: string) {
  await send("officer", d.issuanceDesk, issuanceDeskAbi, "reject", [id, reason], {
    action: "REQUEST_REJECTED",
    entityType: "DESK_REQUEST",
    entityId: id.toString(),
    summary: `Rejected request #${id}: ${reason}`,
  });
}

async function primaryIssuance() {
  await at(3, "Subscription window: investors subscribe, the officer approves");
  const plan: [Person, string, number][] = [
    ["amelia", "HBVR", 150_000],
    ["amelia", "AIIF", 60_000],
    ["daniel", "HBVR", 120_000],
    ["daniel", "AIIF", 90_000],
    ["tan", "MSCN", 1_500_000],
    ["tan", "HBVR", 650_000],
    ["tan", "AIIF", 950_000],
    ["lukas", "HBVR", 25_000],
    ["lukas", "AIIF", 20_000],
    ["amelia", "MSCN", 80_000],
  ];
  for (const [who, key, amount] of plan) {
    const id = await subscribe(who, key, amount);
    await approve(id, `${kyc[who]!.fullName} ${key} ${amount.toLocaleString("en-GB")} USDC`);
  }
  // A US investor asks for the Reg S credit note; the rules would block the mint, so it is rejected.
  const blocked = await subscribe("daniel", "MSCN", 100_000);
  await reject(blocked, "Offering is not available to US persons (Regulation S)");

  // Placement allocation: proposed by the asset manager, approved by a second person.
  const receipt = await send("manager", d.issuanceDesk, issuanceDeskAbi, "proposeAllocation", [
    tokenOf.MSCN!,
    people.tan.address,
    shares(5_000),
  ], { action: "ALLOCATION_PROPOSED", entityType: "ASSET", entityId: "MSCN", summary: "Proposed 5,000 MSCN placement to Tan Mei Lin" });
  await approve(requestId(receipt.logs), "placement allocation 5,000 MSCN");
}

const navPlan: Record<string, Record<number, number>> = {
  HBVR: { 3: 10.12, 6: 10.25, 9: 10.31, 11: 10.48 },
  MSCN: { 3: 100.18, 6: 99.94, 9: 100.26 },
  AIIF: { 1: 25.3, 2: 25.12, 3: 25.58, 4: 25.91, 5: 25.7, 6: 26.14, 7: 26.42, 8: 26.2, 9: 26.75, 10: 26.98 },
};

async function revalue(key: string, nav: number, month: number) {
  const a = assets.find((x) => x.key === key)!;
  const value = Math.round((a.assetValue * nav) / a.nav);
  await send(
    "valuer",
    tokenOf[key]!,
    assetTokenAbi,
    "updateValuation",
    [usdc(nav), usdc(value), keccak256(toHex(`${key} valuation month ${month}`))],
    { action: "VALUATION_UPDATED", entityType: "ASSET", entityId: key, summary: `${key} NAV set to ${nav.toFixed(2)} USDC` },
  );
}

async function distribute(key: string, yieldBps: number, label: string) {
  const token = tokenOf[key]!;
  const supply = (await pub.readContract({ address: token, abi: assetTokenAbi, functionName: "totalSupply" })) as bigint;
  const nav = (await pub.readContract({ address: token, abi: assetTokenAbi, functionName: "navPerShare" })) as bigint;
  const amount = (supply * nav * BigInt(yieldBps)) / 10n ** 18n / 10_000n;
  await send(
    "treasury",
    token,
    assetTokenAbi,
    "depositIncome",
    [amount, keccak256(toHex(`${key} ${label}`))],
    { action: "INCOME_DEPOSITED", entityType: "ASSET", entityId: key, summary: `${key} ${label}: ${fmt(amount, 6)} USDC` },
  );
}

async function claim(who: Person, key: string) {
  const token = tokenOf[key]!;
  const owed = (await pub.readContract({
    address: token,
    abi: assetTokenAbi,
    functionName: "claimableIncome",
    args: [people[who].address],
  })) as bigint;
  if (owed === 0n) return;
  await send(who, token, assetTokenAbi, "claimIncome", [], {
    action: "INCOME_CLAIMED",
    entityType: "ASSET",
    entityId: key,
    summary: `Claimed ${fmt(owed, 6)} USDC from ${key}`,
  });
}

async function operateYear() {
  for (let month = 1; month <= 10; month++) {
    await at(3 + month * 30, `Month ${month}`);
    for (const key of ["HBVR", "MSCN", "AIIF"]) {
      const nav = navPlan[key]![month];
      if (nav) await revalue(key, nav, month);
    }
    await distribute("HBVR", 38, `rent month ${month}`);
    if (month % 3 === 0) await distribute("MSCN", 225, `coupon Q${month / 3}`);
    if (month === 6) await distribute("AIIF", 150, "interim dividend");

    await claim("amelia", "HBVR");
    if (month % 3 === 0) {
      await claim("tan", "HBVR");
      await claim("tan", "MSCN");
      await claim("amelia", "MSCN");
    }
    if (month === 7) {
      await claim("daniel", "HBVR");
      await claim("tan", "AIIF");
      await claim("lukas", "HBVR");
    }

    if (month === 4) {
      // HBVR lock-up has ended: secondary transfers between verified investors.
      await send("amelia", tokenOf.HBVR!, assetTokenAbi, "transfer", [people.lukas.address, shares(1_500)], {
        action: "SHARES_TRANSFERRED",
        entityType: "ASSET",
        entityId: "HBVR",
        summary: "Transferred 1,500 HBVR to Lukas Weber",
      });
      await send("tan", tokenOf.MSCN!, assetTokenAbi, "transfer", [people.amelia.address, shares(400)], {
        action: "SHARES_TRANSFERRED",
        entityType: "ASSET",
        entityId: "MSCN",
        summary: "Transferred 400 MSCN to Amelia Hart",
      });
    }
    if (month === 5) {
      await send("officer", tokenOf.HBVR!, assetTokenAbi, "setFrozen", [people.lukas.address, true], {
        action: "WALLET_FROZEN",
        entityType: "WALLET",
        entityId: people.lukas.address,
        summary: "Froze Lukas Weber on HBVR pending a source-of-funds query",
      });
    }
    if (month === 6) {
      await send("officer", tokenOf.HBVR!, assetTokenAbi, "setFrozen", [people.lukas.address, false], {
        action: "WALLET_UNFROZEN",
        entityType: "WALLET",
        entityId: people.lukas.address,
        summary: "Unfroze Lukas Weber after documents were received",
      });
    }
    if (month === 7) {
      const receipt = await send("daniel", d.issuanceDesk, issuanceDeskAbi, "requestRedemption", [
        tokenOf.AIIF!,
        shares(1_200),
        0n,
      ], { action: "REDEMPTION_REQUESTED", entityType: "ASSET", entityId: "AIIF", summary: "Requested redemption of 1,200 AIIF" });
      await approve(requestId(receipt.logs), "Daniel Brooks redeems 1,200 AIIF at NAV");
    }
    if (month === 9) {
      const receipt = await send("lukas", d.issuanceDesk, issuanceDeskAbi, "requestRedemption", [
        tokenOf.HBVR!,
        shares(800),
        0n,
      ], { action: "REDEMPTION_REQUESTED", entityType: "ASSET", entityId: "HBVR", summary: "Requested redemption of 800 HBVR" });
      await reject(requestId(receipt.logs), "Property redemptions are processed in the quarterly window only");
    }
  }
}

async function openItems() {
  await at(330 - 2, "Open items for the review queues");
  const amount = 30_000;
  await send("lukas", d.settlementToken, mockUSDCAbi, "approve", [d.issuanceDesk, usdc(amount)]);
  await send("lukas", d.issuanceDesk, issuanceDeskAbi, "requestSubscription", [tokenOf.AIIF!, usdc(amount), 0n], {
    action: "SUBSCRIPTION_REQUESTED",
    entityType: "ASSET",
    entityId: "AIIF",
    summary: "Requested AIIF for 30,000 USDC",
  });
  await send("amelia", d.issuanceDesk, issuanceDeskAbi, "requestRedemption", [tokenOf.AIIF!, shares(500), 0n], {
    action: "REDEMPTION_REQUESTED",
    entityType: "ASSET",
    entityId: "AIIF",
    summary: "Requested redemption of 500 AIIF",
  });
  await revalue("HBVR", 10.48, 11);
  await revalue("AIIF", 27.21, 11);
  await distribute("HBVR", 38, "rent month 11");
  // Bring the chain clock back to the present.
  await at(330, "Chain clock caught up with today");
  await testClient.mine({ blocks: 1 });
}

async function main() {
  const count = (await pub.readContract({
    address: d.assetFactory,
    abi: assetFactoryAbi,
    functionName: "assetCount",
  })) as bigint;
  if (count > 0n) {
    console.log("Assets already exist on this chain. Restart `pnpm chain` and redeploy for a clean seed.");
    return;
  }
  const health = await fetch(`${API}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`API is not reachable at ${API}. Start it with pnpm dev.`);

  await onboard();
  await fundWallets();
  await listAssets();
  await primaryIssuance();
  await operateYear();
  await openItems();

  const verify = await api<{ valid: boolean; checked: number }>("GET", "/audit/verify", "officer");
  console.log(`\nDone. Audit chain valid=${verify.valid} entries=${verify.checked}. Chain time ${new Date(clock * 1000).toISOString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
