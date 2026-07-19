"use server";

import { PartnerAgreementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requirePartner } from "@/lib/partners/authorization";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import {
  partnerAssessmentQuestions,
  PARTNER_ASSESSMENT_PASSING_SCORE,
  requiredPartnerAgreementTypes,
} from "@/lib/partners/training-content";
import { evaluatePartnerActivation } from "@/lib/partners/training";
import { prisma } from "@/lib/prisma";

export async function completePartnerModuleAction(moduleId: string) {
  const { partner } = await requirePartner("/dashboard/partner/training");
  const settings = await getPartnerProgramSettings();
  const trainingModule = await prisma.partnerTrainingModule.findFirst({
    where: { id: moduleId, version: settings.currentTrainingVersion, isPublished: true },
  });
  if (!trainingModule) throw new Error("Training module not found.");
  await prisma.partnerTrainingProgress.upsert({
    where: {
      partnerId_moduleId_versionCompleted: {
        partnerId: partner.id,
        moduleId: trainingModule.id,
        versionCompleted: settings.currentTrainingVersion,
      },
    },
    create: {
      partnerId: partner.id,
      moduleId: trainingModule.id,
      completedAt: new Date(),
      versionCompleted: settings.currentTrainingVersion,
    },
    update: { completedAt: new Date() },
  });
  await evaluatePartnerActivation(partner.id);
  revalidatePath("/dashboard/partner/training");
  revalidatePath("/dashboard/partner");
}

export async function submitPartnerAssessmentAction(formData: FormData) {
  const { partner } = await requirePartner("/dashboard/partner/training");
  const settings = await getPartnerProgramSettings();
  const correct = partnerAssessmentQuestions.filter(
    (question) => formData.get(question.id) === question.answer,
  ).length;
  const score = Math.round((correct / partnerAssessmentQuestions.length) * 100);
  const passed = score >= PARTNER_ASSESSMENT_PASSING_SCORE;

  await prisma.partnerTrainingAssessment.upsert({
    where: {
      partnerId_trainingVersion: {
        partnerId: partner.id,
        trainingVersion: settings.currentTrainingVersion,
      },
    },
    create: {
      partnerId: partner.id,
      trainingVersion: settings.currentTrainingVersion,
      score,
      passed,
      attempts: 1,
    },
    update: {
      score,
      passed,
      attempts: { increment: 1 },
      submittedAt: new Date(),
    },
  });
  await evaluatePartnerActivation(partner.id);
  revalidatePath("/dashboard/partner/training");
  revalidatePath("/dashboard/partner");
}

export async function acceptPartnerAgreementsAction(formData: FormData) {
  const { partner } = await requirePartner("/dashboard/partner/training");
  if (formData.get("acceptAll") !== "on") throw new Error("Agreement confirmation is required.");
  const settings = await getPartnerProgramSettings();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 240) || null;

  const acceptedAt = new Date();
  await prisma.$transaction(
    requiredPartnerAgreementTypes.map((agreementType) =>
      prisma.partnerAgreementAcceptance.upsert({
        where: {
          partnerId_agreementType_version: {
            partnerId: partner.id,
            agreementType: agreementType as PartnerAgreementType,
            version: settings.currentTermsVersion,
          },
        },
        create: {
          partnerId: partner.id,
          agreementType: agreementType as PartnerAgreementType,
          version: settings.currentTermsVersion,
          acceptedAt,
          userAgentSummary: userAgent,
        },
        update: { acceptedAt, userAgentSummary: userAgent },
      }),
    ),
  );
  await evaluatePartnerActivation(partner.id);
  revalidatePath("/dashboard/partner/training");
  revalidatePath("/dashboard/partner");
}
