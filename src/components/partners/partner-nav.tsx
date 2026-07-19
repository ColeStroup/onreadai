"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  ["Overview", "/dashboard/partner"],
  ["Training", "/dashboard/partner/training"],
  ["Earnings", "/dashboard/partner/earnings"],
  ["Payouts", "/dashboard/partner/payouts"],
  ["Scanner", "/dashboard/partner/scanner"],
  ["Prospects", "/dashboard/partner/prospects"],
  ["Resources", "/dashboard/partner/resources"],
  ["Settings", "/dashboard/partner/settings"],
] as const;

export function PartnerNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Partner navigation" className="flex gap-1 overflow-x-auto border-b border-border pb-px">
      {items.map(([label, href]) => {
        const active = pathname === href || (href !== "/dashboard/partner" && pathname.startsWith(href));
        return (
          <Link key={href} href={href} className={cn("whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", active && "border-accent text-foreground")}>{label}</Link>
        );
      })}
    </nav>
  );
}
