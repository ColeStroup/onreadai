import { AlertTriangle, CreditCard, Info } from "lucide-react";
import Link from "next/link";
import { PlanType } from "@prisma/client";

import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { PlanBadge } from "@/components/billing/plan-badge";
import { StripeCheckoutButton } from "@/components/billing/stripe-checkout-button";
import { UsageMeter } from "@/components/billing/usage-meter";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { PageIntro } from "@/components/dashboard/report-ui";
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
import { buildBillingAccessDisplay } from "@/lib/billing/billing-access-display";
import { billingProductForPlan, getBillingCatalog } from "@/lib/billing/catalog";
import {
  planDefinitions,
  planLabels,
  planOrder,
} from "@/lib/billing/plans";
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
    hasBillingProblem,
    cancellationScheduled,
    paidPlan,
    complimentaryPlan,
    complimentaryEntitlement,
    entitlementSource,
    latestStripeSubscription,
    hasActiveStripeSubscription,
  } = billing;
  const billingCatalog = getBillingCatalog();
  const accessDisplay = buildBillingAccessDisplay({
    effectivePlan: plan,
    paidPlan,
    complimentaryPlan,
    source: entitlementSource,
    complimentaryExpiresAt: complimentaryEntitlement?.expiresAt ?? null,
    hasActiveStripeSubscription,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageIntro
        eyebrow="Billing"
        title="Plan and feature limits"
        description="Review your effective plan, paid or complimentary access, current usage, and verified billing actions."
        icon={CreditCard}
        actions={
          accessDisplay.showCustomerPortal ? (
            <ManageBillingButton variant="primary" />
          ) : (
            <a
              href="#upgrade-options"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Compare plans
            </a>
          )
        }
      />

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
                <p className="text-sm font-medium text-muted">Access source</p>
                <p className="mt-2 font-semibold">
                  {accessDisplay.accessSourceLabel}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-medium text-muted">Renewal</p>
                <p className="mt-2 font-semibold">
                  {entitlementSource === "COMPLIMENTARY"
                    ? accessDisplay.complimentaryExpiration
                    : plan === PlanType.ONE_TIME_AUDIT
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
                  {accessDisplay.complimentaryMessage ??
                    "Stripe securely handles payment methods, invoices, renewals, and subscription cancellation. Plan access is confirmed by signed Stripe events."}
                </p>
              </div>
            </div>
            {complimentaryPlan && complimentaryEntitlement ? (
              <div className="rounded-lg border border-teal-300/60 bg-teal-50 p-4 dark:border-teal-900 dark:bg-teal-950/25">
                <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
                  Complimentary access
                </p>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-teal-800/70 dark:text-teal-200/70">
                      Granted plan
                    </p>
                    <p className="mt-1 font-semibold">
                      {planLabels[complimentaryPlan]}
                    </p>
                  </div>
                  <div>
                    <p className="text-teal-800/70 dark:text-teal-200/70">
                      Expiration
                    </p>
                    <p className="mt-1 font-semibold">
                      {accessDisplay.complimentaryExpiration}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-teal-900/80 dark:text-teal-100/80">
                  This access was granted by Onread and is not billed through
                  Stripe.
                </p>
              </div>
            ) : null}
            {latestStripeSubscription ? (
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-semibold">Paid subscription</p>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted">Stripe plan</p>
                    <p className="mt-1 font-semibold">
                      {planLabels[latestStripeSubscription.plan]}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Stripe status</p>
                    <p className="mt-1 font-semibold">
                      {latestStripeSubscription.status
                        .toLowerCase()
                        .replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted">Current billing period ends</p>
                    <p className="mt-1 font-semibold">
                      {latestStripeSubscription.currentPeriodEnd
                        ? latestStripeSubscription.currentPeriodEnd.toLocaleDateString()
                        : "Not available"}
                    </p>
                  </div>
                </div>
                {complimentaryPlan ? (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Your paid subscription remains separate from complimentary
                    access and keeps its normal Stripe billing obligations.
                  </p>
                ) : null}
              </div>
            ) : null}
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

      <section id="upgrade-options">
        <DisclosureSection
          title="Compare plans"
          description="Choose a one-time report package or an ongoing monthly workspace."
        >
          <div className="grid gap-4 lg:grid-cols-5">
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
                ) : !hasActiveStripeSubscription ||
                  product.purchaseType === "one_time" ? (
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
          </div>
        </DisclosureSection>
      </section>

    </div>
  );
}
