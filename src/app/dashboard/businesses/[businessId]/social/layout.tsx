import type { ReactNode } from "react";

import { FutureModuleUnavailable } from "@/components/dashboard/future-module-unavailable";
import { isSocialGrowthEnabled } from "@/lib/features/feature-flags";

export default async function SocialLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  if (isSocialGrowthEnabled()) return children;
  const { businessId } = await params;
  return (
    <FutureModuleUnavailable
      businessId={businessId}
      moduleName="Social Growth"
    />
  );
}
