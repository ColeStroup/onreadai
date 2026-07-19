import { CheckCircle2, Clock3 } from "lucide-react";
import Link from "next/link";

import { BillingConfirmationRefresh } from "@/components/billing/billing-confirmation-refresh";
import { PlanBadge } from "@/components/billing/plan-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getUserSubscriptionSummary } from "@/lib/billing/entitlements";
import { billingConfirmationFromPersistedState } from "@/lib/billing/confirmation";
import { requireUser } from "@/lib/session";

export default async function BillingSuccessPage() {
  const user = await requireUser("/dashboard/billing/success");
  const billing = await getUserSubscriptionSummary(user.id);
  const confirmed =
    billingConfirmationFromPersistedState(billing) === "confirmed";

  return (
    <div className="mx-auto max-w-2xl py-8">
      <BillingConfirmationRefresh pending={!confirmed} />
      <Card>
        <CardHeader>
          <div className={`mb-3 flex size-12 items-center justify-center rounded-lg ${confirmed ? "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"}`}>
            {confirmed ? <CheckCircle2 className="size-6" /> : <Clock3 className="size-6" />}
          </div>
          <CardTitle>
            {confirmed ? "Billing confirmed" : "Confirming your payment"}
          </CardTitle>
          <CardDescription>
            {confirmed
              ? "Stripe confirmed the purchase and your plan access is active."
              : "Checkout finished successfully. We are waiting for Stripe's signed confirmation before activating access."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {confirmed ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4">
              <div>
                <p className="text-sm text-muted">Current plan</p>
                <p className="mt-1 font-semibold">{billing.definition.name}</p>
              </div>
              <PlanBadge plan={billing.plan} />
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted">
              This page does not activate a plan from the checkout URL. It will
              refresh briefly while the webhook updates your account.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/billing" className={buttonVariants()}>
              View billing
            </Link>
            <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
              Return to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
