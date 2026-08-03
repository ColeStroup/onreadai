import { CheckCircle2, Target } from "lucide-react";
import { notFound } from "next/navigation";

import { saveBusinessGoals } from "@/app/dashboard/businesses/[businessId]/goals/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  businessGoalDescriptions,
  businessGoalLabels,
  websiteSeoBusinessGoals,
} from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type BusinessGoalsPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function BusinessGoalsPage({
  params,
  searchParams,
}: BusinessGoalsPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
      goals: true,
      primaryGoal: true,
    },
  });

  if (!business) {
    notFound();
  }

  const selectedGoals = new Set(business.goals);
  const saved = query.saved === "1";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Target className="size-5" />
          </div>
          <CardTitle className="text-2xl">
            Personalize your recommendations
          </CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Choose what matters most right now. We&apos;ll use this to
            prioritize audits, recommendations, and AI consultant responses.
          </CardDescription>
        </CardHeader>
      </Card>

      {saved ? (
        <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
          <CheckCircle2 className="size-4" />
          Goals saved.
        </div>
      ) : null}

      <form action={saveBusinessGoals} className="space-y-6">
        <input type="hidden" name="businessId" value={business.id} />

        <Card>
          <CardHeader>
            <CardTitle>Business Goals</CardTitle>
            <CardDescription>
              Select any goals that should shape your next audit. Choose one as
              the primary goal when there is a clear top priority.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-border bg-background p-4">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="radio"
                  name="primaryGoal"
                  value=""
                  defaultChecked={!business.primaryGoal}
                  className="size-4 accent-foreground dark:accent-accent"
                />
                No primary goal yet
              </label>
              <p className="mt-2 text-sm leading-6 text-muted">
                You can keep recommendations balanced across all selected goals.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {websiteSeoBusinessGoals.map((goal) => {
                const isSelected = selectedGoals.has(goal);

                return (
                  <div
                    key={goal}
                    className="rounded-lg border border-border bg-background p-4 shadow-sm"
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="goals"
                        value={goal}
                        defaultChecked={isSelected}
                        className="mt-1 size-4 accent-foreground dark:accent-accent"
                      />
                      <span>
                        <span className="block text-sm font-semibold">
                          {businessGoalLabels[goal]}
                        </span>
                        <span className="mt-1 block text-sm leading-6 text-muted">
                          {businessGoalDescriptions[goal]}
                        </span>
                      </span>
                    </label>

                    <label className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted">
                      <input
                        type="radio"
                        name="primaryGoal"
                        value={goal}
                        defaultChecked={business.primaryGoal === goal}
                        className="size-3.5 accent-foreground dark:accent-accent"
                      />
                      Make primary goal
                    </label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted">
            Goals are optional. Existing audits stay unchanged until you run a
            new audit.
          </p>
          <SubmitButton pendingLabel="Saving goals...">Save goals</SubmitButton>
        </div>
      </form>
    </div>
  );
}
