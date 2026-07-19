import "server-only";

import {
  PartnerAgreementType,
  PartnerStatus,
  type Prisma,
} from "@prisma/client";

import { getPartnerProgramSettings } from "@/lib/partners/config";
import { createPartnerNotification } from "@/lib/partners/notifications";
import {
  partnerTrainingModules,
  requiredPartnerAgreementTypes,
} from "@/lib/partners/training-content";
import { prisma } from "@/lib/prisma";

export async function ensurePartnerTrainingModules() {
  const settings = await getPartnerProgramSettings();

  await prisma.$transaction(
    partnerTrainingModules.map((module, index) =>
      prisma.partnerTrainingModule.upsert({
        where: {
          slug_version: {
            slug: module.slug,
            version: settings.currentTrainingVersion,
          },
        },
        create: {
          slug: module.slug,
          title: module.title,
          description: module.description,
          sortOrder: index + 1,
          version: settings.currentTrainingVersion,
          content: module.sections as unknown as Prisma.InputJsonValue,
          estimatedMinutes: module.estimatedMinutes,
        },
        update: {
          title: module.title,
          description: module.description,
          sortOrder: index + 1,
          content: module.sections as unknown as Prisma.InputJsonValue,
          estimatedMinutes: module.estimatedMinutes,
          isPublished: true,
          isRequired: true,
        },
      }),
    ),
  );

  return settings.currentTrainingVersion;
}

export async function evaluatePartnerActivation(partnerId: string) {
  const settings = await getPartnerProgramSettings();
  const partner = await prisma.partnerProfile.findUnique({ where: { id: partnerId } });
  if (!partner || partner.status !== PartnerStatus.PENDING_TRAINING) {
    return { activated: false, reason: "not_pending_training" };
  }

  const [requiredModules, progress, assessment, agreements] =
    await Promise.all([
      prisma.partnerTrainingModule.count({
        where: {
          version: settings.currentTrainingVersion,
          isRequired: true,
          isPublished: true,
        },
      }),
      prisma.partnerTrainingProgress.count({
        where: {
          partnerId,
          versionCompleted: settings.currentTrainingVersion,
          module: { isRequired: true, isPublished: true },
        },
      }),
      prisma.partnerTrainingAssessment.findUnique({
        where: {
          partnerId_trainingVersion: {
            partnerId,
            trainingVersion: settings.currentTrainingVersion,
          },
        },
      }),
      prisma.partnerAgreementAcceptance.findMany({
        where: {
          partnerId,
          version: settings.currentTermsVersion,
          ...(partner?.termsReacceptRequiredAt
            ? { acceptedAt: { gte: partner.termsReacceptRequiredAt } }
            : {}),
          agreementType: {
            in: [...requiredPartnerAgreementTypes] as PartnerAgreementType[],
          },
        },
        select: { agreementType: true },
      }),
    ]);

  const accepted = new Set(agreements.map((item) => item.agreementType));
  const agreementsComplete = requiredPartnerAgreementTypes.every((type) =>
    accepted.has(type as PartnerAgreementType),
  );
  const ready =
    requiredModules > 0 &&
    progress >= requiredModules &&
    assessment?.passed === true &&
    agreementsComplete;

  if (!ready) {
    return {
      activated: false,
      reason: "requirements_incomplete",
      requiredModules,
      completedModules: progress,
      assessmentPassed: assessment?.passed ?? false,
      agreementsComplete,
    };
  }

  const now = new Date();
  const activated = await prisma.partnerProfile.updateMany({
    where: { id: partnerId, status: PartnerStatus.PENDING_TRAINING },
    data: {
      status: PartnerStatus.ACTIVE,
      activatedAt: now,
      trainingCompletedAt: now,
      certificationIssuedAt: now,
      currentTermsVersion: settings.currentTermsVersion,
      termsAcceptedAt: now,
      termsReacceptRequiredAt: null,
      referralEnabled: true,
      scannerEnabled: settings.scannerEnabled,
    },
  });

  if (activated.count === 1) {
    await createPartnerNotification({
      userId: partner.userId,
      partnerId,
      type: "PARTNER_ACTIVATED",
      title: "Certification complete",
      message:
        "Your Certified Growth Partner referral link is now active. Keep all promotions evidence-based and clearly disclosed.",
    });
  }

  return { activated: activated.count === 1, reason: "complete" };
}
