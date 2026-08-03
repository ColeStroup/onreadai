import {
  BusinessProfileStatus,
  BusinessStatus,
  ProfilePlatform,
} from "@prisma/client";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { BusinessSubNavigation } from "@/components/dashboard/business-sub-navigation";
import {
  isCompetitorIntelligenceEnabled,
  isLocalGrowthEnabled,
  isSocialGrowthEnabled,
} from "@/lib/features/feature-flags";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type BusinessLayoutProps = {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
};

export default async function BusinessLayout({
  children,
  params,
}: BusinessLayoutProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
      name: true,
      initialInput: true,
      status: true,
      updatedAt: true,
      profiles: {
        where: {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { url: true },
      },
    },
  });

  if (!business) {
    notFound();
  }

  const websiteUrl = business.profiles.at(0)?.url ?? null;
  const websiteLabel = websiteUrl ? websiteHost(websiteUrl) : null;
  const statusLabels: Record<BusinessStatus, string> = {
    DRAFT: "Setup in progress",
    ACTIVE: "Active",
    ARCHIVED: "Archived",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Business</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">
            {business.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {websiteLabel ?? business.initialInput}
          </p>
        </div>
        <div className="w-fit rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted">
          {statusLabels[business.status]}
        </div>
      </div>

      <BusinessSubNavigation
        businessId={business.id}
        enabledModules={{
          social: isSocialGrowthEnabled(),
          competitors: isCompetitorIntelligenceEnabled(),
          local: isLocalGrowthEnabled(),
        }}
      />
      {children}
    </div>
  );
}

function websiteHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value;
  }
}
