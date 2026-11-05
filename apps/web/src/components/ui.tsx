"use client";

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useState,
} from "react";

import { EXPLORER_URL } from "@/lib/env";
import { shortAddress, walletLabel } from "@/lib/format";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const VARIANTS = {
  primary: "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300",
  accent: "bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-200",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-200",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const BADGE_TONES = {
  slate: "bg-slate-100 text-slate-700",
  teal: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
};
export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const control =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(control, props.className)} />
);
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx(control, props.className)} />
);
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={cx(control, props.className)} />
);

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx(!className?.includes("whitespace-normal") && "whitespace-nowrap", "px-5 py-3 text-slate-700", className)}>
    {children}
  </td>
);

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-slate-100", className)} />;
}

export function Notice({ tone = "slate", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    teal: "border-teal-200 bg-teal-50 text-teal-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
  };
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={cx(
            "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === item.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Address with the local account name when known, plus copy. */
export function AddressTag({ address, full }: { address?: string | null; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <span className="text-slate-400">—</span>;
  const label = walletLabel(address);
  return (
    <span className="inline-flex items-center gap-1.5">
      {label && <span className="font-medium text-slate-800">{label}</span>}
      <span className="font-mono text-xs text-slate-500">{full ? address : shortAddress(address)}</span>
      <button
        type="button"
        aria-label="Copy address"
        className="text-slate-400 hover:text-slate-700"
        onClick={() => {
          void navigator.clipboard?.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1_200);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

/** Transaction hash, linked to the block explorer on public networks. */
export function TxLink({ hash }: { hash?: string | null }) {
  if (!hash) return <span className="text-slate-400">—</span>;
  const text = <span className="font-mono text-xs">{`${hash.slice(0, 10)}…${hash.slice(-6)}`}</span>;
  if (!EXPLORER_URL) return <span className="text-slate-500" title={hash}>{text}</span>;
  return (
    <a href={`${EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
      {text}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
