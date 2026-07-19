import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
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

export function UpgradeCard({
  title,
  description,
  requiredPlan = PlanType.STARTER,
}: {
  title: string;
  description: string;
  requiredPlan?: PlanType;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Sparkles className="size-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Unlocks with {planLabels[requiredPlan]} or higher.
        </p>
        <Link href="/pricing" className={buttonVariants({ variant: "primary" })}>
          View Plans
          <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
