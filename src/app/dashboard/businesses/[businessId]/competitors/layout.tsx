import type { ReactNode } from "react";

import { FutureModuleUnavailable } from "@/components/dashboard/future-module-unavailable";
import { isCompetitorIntelligenceEnabled } from "@/lib/features/feature-flags";

export default async function CompetitorLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  if (isCompetitorIntelligenceEnabled()) return children;
  const { businessId } = await params;
  return (
    <FutureModuleUnavailable
      businessId={businessId}
      moduleName="Competitive Intelligence"
    />
  );
}
