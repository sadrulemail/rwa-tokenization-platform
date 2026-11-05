"use client";

import { ASSET_CLASSES, countryByNumeric, INVESTOR_TIERS } from "@rwa/contracts";
import { ArrowLeft, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ActivityFeed } from "@/components/activity-feed";
import { CLASS_STYLE, navChange } from "@/components/asset-card";
import { IncomeChart, NavChart } from "@/components/charts";
import { InvestPanel } from "@/components/invest-panel";
import { AddressTag, Badge, Card, CardHeader, Empty, Notice, Skeleton, Stat, Table, Td, TxLink } from "@/components/ui";
import { formatDate, formatPct, formatShares, formatUsd } from "@/lib/format";
import { useActivity, useAsset, useDistributions, useTransfers, useValuations } from "@/lib/queries";

export default function AssetPage() {
  const { token } = useParams<{ token: string }>();
  const asset = useAsset(token);
  const valuations = useValuations(token);
  const distributions = useDistributions(token);
  const transfers = useTransfers(token);
  const activity = useActivity({ token, limit: 25 });
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  if (asset.isLoading) return <Skeleton className="h-96" />;
  if (asset.error || !asset.data) {
    return <Notice tone="rose" title="Asset not found">{(asset.error as Error)?.message ?? "Unknown asset"}</Notice>;
  }
  const a = asset.data;
  const style = CLASS_STYLE[a.assetClass] ?? CLASS_STYLE[0]!;
  const lockup = Number(a.lockupUntil ?? 0);
  const blocked = (a.blockedCountries ?? []).map((c) => countryByNumeric(c)?.name ?? String(c));

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Marketplace
      </Link>

      <section className={`rounded-3xl bg-gradient-to-br ${style.band} px-6 py-7 text-white sm:px-8`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/80">
              <span>{ASSET_CLASSES[a.assetClass]}</span>
              <span>·</span>
              <span>{a.location ?? a.jurisdiction}</span>
              <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs">{a.symbol}</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{a.name}</h1>
            {a.description && <p className="mt-3 max-w-3xl text-white/85">{a.description}</p>}
          </div>
          <div className="flex gap-2">
            {a.paused && <Badge tone="rose">Paused</Badge>}
            {a.status !== 0 && <Badge tone="rose">{a.status === 1 ? "Suspended" : "Retired"}</Badge>}
          </div>
        </div>
        {!!a.highlights?.length && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {a.highlights.map((h) => (
              <li key={h} className="rounded-full bg-white/15 px-3 py-1 text-sm">
                {h}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
            <Stat label="NAV per share" value={formatUsd(a.navPerShare)} hint={`${formatPct(navChange(a))} since issue`} />
            <Stat label="Asset value" value={formatUsd(a.assetValue, { compact: true })} hint={`Valued ${formatDate(a.valuationAt)}`} />
            <Stat label="Shares issued" value={formatShares(a.totalSupply, 0)} hint={`of ${formatShares(a.maxSupply, 0)} authorised`} />
            <Stat label="Income paid" value={formatUsd(a.incomeDeposited, { compact: true })} hint={`${a.distributionCount} distributions`} />
          </Card>

          <Card>
            <CardHeader title="NAV history" description="Each step is a valuation published on-chain by the valuer, with the report hash." />
            <div className="p-4">
              {valuations.data?.length ? <NavChart data={valuations.data} /> : <Skeleton className="h-64" />}
            </div>
          </Card>

          <Card>
            <CardHeader title="Income distributions" description={a.distributionFrequency ? `${a.distributionFrequency} payments to holders` : undefined} />
            {distributions.data?.length ? (
              <>
                <div className="p-4">
                  <IncomeChart data={distributions.data} />
                </div>
                <Table head={["Date", "Amount", "Per share", "Statement hash", "Transaction"]}>
                  {distributions.data.slice(0, 8).map((d) => (
                    <tr key={d.txHash}>
                      <Td>{formatDate(d.timestamp)}</Td>
                      <Td className="tabular-nums">{formatUsd(d.amount)}</Td>
                      <Td className="tabular-nums">
                        {formatUsd((BigInt(d.amount) * 10n ** 18n) / BigInt(d.totalSupply), { decimals: 6 })}
                      </Td>
                      <Td className="font-mono text-xs text-slate-500">{d.statementHash.slice(0, 14)}…</Td>
                      <Td>
                        <TxLink hash={d.txHash} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              </>
            ) : (
              <Empty title="No distributions yet" />
            )}
          </Card>

          <Card>
            <CardHeader title="Share register movements" description="Issuance, transfers and redemptions" />
            <Table head={["Date", "Type", "From", "To", "Shares", "Transaction"]}>
              {transfers.data?.slice(0, 15).map((t) => (
                <tr key={t.id}>
                  <Td>{formatDate(t.timestamp)}</Td>
                  <Td>
                    <Badge tone={t.kind === "MINT" ? "teal" : t.kind === "BURN" ? "amber" : "blue"}>
                      {t.kind === "MINT" ? "Issued" : t.kind === "BURN" ? "Redeemed" : "Transfer"}
                    </Badge>
                  </Td>
                  <Td>{t.kind === "MINT" ? "—" : <AddressTag address={t.fromAccount} />}</Td>
                  <Td>{t.kind === "BURN" ? "—" : <AddressTag address={t.toAccount} />}</Td>
                  <Td className="tabular-nums">{formatShares(t.amount)}</Td>
                  <Td>
                    <TxLink hash={t.txHash} />
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <InvestPanel asset={a} />

          <Card>
            <CardHeader title="Offering rules" description="Enforced by the token on every mint and transfer" />
            <dl className="divide-y divide-slate-100 text-sm">
              <Rule label="Eligible investors" value={a.minTier ? `${INVESTOR_TIERS[a.minTier]} and above` : "Any verified"} />
              <Rule label="Restricted countries" value={blocked.length ? blocked.join(", ") : "None"} />
              <Rule
                label="Secondary lock-up"
                value={lockup ? (lockup > nowSec ? `Until ${formatDate(lockup)}` : `Ended ${formatDate(lockup)}`) : "None"}
              />
              <Rule label="Holders" value={`${a.holderCount}${a.maxHolders && a.maxHolders !== "0" ? ` of max ${a.maxHolders}` : ""}`} />
              <Rule label="Per-investor cap" value={a.maxBalance && a.maxBalance !== "0" ? `${formatShares(a.maxBalance)} shares` : "None"} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Legal and on-chain records" />
            <div className="space-y-3 p-5 text-sm">
              {a.documents?.map((d) => (
                <div key={d.name} className="flex items-start gap-2">
                  <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-slate-800">{d.name}</p>
                    <p className="truncate font-mono text-xs text-slate-400">sha256 {d.sha256.slice(0, 24)}…</p>
                  </div>
                </div>
              ))}
              <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <p>
                  Share token <AddressTag address={a.token} />
                </p>
                <p>
                  Deed NFT #{a.assetId} held by <AddressTag address={a.custodian} />
                </p>
                <p>
                  Compliance module <AddressTag address={a.compliance} />
                </p>
                <p className="truncate">Document hash {a.documentHash.slice(0, 18)}…</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent events" />
            <ActivityFeed items={activity.data?.slice(0, 8)} loading={activity.isLoading} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
