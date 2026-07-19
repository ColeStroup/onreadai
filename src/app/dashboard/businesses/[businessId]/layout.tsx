import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { BusinessSubNavigation } from "@/components/dashboard/business-sub-navigation";
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
    },
  });

  if (!business) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Business</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">
            {business.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {business.initialInput}
          </p>
        </div>
        <div className="w-fit rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted">
          {business.status.toLowerCase()}
        </div>
      </div>

      <BusinessSubNavigation businessId={business.id} />
      {children}
    </div>
  );
}
