"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Landmark } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { IS_LOCAL_CHAIN } from "@/lib/env";
import { useSession } from "@/lib/session";
import { Badge, cx } from "./ui";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Platform admin",
  COMPLIANCE_OFFICER: "Compliance officer",
  ASSET_MANAGER: "Asset manager",
  VALUATOR: "Valuer",
  TREASURY: "Treasury",
  INVESTOR: "Investor",
};

export function Header() {
  const pathname = usePathname();
  const { role, isStaff, status } = useSession();
  const links = [
    { href: "/", label: "Marketplace" },
    ...(status === "authenticated" && !isStaff ? [{ href: "/portfolio", label: "Portfolio" }] : []),
    ...(status === "authenticated" && !isStaff ? [{ href: "/onboarding", label: "Verification" }] : []),
    ...(isStaff ? [{ href: "/admin", label: "Operations" }] : []),
    { href: "/activity", label: "Activity" },
  ];
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500 text-slate-950">
            <Landmark className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="hidden text-sm font-semibold leading-tight sm:block">
            RWA Tokenization
            <span className="block text-xs font-normal text-slate-400">Real-world asset platform</span>
          </span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors",
                active(l.href) ? "bg-white/10 text-white" : "text-slate-300 hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          {IS_LOCAL_CHAIN && (
            <span className="hidden lg:block">
              <Badge tone="amber">Local chain</Badge>
            </span>
          )}
          {role && <span className="hidden text-xs text-slate-300 md:block">{ROLE_LABEL[role]}</span>}
          <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
