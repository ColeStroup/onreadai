"use client";

import { RecommendationStatus } from "@prisma/client";
import { ArrowRight, Clock3, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { CustomerEventSurface } from "@/lib/analytics/customer-events";
import { updateRecommendationStatus } from "@/lib/recommendations/actions";
import { cn } from "@/lib/utils";

type RecommendationPrimaryActionProps = {
  businessId: string;
  recommendationId: string;
  recommendationTitle: string;
  status: RecommendationStatus;
  surface?: CustomerEventSurface;
  className?: string;
};

export function RecommendationPrimaryAction({
  businessId,
  recommendationId,
  recommendationTitle,
  status,
  surface = "action_plan",
  className,
}: RecommendationPrimaryActionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const actionHref = `/dashboard/businesses/${businessId}/action-plan?q=${encodeURIComponent(recommendationTitle)}`;

  if (status === RecommendationStatus.IN_PROGRESS) {
    return (
      <Link
        href={actionHref}
        data-customer-event="task_continued"
        data-customer-surface={surface}
        className={buttonVariants({
          variant: "primary",
          size: "sm",
          className,
        })}
      >
        Continue action
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  if (
    status === RecommendationStatus.COMPLETED ||
    status === RecommendationStatus.DISMISSED
  ) {
    return (
      <Link
        href={actionHref}
        className={buttonVariants({
          variant: "secondary",
          size: "sm",
          className,
        })}
      >
        Review action
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  function startAction() {
    setError(null);
    startTransition(() => {
      void updateRecommendationStatus({
        businessId,
        recommendationId,
        status: RecommendationStatus.IN_PROGRESS,
      }).then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Could not start this action.");
          return;
        }
        router.refresh();
      });
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={startAction}
        disabled={isPending}
        aria-busy={isPending}
        data-customer-event={
          surface === "business_overview"
            ? "overview_primary_action_clicked"
            : "task_started"
        }
        data-customer-surface={surface}
        className={buttonVariants({
          variant: "primary",
          size: "sm",
          className: "w-full",
        })}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Clock3 className="size-4" aria-hidden="true" />
        )}
        {isPending ? "Starting action..." : "Start action"}
      </button>
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error} Your saved audit was not changed.
        </p>
      ) : null}
    </div>
  );
}
