import { Check, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanType } from "@prisma/client";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { StripeCheckoutButton } from "@/components/billing/stripe-checkout-button";
import { createMarketingMetadata } from "@/lib/brand";
import {
  billingProductForPlan,
  getBillingCatalog,
} from "@/lib/billing/catalog";
import { planDefinitions, planOrder } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createMarketingMetadata({
  title: "Website and SEO Audit Pricing | Onread AI",
  description:
    "Compare free, one-time, and recurring plans for website and SEO audits, prioritized Action Plans, implementation help, and progress verification.",
  pathname: "/pricing",
});

type PricingPageProps = {
  searchParams?: Promise<{ checkout?: string }>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const query = searchParams ? await searchParams : {};
  const billingCatalog = getBillingCatalog();

  return (
    <MarketingShell>
      <main>
        <header className="border-b border-white/10 bg-[#081213]">
          <div className="mx-auto w-full max-w-7xl px-6 py-16 sm:py-20 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
              Pricing
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Plans for one website audit, ongoing improvement, and client
              delivery.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Start with one free website workspace, purchase a complete report,
              or choose an ongoing plan for repeat audits and verification.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-300 px-5 font-semibold text-[#052b27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Run a Website Audit
              </Link>
              <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                <Info className="size-4 text-teal-300" aria-hidden="true" />
                No credit card required for the free plan.
              </span>
            </div>
          </div>
        </header>

        <section
          aria-labelledby="plans-heading"
          className="bg-[#0a1415] py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2 id="plans-heading" className="sr-only">
              Available and planned packages
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {planOrder.map((plan) => {
                const definition = planDefinitions[plan];
                const featured =
                  plan === PlanType.ONE_TIME_AUDIT || plan === PlanType.PRO;
                const isFree = plan === PlanType.FREE;
                const billingProduct = billingProductForPlan(
                  plan,
                  billingCatalog,
                );

                return (
                  <article
                    key={plan}
                    className={cn(
                      "flex flex-col rounded-lg border bg-[#0d1718] p-6",
                      featured ? "border-teal-300/40" : "border-white/10",
                    )}
                  >
                    <div className="flex min-h-7 items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
                        {definition.name}
                      </p>
                      {definition.badge ? (
                        <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400">
                          {definition.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-5">
                      <span className="text-4xl font-semibold text-white">
                        {definition.price}
                      </span>
                      <span className="ml-2 text-sm text-slate-400">
                        {definition.cadence}
                      </span>
                    </div>
                    <p className="mt-4 min-h-12 text-sm leading-6 text-slate-400">
                      {definition.audience}
                    </p>

                    <div className="mt-6 border-t border-white/10 pt-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Includes
                      </p>
                      <ul className="mt-4 space-y-2.5">
                        {definition.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex gap-2.5 text-sm leading-5 text-slate-300"
                          >
                            <Check
                              className="mt-0.5 size-4 shrink-0 text-teal-300"
                              aria-hidden="true"
                            />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6 border-t border-white/10 pt-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Current limits
                      </p>
                      <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                        {definition.limitations.map((limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ))}
                      </ul>
                    </div>

                    {isFree ? (
                      <Link
                        href="/signup"
                        className="mt-7 inline-flex h-11 items-center justify-center rounded-lg bg-teal-300 px-4 font-semibold text-[#052b27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        Start Free
                      </Link>
                    ) : definition.comingSoon || !billingProduct ? (
                      <span
                        aria-disabled="true"
                        className="mt-7 inline-flex h-11 cursor-not-allowed items-center justify-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-slate-400"
                      >
                        {definition.cta}
                      </span>
                    ) : (
                      <>
                        <StripeCheckoutButton
                          productKey={billingProduct.key}
                          disabled={!billingProduct.active}
                          autoStart={query.checkout === billingProduct.key}
                          className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-300 px-4 font-semibold text-[#052b27] transition-colors hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          {definition.cta}
                        </StripeCheckoutButton>
                        {!billingProduct.active &&
                        process.env.NODE_ENV !== "production" ? (
                          <p className="mt-2 text-xs leading-5 text-amber-200">
                            Add this plan&apos;s Stripe Price ID to your local
                            environment to enable test checkout.
                          </p>
                        ) : null}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
            <p className="mt-8 text-sm leading-6 text-slate-400">
              Checkout and billing management are handled securely by Stripe.
              Plans activate after verified payment confirmation.
            </p>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
