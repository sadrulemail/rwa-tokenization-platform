"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AssetCard } from "@/components/asset-card";
import { Card, Notice, Skeleton, Stat } from "@/components/ui";
import { formatUsd } from "@/lib/format";
import { useAssets, useSummary } from "@/lib/queries";
import { useSession } from "@/lib/session";

export default function MarketplacePage() {
  const summary = useSummary();
  const assets = useAssets();
  const { status, me, isStaff } = useSession();
  const kyc = me?.kyc?.status;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-teal-300">Tokenized real-world assets</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Own a share of property, private credit and funds, with every transfer checked on-chain.
          </h1>
          <p className="mt-3 text-slate-300">
            Shares are issued only to verified investors. Rent, coupons and dividends are paid in stablecoin to the
            wallets that hold the shares, and every decision is recorded in a tamper-evident audit trail.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/10 pt-6 sm:grid-cols-4">
          {summary.data ? (
            <>
              <DarkStat label="Issued at NAV" value={formatUsd(summary.data.marketValue, { compact: true })} />
              <DarkStat label="Income distributed" value={formatUsd(summary.data.incomeDistributed, { compact: true })} />
              <DarkStat label="Verified investors" value={String(summary.data.investors)} />
              <DarkStat label="Listed assets" value={String(summary.data.assets)} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 bg-white/10" />)
          )}
        </div>
      </section>

      {status === "authenticated" && !isStaff && kyc !== "APPROVED" && (
        <Notice tone="amber" title={kyc === "SUBMITTED" ? "Verification in review" : "Verify your identity to invest"}>
          {kyc === "SUBMITTED" ? (
            "A compliance officer is reviewing your application. You can browse assets in the meantime."
          ) : (
            <>
              Shares can only be issued to verified wallets.{" "}
              <Link href="/onboarding" className="font-semibold underline">
                Start verification
              </Link>
              .
            </>
          )}
        </Notice>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assets</h2>
            <p className="text-sm text-slate-500">NAV, holders and issuance update live from the chain.</p>
          </div>
        </div>
        {assets.isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-80" />
            ))}
          </div>
        ) : assets.error ? (
          <Notice tone="rose" title="Assets could not be loaded">
            {(assets.error as Error).message}
          </Notice>
        ) : assets.data?.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {assets.data.map((a) => (
              <AssetCard key={a.token} asset={a} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center text-sm text-slate-500">No assets have been tokenized yet.</Card>
        )}
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        {[
          ["Verified holders only", "The identity registry whitelists wallets after KYC. Unverified wallets cannot receive shares."],
          ["Rules on every transfer", "Investor tier, blocked countries, holder caps and lock-ups are checked by the token itself."],
          ["Two people per decision", "Subscriptions, redemptions and allocations need a second person to approve."],
        ].map(([title, body]) => (
          <Card key={title} className="p-5">
            <ShieldCheck className="h-5 w-5 text-teal-600" aria-hidden />
            <p className="mt-3 font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm text-slate-500">{body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}

function DarkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="[&_p:first-child]:text-slate-400 [&_p:nth-child(2)]:text-white">
      <Stat label={label} value={value} />
    </div>
  );
}
