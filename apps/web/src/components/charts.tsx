"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Distribution, Valuation } from "@/lib/api";
import { formatDate, formatUsd, toNumber, USDC } from "@/lib/format";

const axis = { fontSize: 12, fill: "#64748b" };

export function NavChart({ data }: { data: Valuation[] }) {
  const points = data.map((v) => ({
    t: Number(v.timestamp),
    nav: toNumber(v.navPerShare, USDC),
  }));
  if (points.length === 0) return null;
  const values = points.map((p) => p.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.3, max * 0.01);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="nav" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => formatDate(t).slice(3)}
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            formatter={(v) => [`$${Number(v).toFixed(2)}`, "NAV per share"]}
            labelFormatter={(t) => formatDate(Number(t))}
            contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 13 }}
          />
          <Area type="stepAfter" dataKey="nav" stroke="#0d9488" strokeWidth={2} fill="url(#nav)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncomeChart({ data }: { data: Distribution[] }) {
  const bars = [...data]
    .reverse()
    .map((d) => ({ t: formatDate(d.timestamp).slice(3), amount: toNumber(d.amount, USDC) }));
  if (bars.length === 0) return null;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={bars} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="t" tick={axis} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis
            tickFormatter={(v: number) => `$${Intl.NumberFormat("en-US", { notation: "compact" }).format(v)}`}
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            formatter={(v) => [formatUsd(BigInt(Math.round(Number(v) * 1e6))), "Distributed"]}
            contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 13 }}
          />
          <Bar dataKey="amount" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SLICE_COLOURS = ["#0d9488", "#1e3a8a", "#b45309", "#7c3aed", "#be123c"];

export function AllocationChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) return null;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={SLICE_COLOURS[i % SLICE_COLOURS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, name) => [`$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, name]}
            contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 13 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export { SLICE_COLOURS };
