"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { RequireRole } from "@/components/guard";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/kyc", label: "KYC reviews" },
  { href: "/admin/requests", label: "Approvals" },
  { href: "/admin/assets", label: "Assets" },
  { href: "/admin/audit", label: "Audit trail" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireRole roles={["ADMIN", "COMPLIANCE_OFFICER", "ASSET_MANAGER", "VALUATOR", "TREASURY"]}>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cx(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                active ? "border-teal-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </RequireRole>
  );
}
