"use client";

import {
  ASSET_CLASSES,
  assetComplianceAbi,
  assetFactoryAbi,
  assetRegistryAbi,
  assetTokenAbi,
  COUNTRIES,
  countryByNumeric,
  getDeployment,
  INVESTOR_TIERS,
  issuanceDeskAbi,
  mockUSDCAbi,
} from "@rwa/contracts";
import { type FormEvent, useState } from "react";
import { type Abi, isAddress, keccak256, toHex } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { AddressTag, Badge, Button, Card, CardHeader, Empty, Field, Input, Notice, PageHeader, Select, Skeleton, Table, Td, Textarea } from "@/components/ui";
import { apiFetch, type Asset } from "@/lib/api";
import { CHAIN_ID } from "@/lib/env";
import { formatDate, formatShares, formatUsd, parseAmount, SHARES, USDC } from "@/lib/format";
import { useAssets, useHolders } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";

const deployment = getDeployment(CHAIN_ID);

export default function AdminAssetsPage() {
  const assets = useAssets();
  const { role } = useSession();
  const [choice, setSelected] = useState<string>("");
  const selected = choice || assets.data?.[0]?.token || "";
  const asset = assets.data?.find((a) => a.token === selected);

  return (
    <>
      <PageHeader
        title="Asset operations"
        description="Each action is signed by your own wallet and checked against your on-chain role."
        action={
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-72" aria-label="Asset">
            {assets.data?.map((a) => (
              <option key={a.token} value={a.token}>
                {a.symbol} · {a.name}
              </option>
            ))}
          </Select>
        }
      />
      {role === "ASSET_MANAGER" && <CreateAsset />}
      {!asset ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {(role === "VALUATOR" || role === "ADMIN") && <ValuationCard asset={asset} />}
          {(role === "TREASURY" || role === "ADMIN") && <IncomeCard asset={asset} />}
          {(role === "COMPLIANCE_OFFICER" || role === "ADMIN") && <AgentCard asset={asset} />}
          {(role === "COMPLIANCE_OFFICER" || role === "ADMIN") && <RulesCard asset={asset} />}
          {(role === "ASSET_MANAGER" || role === "ADMIN") && <AllocationCard asset={asset} />}
          {(role === "ASSET_MANAGER" || role === "ADMIN") && <StatusCard asset={asset} />}
          <div className="lg:col-span-2">
            <CapTable asset={asset} />
          </div>
        </div>
      )}
    </>
  );
}

const audit = (asset: Asset, action: string, summary: string) => ({ action, entityType: "ASSET", entityId: asset.symbol, summary });

function ValuationCard({ asset }: { asset: Asset }) {
  const tx = useTx();
  const [nav, setNav] = useState("");
  const [value, setValue] = useState("");
  const [report, setReport] = useState("");
  const navUnits = parseAmount(nav, USDC);
  const valueUnits = parseAmount(value, USDC);
  return (
    <Card>
      <CardHeader title="Publish valuation" description={`Current NAV ${formatUsd(asset.navPerShare)} · valued ${formatDate(asset.valuationAt)}`} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="NAV per share (USDC)">
          <Input value={nav} onChange={(e) => setNav(e.target.value)} placeholder="10.55" inputMode="decimal" />
        </Field>
        <Field label="Asset value (USDC)">
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="25,300,000" inputMode="decimal" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Valuation report reference" hint="Its keccak-256 hash is stored on-chain with the NAV.">
            <Input value={report} onChange={(e) => setReport(e.target.value)} placeholder="Knight Frank report KF-2026-118" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Button
            loading={tx.busy}
            disabled={!navUnits || !valueUnits || report.trim().length < 3}
            onClick={() =>
              void tx
                .run(
                  "Valuation published",
                  {
                    address: asset.token,
                    abi: assetTokenAbi as Abi,
                    functionName: "updateValuation",
                    args: [navUnits, valueUnits, keccak256(toHex(report.trim()))],
                  },
                  audit(asset, "VALUATION_UPDATED", `${asset.symbol} NAV set to ${formatUsd(navUnits)} (${report.trim()})`),
                )
                .then(() => {
                  setNav("");
                  setValue("");
                  setReport("");
                })
                .catch(() => {})
            }
          >
            Publish NAV
          </Button>
        </div>
      </div>
    </Card>
  );
}

