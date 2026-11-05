"use client";

import { ACTIVITY_TONE, describeActivity } from "@/lib/activity";
import type { Activity } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Badge, Empty, Skeleton, TxLink } from "./ui";

export function ActivityFeed({ items, loading }: { items?: Activity[]; loading?: boolean }) {
  if (loading) return <Skeleton className="m-5 h-40" />;
  if (!items?.length) return <Empty title="No activity yet" body="On-chain events appear here within a second of confirmation." />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3">
          <div className="w-28 shrink-0 text-xs text-slate-500 tabular-nums">{formatDate(a.timestamp, true)}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800">{describeActivity(a)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={ACTIVITY_TONE[a.event] ?? "slate"}>{a.event.replace(/([a-z])([A-Z])/g, "$1 $2")}</Badge>
              {a.symbol && <span className="font-mono text-xs text-slate-500">{a.symbol}</span>}
            </div>
          </div>
          <TxLink hash={a.txHash} />
        </li>
      ))}
    </ul>
  );
}
