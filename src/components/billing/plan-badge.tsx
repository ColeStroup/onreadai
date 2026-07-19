import { PlanType } from "@prisma/client";

import { planLabels } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

const styles: Record<PlanType, string> = {
  FREE: "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100",
  ONE_TIME_AUDIT:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  STARTER:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  PRO: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  AGENCY:
    "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-100",
};

export function PlanBadge({
  plan,
  className,
}: {
  plan: PlanType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        styles[plan],
        className,
      )}
    >
      {planLabels[plan]}
    </span>
  );
}
