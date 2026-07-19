import { ArrowRight, LockKeyhole } from "lucide-react";
import { PlanType } from "@prisma/client";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { planLabels } from "@/lib/billing/plans";

export function LockedFeature({
  title,
  description,
  requiredPlan = PlanType.STARTER,
  preview,
}: {
  title: string;
  description: string;
  requiredPlan?: PlanType;
  preview?: string[];
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-foreground/5 text-muted">
          <LockKeyhole className="size-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>
      {preview && preview.length > 0 ? (
        <CardContent>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Preview
            </p>
            <ul className="space-y-2 text-sm leading-6 text-muted">
              {preview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-sm font-medium text-muted">
            {planLabels[requiredPlan]} unlocks the full experience.
          </p>
        </CardContent>
      ) : null}
      <CardContent className={preview?.length ? "pt-0" : undefined}>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted">
            This feature is packaged for {planLabels[requiredPlan]} or higher
            so paid users can export, present, track, and revisit deeper
            strategy work.
          </p>
          <a href="/pricing" className={buttonVariants({ variant: "primary" })}>
            View Plans
            <ArrowRight className="size-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
