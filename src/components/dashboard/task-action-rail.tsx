import type { RecommendationStatus } from "@prisma/client";
import Link from "next/link";

import { RecommendationStatusControls } from "@/components/dashboard/recommendation-status-controls";
import { ImplementationHelpDrawer } from "@/components/implementation/implementation-help-drawer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TaskActionRailProps = {
  businessId: string;
  businessName: string;
  recommendationId: string;
  recommendationTitle: string;
  status: RecommendationStatus;
  evidence?: string | null;
  initialSavedCount?: number;
  implementationLabel: string;
  className?: string;
};

export function TaskActionRail({
  businessId,
  businessName,
  recommendationId,
  recommendationTitle,
  status,
  evidence,
  initialSavedCount = 0,
  implementationLabel,
  className,
}: TaskActionRailProps) {
  return (
    <div
      data-task-action-rail="true"
      data-recommendation-id={recommendationId}
      className={cn(
        "grid min-w-0 grid-cols-1 gap-2 min-[520px]:grid-cols-2 lg:flex lg:w-40 lg:flex-col lg:items-stretch",
        className,
      )}
    >
      <Link
        href={`/dashboard/businesses/${businessId}/action-plan?q=${encodeURIComponent(recommendationTitle)}`}
        className={buttonVariants({
          variant: "secondary",
          size: "sm",
          className: "w-full",
        })}
      >
        View Task
      </Link>
      <ImplementationHelpDrawer
        businessId={businessId}
        businessName={businessName}
        source={{ kind: "recommendation", recommendationId }}
        recommendationId={recommendationId}
        recommendationTitle={recommendationTitle}
        evidence={evidence}
        initialSavedCount={initialSavedCount}
        label={implementationLabel}
        triggerClassName="w-full"
      />
      <RecommendationStatusControls
        businessId={businessId}
        recommendationId={recommendationId}
        status={status}
        compact
        layout="rail"
      />
    </div>
  );
}
