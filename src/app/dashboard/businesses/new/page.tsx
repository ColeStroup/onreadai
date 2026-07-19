import { ArrowRight, Sparkles } from "lucide-react";
import { PlanType } from "@prisma/client";

import { createBusiness } from "@/app/dashboard/businesses/new/actions";
import { UpgradeCard } from "@/components/billing/upgrade-card";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canCreateBusiness } from "@/lib/billing/entitlements";
import { requireUser } from "@/lib/session";

type NewBusinessPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const examples = [
  "harborandpine.com",
  "instagram.com/harborandpine",
  "youtube.com/@harborandpine",
  "Harbor & Pine Tampa",
];

export default async function NewBusinessPage({
  searchParams,
}: NewBusinessPageProps) {
  const user = await requireUser("/dashboard/businesses/new");
  const params = await searchParams;
  const initialBusinessInput =
    typeof params.businessInput === "string"
      ? params.businessInput.slice(0, 2_000)
      : "";
  const creationCheck = await canCreateBusiness(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Add Business</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">
          Start with one smart input
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Paste a website, social profile, or business name to create a business
          workspace.
        </p>
      </div>

      {!creationCheck.allowed ? (
        <UpgradeCard
          title="Business limit reached"
          description={
            creationCheck.reason ??
            "Upgrade to manage more business workspaces."
          }
          requiredPlan={PlanType.PRO}
        />
      ) : null}

      <Card>
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles className="size-5" />
          </div>
          <CardTitle>Business input</CardTitle>
          <CardDescription>
            Creates a business workspace from the source you provide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createBusiness} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="businessInput">
                Paste a website, social profile, or business name
              </Label>
              <Input
                id="businessInput"
                name="businessInput"
                required
                autoFocus
                defaultValue={initialBusinessInput}
                placeholder="harborandpine.com"
              />
            </div>

            {params.error === "missing" ? (
              <p className="text-sm font-medium text-rose-600">
                Enter a website, social profile, or business name.
              </p>
            ) : null}

            {params.error === "business_limit" ? (
              <p className="text-sm font-medium text-rose-600">
                Your current plan has reached the business workspace limit.
              </p>
            ) : null}

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Examples
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {examples.map((example) => (
                  <span
                    key={example}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              <strong>No website? That&apos;s okay.</strong> We can create a
              social-first growth assessment using your confirmed profiles,
              Business Context, goals, reviews, and competitors.
            </div>

            <SubmitButton
              pendingLabel="Creating business..."
              className={!creationCheck.allowed ? "pointer-events-none opacity-55" : undefined}
            >
              Continue
              <ArrowRight className="size-4" />
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