function IncomeCard({ asset }: { asset: Asset }) {
  const tx = useTx();
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [statement, setStatement] = useState("");
  const units = parseAmount(amount, USDC);
  const allowance = useReadContract({
    address: deployment.settlementToken,
    abi: mockUSDCAbi,
    functionName: "allowance",
    args: [address!, asset.token],
    query: { enabled: !!address },
  });
  const perShare = units && asset.totalSupply !== "0" ? (units * 10n ** 18n) / BigInt(asset.totalSupply) : 0n;

  const deposit = async () => {
    if (!units) return;
    if ((allowance.data ?? 0n) < units) {
      await tx.run("Stablecoin approved", {
        address: deployment.settlementToken,
        abi: mockUSDCAbi as Abi,
        functionName: "approve",
        args: [asset.token, units],
      });
    }
    await tx.run(
      "Income deposited",
      { address: asset.token, abi: assetTokenAbi as Abi, functionName: "depositIncome", args: [units, keccak256(toHex(statement.trim()))] },
      audit(asset, "INCOME_DEPOSITED", `${asset.symbol} ${statement.trim()}: ${formatUsd(units)}`),
    );
    setAmount("");
    setStatement("");
  };

  return (
    <Card>
      <CardHeader title="Distribute income" description={`${formatUsd(asset.incomeDeposited)} paid so far in ${asset.distributionCount} distributions`} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Amount (USDC)" hint={perShare ? `${formatUsd(perShare)} per share to ${asset.holderCount} holders` : undefined}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="95,000" inputMode="decimal" />
        </Field>
        <Field label="Period statement">
          <Input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Net rent November 2026" />
        </Field>
        <div className="sm:col-span-2">
          <Button variant="accent" loading={tx.busy} disabled={!units || statement.trim().length < 3} onClick={() => void deposit().catch(() => {})}>
            Deposit for holders
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AgentCard({ asset }: { asset: Asset }) {
  const tx = useTx();
  const [wallet, setWallet] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const units = parseAmount(amount, SHARES);
  const frozen = useReadContract({
    address: asset.token,
    abi: assetTokenAbi,
    functionName: "isFrozen",
    args: [isAddress(wallet) ? wallet : "0x0000000000000000000000000000000000000000"],
    query: { enabled: isAddress(wallet) },
  });

  return (
    <Card>
      <CardHeader
        title="Transfer agent"
        description="Pause trading, freeze a wallet or move shares by order"
        action={
          <Button
            size="sm"
            variant={asset.paused ? "accent" : "danger"}
            loading={tx.busy}
            onClick={() =>
              void tx
                .run(
                  asset.paused ? "Trading resumed" : "Trading paused",
                  { address: asset.token, abi: assetTokenAbi as Abi, functionName: asset.paused ? "unpause" : "pause" },
                  audit(asset, asset.paused ? "ASSET_UNPAUSED" : "ASSET_PAUSED", `${asset.paused ? "Resumed" : "Paused"} trading in ${asset.symbol}`),
                )
                .catch(() => {})
            }
          >
            {asset.paused ? "Resume trading" : "Pause trading"}
          </Button>
        }
      />
      <div className="space-y-4 p-5">
        <Field label="Wallet" hint={isAddress(wallet) ? (frozen.data ? "Currently frozen" : "Not frozen") : undefined}>
          <Input value={wallet} onChange={(e) => setWallet(e.target.value.trim())} placeholder="0x…" />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          disabled={!isAddress(wallet) || tx.busy}
          onClick={() =>
            void tx
              .run(
                frozen.data ? "Wallet unfrozen" : "Wallet frozen",
                { address: asset.token, abi: assetTokenAbi as Abi, functionName: "setFrozen", args: [wallet, !frozen.data] },
                {
                  action: frozen.data ? "WALLET_UNFROZEN" : "WALLET_FROZEN",
                  entityType: "WALLET",
                  entityId: wallet,
                  summary: `${frozen.data ? "Unfroze" : "Froze"} ${wallet} on ${asset.symbol}`,
                },
              )
              .then(() => frozen.refetch())
              .catch(() => {})
          }
        >
          {frozen.data ? "Unfreeze wallet" : "Freeze wallet"}
        </Button>
        <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <Field label="Forced transfer to">
            <Input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x… (verified)" />
          </Field>
          <Field label="Shares">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" inputMode="decimal" />
          </Field>
        </div>
        <Button
          size="sm"
          variant="danger"
          disabled={!isAddress(wallet) || !isAddress(to) || !units || tx.busy}
          onClick={() =>
            void tx
              .run(
                "Forced transfer done",
                { address: asset.token, abi: assetTokenAbi as Abi, functionName: "forcedTransfer", args: [wallet, to, units] },
                audit(asset, "FORCED_TRANSFER", `Forced transfer of ${formatShares(units)} ${asset.symbol} from ${wallet} to ${to}`),
              )
              .catch(() => {})
          }
        >
          Force transfer from wallet
        </Button>
      </div>
    </Card>
  );
}

function RulesCard({ asset }: { asset: Asset }) {
  const tx = useTx();
  const [country, setCountry] = useState("840");
  const [minTier, setMinTier] = useState(String(asset.minTier ?? 1));
  const [maxHolders, setMaxHolders] = useState(asset.maxHolders ?? "0");
  const [lockupDate, setLockupDate] = useState(() =>
    asset.lockupUntil && asset.lockupUntil !== "0" ? new Date(Number(asset.lockupUntil) * 1000).toISOString().slice(0, 10) : "",
  );
  const [maxBalance, setMaxBalance] = useState(asset.maxBalance && asset.maxBalance !== "0" ? formatShares(asset.maxBalance).replace(/,/g, "") : "");
  const blocked = new Set(asset.blockedCountries ?? []);
  const isBlocked = blocked.has(Number(country));

  const saveRules = () =>
    tx.run(
      "Rules updated",
      {
        address: asset.compliance,
        abi: assetComplianceAbi as Abi,
        functionName: "setRules",
        args: [
          {
            minTier: Number(minTier),
            maxHolders: Number(maxHolders || 0),
            lockupUntil: BigInt(lockupDate ? Math.floor(new Date(`${lockupDate}T00:00:00Z`).getTime() / 1000) : 0),
            maxBalance: maxBalance ? (parseAmount(maxBalance, SHARES) ?? 0n) : 0n,
          },
        ],
      },
      audit(asset, "COMPLIANCE_RULES_UPDATED", `${asset.symbol} rules: tier ${minTier}+, max holders ${maxHolders || "none"}, lock-up ${lockupDate || "none"}`),
    );

  return (
    <Card>
      <CardHeader title="Compliance rules" description="Applied to every mint and investor-to-investor transfer" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Minimum investor tier">
          <Select value={minTier} onChange={(e) => setMinTier(e.target.value)}>
            {[1, 2, 3].map((t) => (
              <option key={t} value={t}>
                {INVESTOR_TIERS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Maximum holders (0 = none)">
          <Input value={maxHolders} onChange={(e) => setMaxHolders(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Secondary lock-up until">
          <Input type="date" value={lockupDate} onChange={(e) => setLockupDate(e.target.value)} />
        </Field>
        <Field label="Per-investor cap (shares)">
          <Input value={maxBalance} onChange={(e) => setMaxBalance(e.target.value)} placeholder="No cap" />
        </Field>
        <div className="sm:col-span-2">
          <Button size="sm" loading={tx.busy} onClick={() => void saveRules().catch(() => {})}>
            Save rules
          </Button>
        </div>
        <div className="border-t border-slate-100 pt-4 sm:col-span-2">
          <p className="text-sm text-slate-600">
            Restricted: {blocked.size ? [...blocked].map((c) => countryByNumeric(c)?.name ?? c).join(", ") : "none"}
          </p>
          <div className="mt-2 flex gap-2">
            <Select value={country} onChange={(e) => setCountry(e.target.value)} className="max-w-60">
              {COUNTRIES.map((c) => (
                <option key={c.numeric} value={c.numeric}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={tx.busy}
              onClick={() =>
                void tx
                  .run(
                    isBlocked ? "Country allowed" : "Country restricted",
                    { address: asset.compliance, abi: assetComplianceAbi as Abi, functionName: "setCountryBlocked", args: [Number(country), !isBlocked] },
                    audit(asset, "COUNTRY_RESTRICTION_UPDATED", `${isBlocked ? "Allowed" : "Restricted"} ${countryByNumeric(Number(country))?.name} for ${asset.symbol}`),
                  )
                  .catch(() => {})
              }
            >
              {isBlocked ? "Allow" : "Restrict"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AllocationCard({ asset }: { asset: Asset }) {
  const tx = useTx();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const units = parseAmount(amount, SHARES);
  return (
    <Card>
      <CardHeader title="Propose allocation" description="A direct share issuance; a compliance officer must approve it" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Investor wallet">
          <Input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" />
        </Field>
        <Field label="Shares">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1,000" />
        </Field>
        <div className="sm:col-span-2">
          <Button
            size="sm"
            loading={tx.busy}
            disabled={!isAddress(to) || !units}
            onClick={() =>
              void tx
                .run(
                  "Allocation proposed",
                  { address: deployment.issuanceDesk, abi: issuanceDeskAbi as Abi, functionName: "proposeAllocation", args: [asset.token, to, units] },
                  audit(asset, "ALLOCATION_PROPOSED", `Proposed ${formatShares(units)} ${asset.symbol} to ${to}`),
                )
                .then(() => {
                  setTo("");
                  setAmount("");
                })
                .catch(() => {})
            }
          >
            Send for approval
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatusCard({ asset }: { asset: Asset }) {
  const tx = useTx();
  return (
    <Card>
      <CardHeader title="Lifecycle" description="Suspended or retired assets accept no new subscriptions or redemptions" />
      <div className="flex flex-wrap gap-2 p-5">
        {["Active", "Suspended", "Retired"].map((label, status) => (
          <Button
            key={label}
            size="sm"
            variant={asset.status === status ? "primary" : "secondary"}
            disabled={asset.status === status || tx.busy}
            onClick={() =>
              void tx
                .run(
                  `Asset ${label.toLowerCase()}`,
                  { address: deployment.assetRegistry, abi: assetRegistryAbi as Abi, functionName: "setStatus", args: [BigInt(asset.assetId), status] },
                  audit(asset, "ASSET_STATUS_CHANGED", `${asset.symbol} set to ${label}`),
                )
                .catch(() => {})
            }
          >
            {label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function CapTable({ asset }: { asset: Asset }) {
  const holders = useHolders(asset.token);
  const supply = BigInt(asset.totalSupply || "0");
  return (
    <Card>
      <CardHeader title={`Cap table · ${asset.symbol}`} description={`${asset.holderCount} holders, ${formatShares(asset.totalSupply)} shares`} />
      {!holders.data ? (
        <Skeleton className="m-5 h-32" />
      ) : holders.data.length ? (
        <Table head={["Holder", "Shares", "Ownership", "Locked", "Country", "Tier", "KYC until", "Status"]}>
          {holders.data.map((h) => (
            <tr key={h.account}>
              <Td>
                <AddressTag address={h.account} />
              </Td>
              <Td className="tabular-nums">{formatShares(h.balance)}</Td>
              <Td className="tabular-nums">{supply ? ((Number(BigInt(h.balance) * 10_000n / supply) / 100).toFixed(2)) : 0}%</Td>
              <Td className="tabular-nums">{h.locked !== "0" ? formatShares(h.locked) : "—"}</Td>
              <Td>{h.country ? countryByNumeric(h.country)?.name : "—"}</Td>
              <Td>{h.tier ? INVESTOR_TIERS[h.tier] : "—"}</Td>
              <Td>{h.expiresAt ? formatDate(h.expiresAt) : "—"}</Td>
              <Td>{h.frozen ? <Badge tone="rose">Frozen</Badge> : <Badge tone="teal">Active</Badge>}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No holders yet" />
      )}
    </Card>
  );
}

const DOCS_PLACEHOLDER = "Title register\nSPV articles of association\nValuation report";

function CreateAsset() {
  const { token } = useSession();
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const documents = await Promise.all(
        s("documents")
          .split("\n")
          .map((d) => d.trim())
          .filter(Boolean)
          .map(async (name) => {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(name));
            return { name, sha256: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("") };
          }),
      );
      const profile = await apiFetch<{ metadataURI: string; documentHash: `0x${string}` }>("/assets/profiles", {
        method: "POST",
        token,
        body: {
          name: s("name"),
          assetClass: Number(s("assetClass")),
          location: s("location"),
          description: s("description"),
          highlights: s("highlights").split("\n").map((h) => h.trim()).filter(Boolean),
          documents,
          targetYieldBps: Math.round(Number(s("targetYield") || 0) * 100),
          distributionFrequency: s("frequency"),
        },
      });
      const nav = parseAmount(s("nav"), USDC);
      const maxSupply = parseAmount(s("maxSupply"), SHARES);
      if (!nav || !maxSupply) throw new Error("Enter a valid NAV and maximum supply");
      const lockupDays = Number(s("lockupDays") || 0);
      await tx.run(
        "Asset tokenized",
        {
          address: deployment.assetFactory,
          abi: assetFactoryAbi as Abi,
          functionName: "createAsset",
          args: [
            {
              name: s("name"),
              symbol: s("symbol").toUpperCase(),
              assetClass: Number(s("assetClass")),
              jurisdiction: s("jurisdiction").toUpperCase(),
              metadataURI: profile.metadataURI,
              documentHash: profile.documentHash,
              maxSupply,
              navPerShare: nav,
              assetValue: (nav * maxSupply) / 10n ** 18n,
              valuationReportHash: keccak256(toHex(`${s("symbol")} initial valuation`)),
              rules: {
                minTier: Number(s("minTier")),
                maxHolders: Number(s("maxHolders") || 0),
                lockupUntil: BigInt(lockupDays ? Math.floor(Date.now() / 1000) + lockupDays * 86_400 : 0),
                maxBalance: 0n,
              },
              blockedCountries: f.getAll("blocked").map(Number),
            },
          ],
        },
        { action: "ASSET_CREATED", entityType: "ASSET", entityId: s("symbol").toUpperCase(), summary: `Tokenized ${s("name")}` },
      );
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-semibold text-slate-900">Tokenize a new asset</p>
          <p className="text-sm text-slate-500">Creates the share token, its compliance module and the deed NFT in one transaction.</p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          New asset
        </Button>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Tokenize a new asset" action={<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>} />
      <form onSubmit={submit} className="grid gap-4 p-5 md:grid-cols-3">
        <Field label="Name">
          <Input name="name" required minLength={3} placeholder="Riverside Logistics Park" />
        </Field>
        <Field label="Symbol">
          <Input name="symbol" required maxLength={8} placeholder="RVLP" />
        </Field>
        <Field label="Asset class">
          <Select name="assetClass" defaultValue="0">
            {ASSET_CLASSES.map((c, i) => (
              <option key={c} value={i}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location">
          <Input name="location" required placeholder="Rotterdam, Netherlands" />
        </Field>
        <Field label="Jurisdiction (ISO code)">
          <Input name="jurisdiction" required maxLength={2} placeholder="NL" />
        </Field>
        <Field label="Distribution frequency">
          <Select name="frequency" defaultValue="Quarterly">
            {["Monthly", "Quarterly", "Semi-annual", "Annual"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </Field>
        <div className="md:col-span-3">
          <Field label="Description">
            <Textarea name="description" required minLength={20} rows={3} />
          </Field>
        </div>
        <Field label="Highlights (one per line)">
          <Textarea name="highlights" rows={3} />
        </Field>
        <Field label="Legal documents (one per line)" hint="Each is hashed; the combined hash goes on-chain.">
          <Textarea name="documents" rows={3} placeholder={DOCS_PLACEHOLDER} />
        </Field>
        <div className="grid gap-4">
          <Field label="Target yield (%)">
            <Input name="targetYield" inputMode="decimal" placeholder="6.5" />
          </Field>
        </div>
        <Field label="Initial NAV per share (USDC)">
          <Input name="nav" required inputMode="decimal" placeholder="10.00" />
        </Field>
        <Field label="Authorised shares">
          <Input name="maxSupply" required inputMode="decimal" placeholder="1,000,000" />
        </Field>
        <Field label="Minimum investor tier">
          <Select name="minTier" defaultValue="1">
            {[1, 2, 3].map((t) => (
              <option key={t} value={t}>
                {INVESTOR_TIERS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Maximum holders (0 = none)">
          <Input name="maxHolders" inputMode="numeric" defaultValue="0" />
        </Field>
        <Field label="Lock-up (days)">
          <Input name="lockupDays" inputMode="numeric" defaultValue="0" />
        </Field>
        <Field label="Restricted countries">
          <Select name="blocked" multiple className="h-24">
            {COUNTRIES.map((c) => (
              <option key={c.numeric} value={c.numeric}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <div className="md:col-span-3">
            <Notice tone="rose">{error}</Notice>
          </div>
        )}
        <div className="md:col-span-3">
          <Button type="submit" variant="accent" loading={busy}>
            Create profile and tokenize
          </Button>
        </div>
      </form>
    </Card>
  );
}
