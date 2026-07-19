import { CheckCircle2, Circle, GraduationCap } from "lucide-react";
import Link from "next/link";

import {
  acceptPartnerAgreementsAction,
  completePartnerModuleAction,
  submitPartnerAssessmentAction,
} from "@/app/dashboard/partner/training/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePartner } from "@/lib/partners/authorization";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import {
  partnerAssessmentQuestions,
  PARTNER_ASSESSMENT_PASSING_SCORE,
  requiredPartnerAgreementTypes,
} from "@/lib/partners/training-content";
import { ensurePartnerTrainingModules } from "@/lib/partners/training";
import { prisma } from "@/lib/prisma";

export default async function PartnerTrainingPage() {
  const { partner } = await requirePartner("/dashboard/partner/training");
  await ensurePartnerTrainingModules();
  const settings = await getPartnerProgramSettings();
  const [modules, progress, assessment, agreements] = await Promise.all([
    prisma.partnerTrainingModule.findMany({ where: { version: settings.currentTrainingVersion, isPublished: true }, orderBy: { sortOrder: "asc" } }),
    prisma.partnerTrainingProgress.findMany({ where: { partnerId: partner.id, versionCompleted: settings.currentTrainingVersion } }),
    prisma.partnerTrainingAssessment.findUnique({ where: { partnerId_trainingVersion: { partnerId: partner.id, trainingVersion: settings.currentTrainingVersion } } }),
    prisma.partnerAgreementAcceptance.findMany({
      where: {
        partnerId: partner.id,
        version: settings.currentTermsVersion,
        ...(partner.termsReacceptRequiredAt
          ? { acceptedAt: { gte: partner.termsReacceptRequiredAt } }
          : {}),
      },
    }),
  ]);
  const completedIds = new Set(progress.map((item) => item.moduleId));
  const acceptedTypes = new Set(agreements.map((item) => item.agreementType));
  const agreementComplete = requiredPartnerAgreementTypes.every((type) => acceptedTypes.has(type));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm text-muted">Certification status</p><p className="mt-1 text-xl font-semibold">{partner.status === "ACTIVE" ? "Certified Growth Partner" : "Training required"}</p><p className="mt-2 text-sm text-muted">{progress.length} of {modules.length} modules · Assessment {assessment?.passed ? "passed" : "not passed"} · Agreements {agreementComplete ? "accepted" : "pending"}</p></div>
          <GraduationCap className="size-9 text-accent" aria-hidden="true" />
        </CardContent>
      </Card>

      <div className="space-y-4">
        {modules.map((module) => {
          const complete = completedIds.has(module.id);
          const sections = Array.isArray(module.content) ? module.content.filter((item): item is string => typeof item === "string") : [];
          return (
            <Card key={module.id}>
              <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>{module.sortOrder}. {module.title}</CardTitle><p className="mt-2 text-sm text-muted">{module.description} · {module.estimatedMinutes} minutes</p></div>{complete ? <CheckCircle2 className="size-5 shrink-0 text-emerald-500" /> : <Circle className="size-5 shrink-0 text-muted" />}</CardHeader>
              <CardContent><ul className="space-y-2 text-sm leading-6 text-muted">{sections.map((section) => <li key={section} className="border-l border-border pl-4">{section}</li>)}</ul>{!complete ? <form action={completePartnerModuleAction.bind(null, module.id)} className="mt-5"><SubmitButton>Mark module complete</SubmitButton></form> : null}</CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>Certification assessment</CardTitle><p className="text-sm text-muted">Score at least {PARTNER_ASSESSMENT_PASSING_SCORE}%. Retakes are allowed.</p></CardHeader>
        <CardContent>
          <form action={submitPartnerAssessmentAction} className="space-y-6">
            {partnerAssessmentQuestions.map((question, index) => <fieldset key={question.id}><legend className="text-sm font-medium">{index + 1}. {question.prompt}</legend><div className="mt-3 space-y-2">{question.options.map((option) => <label key={option} className="flex items-center gap-3 text-sm text-muted"><input required type="radio" name={question.id} value={option} className="size-4 accent-accent" />{option}</label>)}</div></fieldset>)}
            {assessment ? <p className={`text-sm font-medium ${assessment.passed ? "text-emerald-600" : "text-amber-600"}`}>Latest score: {assessment.score}% · {assessment.attempts} attempt{assessment.attempts === 1 ? "" : "s"}</p> : null}
            <SubmitButton pendingLabel="Scoring...">Submit assessment</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current partner agreements</CardTitle><p className="text-sm text-muted">Version {settings.currentTermsVersion}. Read each draft before accepting.</p></CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm sm:grid-cols-2"><li><Link className="text-accent" href="/partners/terms" target="_blank">Partner Terms</Link></li><li><Link className="text-accent" href="/partners/commission-policy" target="_blank">Commission Policy</Link></li><li><Link className="text-accent" href="/partners/promotion-standards" target="_blank">Promotion Standards</Link></li><li><Link className="text-accent" href="/partners/scanner-policy" target="_blank">Scanner Policy</Link></li></ul>
          {agreementComplete ? <p className="mt-5 text-sm font-medium text-emerald-600">All current agreements accepted.</p> : <form action={acceptPartnerAgreementsAction} className="mt-5 space-y-4"><label className="flex items-start gap-3 text-sm leading-6 text-muted"><input name="acceptAll" type="checkbox" required className="mt-1 size-4 accent-accent" />I have read and accept all four version {settings.currentTermsVersion} partner agreements. I understand that earnings and leads are not guaranteed.</label><SubmitButton>Accept current agreements</SubmitButton></form>}
        </CardContent>
      </Card>
    </div>
  );
}
