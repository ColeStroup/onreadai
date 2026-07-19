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

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const businesses = await prisma.business.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 3,
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
          profiles: true,
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            Growth workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Track businesses, audits, recommendations, and AI strategy chats
            from one place.
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
          title="No businesses yet"
          description="Add a website, social profile, or business name to create your first audit workspace."
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
        <div className="grid gap-4 md:grid-cols-3">
          {businesses.map((business) => {
            const setup = deriveBusinessSetupProgress(business);
            return (
              <Link
                key={business.id}
                href={
                  setup.auditComplete
                    ? `/dashboard/businesses/${business.id}/overview`
                    : `/dashboard/businesses/${business.id}/setup`
                }
              >
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
                  <CardContent className="flex items-center justify-between text-sm text-muted">
                    <span>{business._count.profiles} profiles</span>
                    <span>{business._count.audits} audits</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          ["Audit Pipeline", "No audit runs yet."],
          ["Saved Recommendations", "Prioritized actions across businesses."],
          ["AI Chat", "Strategy threads for each business."],
        ].map(([title, description]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
