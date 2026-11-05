"use client";

import { assetTokenAbi, getDeployment, INVESTOR_TIERS, issuanceDeskAbi, REQUEST_KINDS, REQUEST_STATUSES, countryByNumeric } from "@rwa/contracts";
import Link from "next/link";
import type { Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { AllocationChart, SLICE_COLOURS } from "@/components/charts";
import { RequireRole } from "@/components/guard";
import { Badge, Button, Card, CardHeader, Empty, Notice, PageHeader, Skeleton, Stat, Table, Td, TxLink } from "@/components/ui";
import { CHAIN_ID } from "@/lib/env";
import { formatDate, formatShares, formatUsd, toNumber, USDC } from "@/lib/format";
import { usePortfolio, useRequests } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";

const deployment = getDeployment(CHAIN_ID);
const STATUS_TONE = ["amber", "teal", "rose", "slate"] as const;

export default function PortfolioPage() {
  return (
    <RequireRole roles={["INVESTOR"]}>
      <Portfolio />
    </RequireRole>
  );
}

function Portfolio() {
  const { address } = useAccount();
  const { me } = useSession();
  const portfolio = usePortfolio();
  const requests = useRequests();
  const tx = useTx();
  const holdings = portfolio.data?.holdings ?? [];

  const contracts = holdings.map((h) => ({
    address: h.token,
    abi: assetTokenAbi as Abi,
    functionName: "claimableIncome",
    args: [address!],
  }));
  const claimable = useReadContracts({
    allowFailure: false,
    query: { enabled: !!address && holdings.length > 0, refetchInterval: 5_000 },
    contracts,
  });
  const owed = (claimable.data ?? []) as unknown as bigint[];
  const totalOwed = owed.reduce((s, v) => s + v, 0n);
  const totalValue = holdings.reduce((s, h) => s + BigInt(h.value), 0n);
  const totalClaimed = holdings.reduce((s, h) => s + BigInt(h.incomeClaimed), 0n);
  const identity = portfolio.data?.identity;

  const claimAll = async () => {
    for (const [i, h] of holdings.entries()) {
      if ((owed[i] ?? 0n) === 0n) continue;
      await tx.run(
        `Claimed ${h.symbol} income`,
        { address: h.token, abi: assetTokenAbi as Abi, functionName: "claimIncome" },
        { action: "INCOME_CLAIMED", entityType: "ASSET", entityId: h.symbol, summary: `Claimed ${formatUsd(owed[i])} from ${h.symbol}` },
      );
    }
  };

  const cancel = (id: string) =>
    tx.run(
      `Request #${id} cancelled`,
      { address: deployment.issuanceDesk, abi: issuanceDeskAbi as Abi, functionName: "cancelRequest", args: [BigInt(id)] },
      { action: "REQUEST_CANCELLED", entityType: "DESK_REQUEST", entityId: id, summary: `Cancelled request #${id}` },
    );

  return (
    <>
      <PageHeader title="Portfolio" description="Positions are valued at each asset's latest published NAV." />
      {me?.kyc?.status !== "APPROVED" && (
        <div className="mb-6">
          <Notice tone="amber" title="Your wallet is not verified">
            <Link href="/onboarding" className="font-semibold underline">
              Complete verification
            </Link>{" "}
            to hold and receive shares.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="grid grid-cols-2 gap-5 p-5 lg:col-span-2">
          <Stat label="Portfolio value" value={formatUsd(totalValue)} hint={`${holdings.filter((h) => h.balance !== "0").length} positions`} />
          <Stat label="Claimable income" value={formatUsd(totalOwed)} hint={`${formatUsd(totalClaimed)} claimed to date`} />
          <Stat
            label="Investor status"
            value={identity?.registered ? INVESTOR_TIERS[identity.tier] : "Not verified"}
            hint={identity?.registered ? `${countryByNumeric(identity.country)?.name ?? ""} · KYC to ${formatDate(identity.expiresAt)}` : undefined}
          />
          <div className="flex items-end">
            <Button variant="accent" loading={tx.busy} disabled={totalOwed === 0n} onClick={() => void claimAll().catch(() => {})}>
              Claim all income
            </Button>
          </div>
        </Card>
        <Card className="p-4">
          <p className="px-1 text-sm font-semibold text-slate-900">Allocation</p>
          <AllocationChart data={holdings.filter((h) => h.value !== "0").map((h) => ({ name: h.symbol, value: toNumber(h.value, USDC) }))} />
          <ul className="space-y-1 px-1 text-xs">
            {holdings
              .filter((h) => h.value !== "0")
              .map((h, i) => (
                <li key={h.token} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: SLICE_COLOURS[i % SLICE_COLOURS.length] }} />
                    {h.name}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {totalValue ? ((Number(h.value) / Number(totalValue)) * 100).toFixed(1) : 0}%
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Holdings" />
        {portfolio.isLoading ? (
          <Skeleton className="m-5 h-32" />
        ) : holdings.length ? (
          <Table head={["Asset", "Shares", "Locked", "NAV", "Value", "Claimable", "Claimed", ""]}>
            {holdings.map((h, i) => (
              <tr key={h.token}>
                <Td>
                  <Link href={`/assets/${h.token}`} className="font-medium text-slate-900 hover:underline">
                    {h.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">{h.symbol}</span>
                  {h.frozen && (
                    <span className="ml-2">
                      <Badge tone="rose">Frozen</Badge>
                    </span>
                  )}
                </Td>
                <Td className="tabular-nums">{formatShares(h.balance)}</Td>
                <Td className="tabular-nums">{h.locked !== "0" ? formatShares(h.locked) : "—"}</Td>
                <Td className="tabular-nums">{formatUsd(h.navPerShare)}</Td>
                <Td className="font-medium tabular-nums">{formatUsd(h.value)}</Td>
                <Td className="tabular-nums text-teal-700">{formatUsd(owed[i] ?? 0n)}</Td>
                <Td className="tabular-nums">{formatUsd(h.incomeClaimed)}</Td>
                <Td>
                  <Link href={`/assets/${h.token}`} className="text-sm font-medium text-teal-700 hover:underline">
                    Manage
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="No positions yet" body="Subscribe to an asset from the marketplace." action={<Link href="/" className="text-sm font-medium text-teal-700 underline">Browse assets</Link>} />
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your requests" description="Subscriptions and redemptions wait for a compliance officer" />
          {requests.data?.length ? (
            <Table head={["#", "Type", "Asset", "Amount", "Status", ""]}>
              {requests.data.map((r) => (
                <tr key={r.id}>
                  <Td className="text-slate-500">{r.id}</Td>
                  <Td>{REQUEST_KINDS[r.kind]}</Td>
                  <Td>{r.symbol}</Td>
                  <Td className="tabular-nums">{r.kind === 0 ? formatUsd(r.amount) : `${formatShares(r.amount)} sh`}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{REQUEST_STATUSES[r.status]}</Badge>
                    {r.reason && <p className="mt-1 max-w-56 whitespace-normal text-xs text-slate-500">{r.reason}</p>}
                  </Td>
                  <Td>
                    {r.status === 0 && r.requestedBy === address?.toLowerCase() && (
                      <Button size="sm" variant="secondary" loading={tx.busy} onClick={() => void cancel(r.id).catch(() => {})}>
                        Cancel
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No requests" />
          )}
        </Card>
        <Card>
          <CardHeader title="Income received" />
          {portfolio.data?.claims.length ? (
            <Table head={["Date", "Asset", "Amount", "Transaction"]}>
              {portfolio.data.claims.slice(0, 12).map((c) => (
                <tr key={c.txHash}>
                  <Td>{formatDate(c.timestamp)}</Td>
                  <Td>{c.symbol}</Td>
                  <Td className="tabular-nums">{formatUsd(c.amount)}</Td>
                  <Td>
                    <TxLink hash={c.txHash} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="No income claimed yet" />
          )}
        </Card>
      </div>
    </>
  );
}
