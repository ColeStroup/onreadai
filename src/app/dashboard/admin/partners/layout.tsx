import type { ReactNode } from "react";
import { PartnerAdminNav } from "@/components/partners/partner-admin-nav";
import { requireAdmin } from "@/lib/partners/authorization";
export default async function PartnerAdminLayout({ children }: { children: ReactNode }) { await requireAdmin(); return <div className="mx-auto w-full max-w-7xl space-y-6"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Administrator</p><h1 className="mt-2 text-2xl font-semibold">Partner Program operations</h1></div><PartnerAdminNav />{children}</div>; }
