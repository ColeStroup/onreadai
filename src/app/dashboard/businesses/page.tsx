import { Building2, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { deriveBusinessSetupProgress } from "@/lib/onboarding/business-setup";
import { requireUser } from "@/lib/session";

export default async function BusinessesPage() {
  const user = await requireUser("/dashboard/businesses");
  const businesses = await prisma.business.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      profiles: {
        select: { status: true, platform: true, url: true, handle: true },
      },
      googleBusinessProfiles: {
        select: { status: true },
      },
      audits: {
        where: { status: "COMPLETED" },
        select: { status: true },
      },
      _count: {
        select: {
          audits: true,
          competitors: true,
          profiles: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Businesses</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            Business profiles
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Each business gets its own profiles, audits, recommendations, and
            chat history.
          </p>
        </div>
        <Link
          href="/dashboard/businesses/new"
          className={buttonVariants({ variant: "primary" })}
        >
          <Plus className="size-4" />
          Add Business
        </Link>
      </div>

      {businesses.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No business profiles"
          description="Start with a single smart input. Discovery and confirmation can be layered in next."
          action={
            <Link
              href="/dashboard/businesses/new"
              className={buttonVariants({ variant: "primary" })}
            >
              <Plus className="size-4" />
              Add Business
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {businesses.map((business) => {
            const setup = deriveBusinessSetupProgress(business);
            const href = setup.auditComplete
              ? `/dashboard/businesses/${business.id}/overview`
              : `/dashboard/businesses/${business.id}/setup`;

            return (
              <Link key={business.id} href={href}>
                <Card className="h-full transition-colors hover:border-accent">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle>{business.name}</CardTitle>
                      <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted">
                        {setup.listStatus}
                      </span>
                    </div>
                    <CardDescription>{business.initialInput}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-lg bg-background p-3">
                      <p className="font-semibold">{business._count.profiles}</p>
                      <p className="text-xs text-muted">Profiles</p>
                    </div>
                    <div className="rounded-lg bg-background p-3">
                      <p className="font-semibold">{business._count.audits}</p>
                      <p className="text-xs text-muted">Audits</p>
                    </div>
                    <div className="rounded-lg bg-background p-3">
                      <p className="font-semibold">
                        {business._count.competitors}
                      </p>
                      <p className="text-xs text-muted">Competitors</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
