"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity-feed";
import { Card, CardHeader, PageHeader, Skeleton, Stat } from "@/components/ui";
import { formatUsd } from "@/lib/format";
import { useAssets, useDashboard } from "@/lib/queries";
import { useSession } from "@/lib/session";

const ROLE_FOCUS: Record<string, string> = {
  ADMIN: "You hold the admin role on every contract: roles, compliance modules and treasury settings.",
  COMPLIANCE_OFFICER: "You review KYC applications, approve or reject desk requests, and act as transfer agent.",
  ASSET_MANAGER: "You tokenize new assets, keep their records, and propose share allocations.",
  VALUATOR: "You publish NAV updates with the hash of each valuation report.",
  TREASURY: "You fund redemptions and deposit rent, coupons and dividends for distribution.",
};

export default function AdminOverview() {
  const { role } = useSession();
  const dashboard = useDashboard();
  const assets = useAssets();
  const d = dashboard.data;

  return (
    <>
      <PageHeader title="Operations" description={role ? ROLE_FOCUS[role] : undefined} />
      {!d ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/kyc">
            <Card className="p-5 hover:shadow-md">
              <Stat label="KYC awaiting review" value={d.pendingKyc} hint={`${d.summary.investors} verified investors`} />
            </Card>
          </Link>
          <Link href="/admin/requests">
            <Card className="p-5 hover:shadow-md">
              <Stat label="Requests awaiting approval" value={d.summary.pendingRequests} hint="Subscriptions, redemptions, allocations" />
            </Card>
          </Link>
          <Card className="p-5">
            <Stat label="Issued at NAV" value={formatUsd(d.summary.marketValue, { compact: true })} hint={`${d.summary.assets} assets, ${d.summary.holderPositions} positions`} />
          </Card>
          <Link href="/admin/audit">
            <Card className={`p-5 hover:shadow-md ${d.audit.valid ? "" : "border-rose-300 bg-rose-50"}`}>
              <div className="flex items-start justify-between">
                <Stat
                  label="Audit trail"
                  value={d.audit.valid ? "Intact" : "Broken"}
                  hint={d.audit.valid ? `${d.audit.checked} entries verified` : `First bad entry #${d.audit.brokenAt}`}
                />
                {d.audit.valid ? <ShieldCheck className="h-6 w-6 text-teal-600" /> : <ShieldAlert className="h-6 w-6 text-rose-600" />}
              </div>
            </Card>
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Latest on-chain events" action={<Link href="/activity" className="text-sm font-medium text-teal-700">All activity</Link>} />
          <ActivityFeed items={d?.recent} loading={!d} />
        </Card>
        <Card>
          <CardHeader title="Assets" />
          <ul className="divide-y divide-slate-100">
            {assets.data?.map((a) => (
              <li key={a.token} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/assets/${a.token}`} className="font-medium text-slate-900 hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {a.holderCount} holders · NAV {formatUsd(a.navPerShare)}
                  </p>
                </div>
                <span className="tabular-nums text-slate-700">{formatUsd(a.marketValue, { compact: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
