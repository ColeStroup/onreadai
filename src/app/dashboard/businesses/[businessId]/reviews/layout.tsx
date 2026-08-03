import type { ReactNode } from "react";

import { FutureModuleUnavailable } from "@/components/dashboard/future-module-unavailable";
import { isLocalGrowthEnabled } from "@/lib/features/feature-flags";

export default async function LocalGrowthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  if (isLocalGrowthEnabled()) return children;
  const { businessId } = await params;
  return (
    <FutureModuleUnavailable
      businessId={businessId}
      moduleName="Local Growth"
    />
  );
}
