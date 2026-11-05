"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  assetTokenAbi,
  getDeployment,
  identityRegistryAbi,
  issuanceDeskAbi,
  mockUSDCAbi,
  TRANSFER_CODES,
} from "@rwa/contracts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { type Abi, isAddress, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import type { Asset } from "@/lib/api";
import { CHAIN_ID } from "@/lib/env";
import { formatShares, formatUsd, parseAmount, payoutFor, SHARES, sharesFor, USDC } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/tx";
import { Button, Card, Field, Input, Notice, Tabs } from "./ui";

const deployment = getDeployment(CHAIN_ID);
const SLIPPAGE_BPS = 100n; // investor accepts up to 1% NAV movement before approval

type Tab = "subscribe" | "redeem" | "transfer" | "income";

export function InvestPanel({ asset }: { asset: Asset }) {
  const { address } = useAccount();
  const { status, isStaff } = useSession();
  const [tab, setTab] = useState<Tab>("subscribe");
  const tx = useTx();
  const token = asset.token;
  const nav = BigInt(asset.navPerShare);

  const reads = useReadContracts({
    allowFailure: false,
    query: { enabled: !!address, refetchInterval: 4_000 },
    contracts: address
      ? [
          { address: deployment.settlementToken, abi: mockUSDCAbi, functionName: "balanceOf", args: [address] },
          { address: deployment.settlementToken, abi: mockUSDCAbi, functionName: "allowance", args: [address, deployment.issuanceDesk] },
          { address: token, abi: assetTokenAbi, functionName: "balanceOf", args: [address] },
          { address: token, abi: assetTokenAbi, functionName: "freeBalanceOf", args: [address] },
          { address: token, abi: assetTokenAbi, functionName: "claimableIncome", args: [address] },
          { address: deployment.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [address] },
        ]
      : [],
  });
  const [usdcBalance = 0n, allowance = 0n, shareBalance = 0n, freeShares = 0n, claimable = 0n, verified = false] =
    (reads.data ?? []) as [bigint, bigint, bigint, bigint, bigint, boolean];

  const [payment, setPayment] = useState("");
  const [redeemShares, setRedeemShares] = useState("");
  const [recipient, setRecipient] = useState("");
  const [transferShares, setTransferShares] = useState("");

  const paymentUnits = parseAmount(payment, USDC);
  const expectedShares = paymentUnits ? sharesFor(paymentUnits, nav) : 0n;
  const redeemUnits = parseAmount(redeemShares, SHARES);
  const expectedPayout = redeemUnits ? payoutFor(redeemUnits, nav) : 0n;
  const transferUnits = parseAmount(transferShares, SHARES);

  // Pre-flight: would a mint of these shares to me pass the asset's compliance rules?
  const mintCheck = useReadContract({
    address: token,
    abi: assetTokenAbi,
    functionName: "transferStatus",
    args: [zeroAddress, address ?? zeroAddress, expectedShares > 0n ? expectedShares : 1n],
    query: { enabled: !!address && verified },
  });
  const transferCheck = useReadContract({
    address: token,
    abi: assetTokenAbi,
    functionName: "transferStatus",
    args: [address ?? zeroAddress, isAddress(recipient) ? recipient : zeroAddress, transferUnits ?? 0n],
    query: { enabled: !!address && isAddress(recipient) && !!transferUnits },
  });

  const blocked = useMemo(() => {
    if (asset.status !== 0) return "This asset is not open for new requests.";
    if (asset.paused) return "Trading in this asset is paused.";
    return null;
  }, [asset.status, asset.paused]);

  if (status !== "authenticated") {
    return (
      <Card className="p-5">
        <p className="font-semibold text-slate-900">Invest in {asset.symbol}</p>
        <p className="mt-1 text-sm text-slate-500">Connect a wallet and sign in to subscribe, redeem or claim income.</p>
        <div className="mt-4">
          <ConnectButton />
        </div>
      </Card>
    );
  }
  if (isStaff) {
    return (
      <Card className="p-5">
        <p className="font-semibold text-slate-900">Staff wallet</p>
        <p className="mt-1 text-sm text-slate-500">
          Staff wallets do not invest. Manage this asset from{" "}
          <Link href="/admin/assets" className="font-medium text-teal-700 underline">
            Operations
          </Link>
          .
        </p>
      </Card>
    );
  }

  const audit = (action: string, summary: string) => ({ action, entityType: "ASSET", entityId: asset.symbol, summary });

  const subscribe = async () => {
    if (!paymentUnits) return;
    if (allowance < paymentUnits) {
      await tx.run("Approve stablecoin", {
        address: deployment.settlementToken,
        abi: mockUSDCAbi as Abi,
        functionName: "approve",
        args: [deployment.issuanceDesk, paymentUnits],
      });
    }
    const minShares = (expectedShares * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    await tx.run(
      "Subscription requested",
      {
        address: deployment.issuanceDesk,
        abi: issuanceDeskAbi as Abi,
        functionName: "requestSubscription",
        args: [token, paymentUnits, minShares],
      },
      audit("SUBSCRIPTION_REQUESTED", `Requested ${asset.symbol} for ${formatUsd(paymentUnits)}`),
    );
    setPayment("");
  };

  const redeem = async () => {
    if (!redeemUnits) return;
    const minPayout = (expectedPayout * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    await tx.run(
      "Redemption requested",
      {
        address: deployment.issuanceDesk,
        abi: issuanceDeskAbi as Abi,
        functionName: "requestRedemption",
        args: [token, redeemUnits, minPayout],
      },
      audit("REDEMPTION_REQUESTED", `Requested redemption of ${formatShares(redeemUnits)} ${asset.symbol}`),
    );
    setRedeemShares("");
  };

  const transfer = async () => {
    if (!transferUnits || !isAddress(recipient)) return;
    await tx.run(
      "Shares transferred",
      { address: token, abi: assetTokenAbi as Abi, functionName: "transfer", args: [recipient, transferUnits] },
      audit("SHARES_TRANSFERRED", `Transferred ${formatShares(transferUnits)} ${asset.symbol} to ${recipient}`),
    );
    setTransferShares("");
  };

  const claim = () =>
    tx.run(
      "Income claimed",
      { address: token, abi: assetTokenAbi as Abi, functionName: "claimIncome" },
      audit("INCOME_CLAIMED", `Claimed ${formatUsd(claimable)} from ${asset.symbol}`),
    );

  const mintCode = Number(mintCheck.data ?? 0);
  const transferCode = transferCheck.data === undefined ? null : Number(transferCheck.data);

  return (
    <Card>
      <div className="border-b border-slate-100 p-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: "subscribe", label: "Subscribe" },
            { id: "redeem", label: "Redeem" },
            { id: "transfer", label: "Transfer" },
            { id: "income", label: "Income" },
          ]}
        />
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Your {asset.symbol}</p>
            <p className="font-semibold tabular-nums">{formatShares(shareBalance)}</p>
            {shareBalance !== freeShares && (
              <p className="text-xs text-amber-700">{formatShares(shareBalance - freeShares)} locked</p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500">Stablecoin balance</p>
            <p className="font-semibold tabular-nums">{formatUsd(usdcBalance)}</p>
          </div>
        </div>

        {!verified && (
          <Notice tone="amber" title="Wallet not verified">
            Complete <Link href="/onboarding" className="font-semibold underline">verification</Link> before subscribing.
          </Notice>
        )}
        {blocked && <Notice tone="rose">{blocked}</Notice>}

        {tab === "subscribe" && (
          <>
            <Field
              label="Amount to invest (USDC)"
              hint={`Indicative at today's NAV of ${formatUsd(nav)}. Shares are priced at the NAV in force when the request is approved.`}
            >
              <Input inputMode="decimal" placeholder="10,000" value={payment} onChange={(e) => setPayment(e.target.value)} />
            </Field>
            {paymentUnits && (
              <p className="text-sm text-slate-600">
                About <span className="font-semibold text-slate-900">{formatShares(expectedShares)} {asset.symbol}</span>, with a
                1% price limit.
              </p>
            )}
            {verified && paymentUnits && mintCode !== 0 && (
              <Notice tone="rose" title="This request would be rejected">
                {TRANSFER_CODES[mintCode]}
              </Notice>
            )}
            <Button
              className="w-full"
              variant="accent"
              loading={tx.busy}
              disabled={!verified || !!blocked || !paymentUnits || paymentUnits > usdcBalance || mintCode !== 0}
              onClick={() => void subscribe().catch(() => {})}
            >
              {paymentUnits && allowance < paymentUnits ? "Approve and request" : "Request subscription"}
            </Button>
          </>
        )}

        {tab === "redeem" && (
          <>
            <Field label={`Shares to redeem (free: ${formatShares(freeShares)})`} hint="Shares stay in your wallet, locked, until the request is approved or rejected.">
              <Input inputMode="decimal" placeholder="100" value={redeemShares} onChange={(e) => setRedeemShares(e.target.value)} />
            </Field>
            {redeemUnits && (
              <p className="text-sm text-slate-600">
                Indicative payout <span className="font-semibold text-slate-900">{formatUsd(expectedPayout)}</span> at today&apos;s NAV.
              </p>
            )}
            <Button
              className="w-full"
              loading={tx.busy}
              disabled={!!blocked || !redeemUnits || redeemUnits > freeShares}
              onClick={() => void redeem().catch(() => {})}
            >
              Request redemption
            </Button>
          </>
        )}

        {tab === "transfer" && (
          <>
            <Field label="Recipient wallet" hint="Only verified investors who meet this asset's rules can receive shares.">
              <Input placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} />
            </Field>
            <Field label="Shares">
              <Input inputMode="decimal" placeholder="50" value={transferShares} onChange={(e) => setTransferShares(e.target.value)} />
            </Field>
            {transferCode !== null && (
              <Notice tone={transferCode === 0 ? "teal" : "rose"}>
                {transferCode === 0 ? "Allowed by the asset's compliance rules." : TRANSFER_CODES[transferCode]}
              </Notice>
            )}
            <Button
              className="w-full"
              loading={tx.busy}
              disabled={transferCode !== 0}
              onClick={() => void transfer().catch(() => {})}
            >
              Transfer shares
            </Button>
          </>
        )}

        {tab === "income" && (
          <>
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <p className="text-sm text-teal-800">Claimable income</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-950">{formatUsd(claimable)}</p>
              <p className="mt-1 text-xs text-teal-800">
                Paid pro rata to holders at each distribution. Locked shares keep earning until they are redeemed.
              </p>
            </div>
            <Button className="w-full" variant="accent" loading={tx.busy} disabled={claimable === 0n} onClick={() => void claim().catch(() => {})}>
              Claim {formatUsd(claimable)}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
