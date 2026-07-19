import { AlertTriangle, CreditCard, Info } from "lucide-react";
import Link from "next/link";
import { PlanType } from "@prisma/client";

import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { PlanBadge } from "@/components/billing/plan-badge";
import { StripeCheckoutButton } from "@/components/billing/stripe-checkout-button";
import { UsageMeter } from "@/components/billing/usage-meter";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getUserSubscriptionSummary,
  getUsageSummary,
} from "@/lib/billing/entitlements";
import { billingProductForPlan, getBillingCatalog } from "@/lib/billing/catalog";
import { planDefinitions, planOrder } from "@/lib/billing/plans";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function BillingPage() {
  const user = await requireUser("/dashboard/billing");
  const [billing, usage] = await Promise.all([
    getUserSubscriptionSummary(user.id),
    getUsageSummary(user.id),
  ]);
  const {
    plan,
    definition,
    subscription,
    hasPaidAccess,
    hasBillingProblem,
    cancellationScheduled,
  } = billing;
  const billingCatalog = getBillingCatalog();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Billing</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">
          Plan and feature limits
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Review your current access, usage, renewal status, and secure billing
          options.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <CreditCard className="size-5" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription className="mt-2">
                  {definition.description}
                </CardDescription>
              </div>
              <PlanBadge plan={plan} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasBillingProblem ? (
              <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm leading-6">
                  Your subscription needs billing attention. Past-due access is
                  preserved temporarily, but payment details should be updated
                  in the billing portal.
                </p>
              </div>
            ) : null}
            {cancellationScheduled ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted">
                Cancellation is scheduled for the end of the current billing
                period. Access remains available until then.
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-medium text-muted">Billing status</p>
                <p className="mt-2 font-semibold">
                  {subscription?.status
                    ? subscription.status.toLowerCase().replaceAll("_", " ")
                    : "free"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-medium text-muted">Renewal</p>
                <p className="mt-2 font-semibold">
                  {plan === PlanType.ONE_TIME_AUDIT
                    ? "One-time package"
                    : subscription?.currentPeriodEnd
                    ? subscription.currentPeriodEnd.toLocaleDateString()
                    : "No active billing period"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-background p-4">
              <div className="flex max-w-xl gap-3">
                <Info className="mt-0.5 size-4 shrink-0 text-accent" />
                <p className="text-sm leading-6 text-muted">
                  Stripe securely handles payment methods, invoices, renewals,
                  and subscription cancellation. Plan access is confirmed by
                  signed Stripe events.
                </p>
              </div>
              {hasPaidAccess ? <ManageBillingButton /> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage and allowances</CardTitle>
            <CardDescription>
              Recurring-plan counters reset monthly. One-time audit implementation
              drafts count against that package&apos;s total allowance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <UsageMeter
              label="Businesses"
              used={usage.businesses.used}
              limit={usage.businesses.limit}
            />
            <UsageMeter
              label="Audits"
              used={usage.auditsThisMonth.used}
              limit={usage.auditsThisMonth.limit}
            />
            <UsageMeter
              label="AI messages"
              used={usage.aiMessagesThisMonth.used}
              limit={usage.aiMessagesThisMonth.limit}
            />
            <UsageMeter
              label="Implementation drafts"
              used={usage.implementationGenerations.used}
              limit={usage.implementationGenerations.limit}
            />
            <UsageMeter
              label="Competitor scans"
              used={usage.competitorScans.used}
              limit={usage.competitorScans.limit}
            />
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-muted">
                Crawl depth per audit
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {usage.crawlPages.limit.toLocaleString()} pages
              </p>
              <p className="mt-1 text-xs text-muted">
                Used by Website and SEO analysis.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium text-muted">
                Competitor analysis allowance
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {usage.competitorAnalysis.maxAnalyzedCompetitors} competitors
              </p>
              <p className="mt-1 text-xs text-muted">
                Up to {usage.competitorAnalysis.maxCrawlPages} public pages per
                competitor scan.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upgrade Options</CardTitle>
          <CardDescription>
            Choose a one-time report package or an ongoing monthly workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          {planOrder.map((planOption) => {
            const option = planDefinitions[planOption];
            const isCurrent = planOption === plan;
            const product = billingProductForPlan(planOption, billingCatalog);

            return (
              <div
                key={planOption}
                className={cn(
                  "rounded-lg border border-border bg-background p-4",
                  isCurrent && "border-accent",
                )}
              >
                <div className="mb-4 flex items-center justify-between gap-2">
                  <PlanBadge plan={planOption} />
                  {isCurrent ? (
                    <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="text-2xl font-semibold tracking-normal">
                  {option.price}
                </p>
                <p className="mt-1 text-xs text-muted">{option.cadence}</p>
                <p className="mt-3 min-h-16 text-sm leading-6 text-muted">
                  {option.audience}
                </p>
                {isCurrent || option.comingSoon || !product ? (
                  <Link
                    href="/pricing"
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                      className: "mt-4 w-full",
                    })}
                  >
                    View details
                  </Link>
                ) : plan === PlanType.FREE || product.purchaseType === "one_time" ? (
                  <StripeCheckoutButton
                    productKey={product.key}
                    disabled={!product.active}
                    className={buttonVariants({
                      variant: "primary",
                      size: "sm",
                    })}
                  >
                    {product.active ? option.cta : "Checkout unavailable"}
                  </StripeCheckoutButton>
                ) : (
                  <ManageBillingButton />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

    </div>
  );
}
