"use client";

import { RecommendationStatus } from "@prisma/client";
import { CheckCircle2, ChevronDown, Clock3, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { updateRecommendationStatus } from "@/lib/recommendations/actions";
import { recommendationStatusLabels } from "@/lib/recommendations/utils";
import { cn } from "@/lib/utils";

type RecommendationStatusControlsProps = {
  businessId: string;
  recommendationId: string;
  status: RecommendationStatus;
  compact?: boolean;
  layout?: "inline" | "rail";
};

export function RecommendationStatusControls({
  businessId,
  recommendationId,
  status,
  compact = false,
  layout = "inline",
}: RecommendationStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(status);
  const [error, setError] = useState<string | null>(null);

  function setStatus(nextStatus: RecommendationStatus) {
    setError(null);
    setOptimisticStatus(nextStatus);

    startTransition(() => {
      void updateRecommendationStatus({
        businessId,
        recommendationId,
        status: nextStatus,
      }).then((result) => {
        if (!result.ok) {
          setOptimisticStatus(status);
          setError(result.error ?? "Could not update recommendation.");
          return;
        }

        router.refresh();
      });
    });
  }

  const primaryAction =
    optimisticStatus === RecommendationStatus.TODO
      ? {
          label: "Start task",
          status: RecommendationStatus.IN_PROGRESS,
          icon: Clock3,
        }
      : optimisticStatus === RecommendationStatus.IN_PROGRESS
        ? {
            label: "Mark complete",
            status: RecommendationStatus.COMPLETED,
            icon: CheckCircle2,
          }
        : {
            label: "Move to To Do",
            status: RecommendationStatus.TODO,
            icon: RotateCcw,
          };
  const PrimaryIcon = primaryAction.icon;
  const statusSelect = (
    <select
      id={`status-${recommendationId}`}
      value={optimisticStatus}
      disabled={isPending}
      onChange={(event) =>
        setStatus(event.target.value as RecommendationStatus)
      }
      className={buttonVariants({
        variant: "secondary",
        size: "sm",
        className:
          layout === "rail"
            ? "block w-full min-w-0 appearance-none px-9 text-center"
            : compact
              ? "max-w-36"
              : "max-w-44",
      })}
      aria-label="Change task status"
      aria-busy={isPending}
    >
      {Object.values(RecommendationStatus).map((nextStatus) => (
        <option key={nextStatus} value={nextStatus}>
          {recommendationStatusLabels[nextStatus]}
        </option>
      ))}
    </select>
  );

  return (
    <div
      className={cn(
        "space-y-2",
        layout === "rail" && "min-[520px]:col-span-2 lg:w-full",
      )}
    >
      <div
        className={cn(
          layout === "rail"
            ? "grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 lg:grid-cols-1"
            : "flex flex-wrap items-center gap-2",
        )}
      >
        <button
          type="button"
          disabled={isPending}
          onClick={() => setStatus(primaryAction.status)}
          aria-busy={isPending}
          className={buttonVariants({
            variant:
              optimisticStatus === RecommendationStatus.COMPLETED ||
              optimisticStatus === RecommendationStatus.DISMISSED
                ? "secondary"
                : "primary",
            size: "sm",
            className: layout === "rail" ? "w-full min-w-0" : undefined,
          })}
        >
          <PrimaryIcon className="size-4" />
          {primaryAction.label}
        </button>
        <label className="sr-only" htmlFor={`status-${recommendationId}`}>
          Change task status
        </label>
        {layout === "rail" ? (
          <div className="relative w-full min-w-0">
            {statusSelect}
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
          </div>
        ) : (
          statusSelect
        )}
      </div>
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
