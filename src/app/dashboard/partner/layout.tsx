import type { ReactNode } from "react";

import { PartnerNav } from "@/components/partners/partner-nav";
import { requirePartner } from "@/lib/partners/authorization";

export default async function PartnerLayout({ children }: { children: ReactNode }) {
  await requirePartner("/dashboard/partner");
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Certified Growth Partner</p>
        <h1 className="mt-2 text-2xl font-semibold">Partner workspace</h1>
      </div>
      <PartnerNav />
      {children}
    </div>
  );
}
