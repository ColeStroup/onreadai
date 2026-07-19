"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [["Overview", "/dashboard/admin/partners"], ["Applications", "/dashboard/admin/partners/applications"], ["Commissions", "/dashboard/admin/partners/commissions"], ["Payouts", "/dashboard/admin/partners/payouts"], ["Settings", "/dashboard/admin/partners/settings"]] as const;
export function PartnerAdminNav() { const pathname = usePathname(); return <nav aria-label="Partner administration" className="flex gap-1 overflow-x-auto border-b border-border">{items.map(([label, href]) => { const active = pathname === href || (href !== "/dashboard/admin/partners" && pathname.startsWith(href)); return <Link key={href} href={href} className={cn("whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted", active && "border-accent text-foreground")}>{label}</Link>; })}</nav>; }
