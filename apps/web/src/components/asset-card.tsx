import { ASSET_CLASSES, INVESTOR_TIERS } from "@rwa/contracts";
import { Building2, Factory, Landmark, MapPin } from "lucide-react";
import Link from "next/link";

import type { Asset } from "@/lib/api";
import { formatPct, formatUsd, toNumber, USDC } from "@/lib/format";
import { Badge, type Tone } from "./ui";

export const CLASS_STYLE: { icon: typeof Building2; tone: Tone; band: string }[] = [
  { icon: Building2, tone: "teal", band: "from-teal-600 to-teal-800" },
  { icon: Landmark, tone: "blue", band: "from-blue-700 to-indigo-900" },
  { icon: Factory, tone: "amber", band: "from-amber-600 to-orange-800" },
];

export function navChange(asset: Asset): number {
  const first = toNumber(asset.initialNavPerShare ?? asset.navPerShare, USDC);
  const now = toNumber(asset.navPerShare, USDC);
  return first ? now / first - 1 : 0;
}

export function AssetCard({ asset }: { asset: Asset }) {
  const style = CLASS_STYLE[asset.assetClass] ?? CLASS_STYLE[0]!;
  const Icon = style.icon;
  const sold = toNumber(asset.totalSupply, 18) / Math.max(toNumber(asset.maxSupply, 18), 1);
  const change = navChange(asset);

  return (
    <Link
      href={`/assets/${asset.token}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className={`relative bg-gradient-to-br ${style.band} px-5 py-5 text-white`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-white/70">{ASSET_CLASSES[asset.assetClass]}</p>
            <h3 className="mt-1 text-lg font-semibold leading-snug">{asset.name}</h3>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        </div>
        {asset.location && (
          <p className="mt-3 flex items-center gap-1 text-sm text-white/80">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {asset.location}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 px-5 py-4">
        <div>
          <p className="text-xs text-slate-500">NAV / share</p>
          <p className="font-semibold tabular-nums text-slate-900">{formatUsd(asset.navPerShare)}</p>
          <p className={`text-xs tabular-nums ${change >= 0 ? "text-teal-700" : "text-rose-600"}`}>{formatPct(change)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Target yield</p>
          <p className="font-semibold tabular-nums text-slate-900">
            {asset.targetYieldBps != null ? `${(asset.targetYieldBps / 100).toFixed(1)}%` : "—"}
          </p>
          <p className="text-xs text-slate-500">{asset.distributionFrequency ?? ""}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Holders</p>
          <p className="font-semibold tabular-nums text-slate-900">{asset.holderCount}</p>
          <p className="text-xs text-slate-500">{formatUsd(asset.marketValue, { compact: true })} issued</p>
        </div>
      </div>
      <div className="mt-auto px-5 pb-5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{(sold * 100).toFixed(1)}% of authorised shares issued</span>
          <span className="font-mono">{asset.symbol}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(sold * 100, 100)}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {asset.minTier != null && asset.minTier > 1 && <Badge tone="blue">{INVESTOR_TIERS[asset.minTier]} investors</Badge>}
          {asset.minTier === 1 && <Badge tone="teal">Open to retail</Badge>}
          {!!asset.blockedCountries?.length && <Badge tone="amber">Country restrictions</Badge>}
          {asset.paused && <Badge tone="rose">Paused</Badge>}
          {asset.status !== 0 && <Badge tone="rose">{asset.status === 1 ? "Suspended" : "Retired"}</Badge>}
        </div>
      </div>
    </Link>
  );
}
