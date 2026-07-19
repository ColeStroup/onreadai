import { Check, Circle, ClipboardCheck, X } from "lucide-react";
import Link from "next/link";

import {
  dismissBusinessSetup,
  resumeBusinessSetup,
} from "@/app/dashboard/businesses/[businessId]/setup/actions";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BusinessSetupProgress } from "@/lib/onboarding/business-setup";

export function SetupChecklist({
  businessId,
  progress,
  dismissed,
}: {
  businessId: string;
  progress: BusinessSetupProgress;
  dismissed: boolean;
}) {
  if (progress.resultsReviewed) return null;

  if (dismissed) {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="size-5 text-accent" />
          <div>
            <p className="text-sm font-semibold">Setup is still available</p>
            <p className="mt-1 text-xs text-muted">
              {progress.completedCount} of 5 steps complete
            </p>
          </div>
        </div>
        <form action={resumeBusinessSetup}>
          <input type="hidden" name="businessId" value={businessId} />
          <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Resume setup
          </button>
        </form>
      </Card>
    );
  }

  const items = [
    ["Confirm profiles", progress.profilesComplete],
    ["Review Business Context", progress.contextComplete],
    ["Select goals", progress.goalsComplete],
    ["Run first audit", progress.auditComplete],
  ] as const;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Complete your setup</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Finish the remaining inputs so recommendations use the clearest available context.
          </p>
        </div>
        <form action={dismissBusinessSetup}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="step" value={progress.currentStep} />
          <button
            type="submit"
            aria-label="Dismiss setup checklist"
            className="flex size-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="size-4" />
          </button>
        </form>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, complete]) => (
          <div key={label} className="flex items-center gap-2 rounded-lg bg-foreground/[0.035] px-3 py-2 text-sm">
            {complete ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-teal-600 text-white">
                <Check className="size-3.5" />
              </span>
            ) : (
              <Circle className="size-5 text-muted" />
            )}
            <span className={complete ? "text-muted" : "font-medium"}>{label}</span>
          </div>
        ))}
      </div>
      <Link
        href={`/dashboard/businesses/${businessId}/setup`}
        className={buttonVariants({ variant: "primary", size: "sm", className: "mt-4" })}
      >
        Continue Setup
      </Link>
    </Card>
  );
}
