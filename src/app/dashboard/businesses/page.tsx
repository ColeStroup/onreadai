import { Building2, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIntro } from "@/components/dashboard/report-ui";
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
      audits: {
        where: { status: "COMPLETED" },
        select: { status: true },
      },
      _count: {
        select: {
          audits: true,
          profiles: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageIntro
        eyebrow="Businesses"
        title="Website audit workspaces"
        description="Each workspace keeps its own website evidence, audits, Action Plan, Consultant history, and verified progress."
        icon={Building2}
        actions={
          <Link
            href="/dashboard/businesses/new"
            className={buttonVariants({ variant: "primary" })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add business
          </Link>
        }
      />

      {businesses.length === 0 ? (
        <EmptyState
          compact
          icon={<Building2 className="size-6" />}
          title="No business websites"
          description="Add a business name and public website URL, confirm the source, and run your first audit."
          action={
            <Link
              href="/dashboard/businesses/new"
              className={buttonVariants({ variant: "primary" })}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add business
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
                  <CardContent className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
                    <span>
                      {business._count.profiles} saved source
                      {business._count.profiles === 1 ? "" : "s"}
                    </span>
                    <span>{business._count.audits} audits</span>
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
