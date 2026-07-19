import type { ReactNode } from "react";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-shell min-h-screen overflow-x-clip bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}

