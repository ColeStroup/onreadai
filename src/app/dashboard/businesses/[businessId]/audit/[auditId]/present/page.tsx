import { PlanType } from "@prisma/client";
import { notFound } from "next/navigation";

import { PresentationDeck } from "@/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-deck";
import { LockedFeature } from "@/components/billing/locked-feature";
import { canUsePresentationMode } from "@/lib/billing/entitlements";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import { buildPresentationViewModel } from "@/lib/reports/presentation-view-model";
import { requireUser } from "@/lib/session";

type PresentationPageProps = {
  params: Promise<{
    businessId: string;
    auditId: string;
  }>;
};

export default async function AuditPresentationPage({
  params,
}: PresentationPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId, auditId } = await params;
  const report = await buildAuditReportViewModel({
    businessId,
    auditId,
    ownerId: user.id,
  });

  if (!report) notFound();

  const presentationCheck = await canUsePresentationMode(user.id);
  if (!presentationCheck.allowed) {
    return (
      <div className="mx-auto max-w-3xl">
        <LockedFeature
          title="Presentation Mode is locked"
          description="Turn a completed audit into full-screen client-ready slides for review calls, internal planning, or sales conversations."
          requiredPlan={PlanType.ONE_TIME_AUDIT}
          preview={[
            "Cover slide with score and audit date",
            "Executive summary and score breakdown",
            "Top priorities and 30-day action plan",
          ]}
        />
      </div>
    );
  }

  return <PresentationDeck data={buildPresentationViewModel(report)} />;
}
