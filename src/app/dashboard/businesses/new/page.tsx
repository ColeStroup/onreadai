import { ArrowRight, Globe2 } from "lucide-react";
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

export default async function NewBusinessPage({
  searchParams,
}: NewBusinessPageProps) {
  const user = await requireUser("/dashboard/businesses/new");
  const params = await searchParams;
  const initialWebsiteUrl =
    typeof params.websiteUrl === "string"
      ? params.websiteUrl.slice(0, 2_000)
      : "";
  const initialBusinessName =
    typeof params.businessName === "string"
      ? params.businessName.slice(0, 160)
      : "";
  const creationCheck = await canCreateBusiness(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Add website</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">
          Start your website growth workspace
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Add the public website you want Onread to audit. You&apos;ll confirm
          the address, add useful business context, and choose your main goal
          before the first audit runs.
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
            <Globe2 className="size-5" />
          </div>
          <CardTitle>Business and website</CardTitle>
          <CardDescription>
            Onread uses this website as the source for its Website Growth Score,
            findings, and verification checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createBusiness} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business name</Label>
              <Input
                id="businessName"
                name="businessName"
                required
                autoFocus
                maxLength={160}
                defaultValue={initialBusinessName}
                placeholder="Harbor & Pine"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                type="url"
                inputMode="url"
                required
                defaultValue={initialWebsiteUrl}
                placeholder="https://harborandpine.com"
              />
              <p className="text-sm leading-6 text-muted">
                Use the public homepage you want Onread to crawl and analyze.
              </p>
            </div>

            {params.error === "missing" ? (
              <p className="text-sm font-medium text-rose-600">
                Enter both a business name and a public website URL.
              </p>
            ) : null}

            {params.error === "business_limit" ? (
              <p className="text-sm font-medium text-rose-600">
                Your current plan has reached the business workspace limit.
              </p>
            ) : null}

            {params.error === "invalid_source" ? (
              <p className="text-sm font-medium text-rose-600">
                Enter a valid public website URL, such as
                https://harborandpine.com.
              </p>
            ) : null}

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Example
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">
                  https://harborandpine.com
                </span>
              </div>
            </div>

            <SubmitButton
              pendingLabel="Creating business..."
              className={
                !creationCheck.allowed
                  ? "pointer-events-none opacity-55"
                  : undefined
              }
            >
              Continue setup
              <ArrowRight className="size-4" />
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
