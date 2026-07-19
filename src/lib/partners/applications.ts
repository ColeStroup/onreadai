import "server-only";

import { randomBytes } from "node:crypto";

import {
  PartnerApplicationStatus,
  PartnerStatus,
  PartnerTier,
  UserRole,
  type Prisma,
} from "@prisma/client";

import { assertAdminUser } from "@/lib/partners/admin-authorization";
import {
  validatePartnerApplication,
  type PartnerApplicationInput,
} from "@/lib/partners/application-validation";
import {
  getPartnerProgramSettings,
  settingsCountries,
} from "@/lib/partners/config";
import { PartnerProgramError } from "@/lib/partners/errors";
import { createPartnerNotification } from "@/lib/partners/notifications";
import { normalizeReferralCode } from "@/lib/partners/referral-policy";
import { prisma } from "@/lib/prisma";

export async function submitPartnerApplication(
  userId: string,
  rawInput: PartnerApplicationInput,
) {
  const settings = await getPartnerProgramSettings();
  if (!settings.enabled || !settings.applicationsOpen) {
    throw new PartnerProgramError(
      "Partner applications are currently closed.",
      "APPLICATIONS_CLOSED",
      403,
    );
  }

  const input = validatePartnerApplication(rawInput);
  if (!settingsCountries(settings).includes(input.country)) {
    throw new PartnerProgramError(
      "Applications are not currently available in that country.",
      "COUNTRY_NOT_APPROVED",
      403,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, partnerProfile: { select: { id: true } } },
  });
  if (!user) throw new PartnerProgramError("Account not found.", "USER_NOT_FOUND", 404);
  if (user.partnerProfile) {
    throw new PartnerProgramError("This account already has a partner profile.", "PARTNER_EXISTS", 409);
  }

  const application = await prisma.partnerApplication.create({
    data: {
      userId,
      activeApplicationKey: userId,
      ...input,
      socialProfiles: input.socialProfiles as Prisma.InputJsonValue,
      intendedPromotionMethods:
        input.intendedPromotionMethods as Prisma.InputJsonValue,
    },
  }).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new PartnerProgramError(
        "You already have an application under review.",
        "ACTIVE_APPLICATION_EXISTS",
        409,
      );
    }
    throw error;
  });

  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN },
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin) =>
      createPartnerNotification({
        userId: admin.id,
        type: "PARTNER_APPLICATION_RECEIVED",
        title: "New partner application",
        message: `${input.displayName} submitted a Partner Program application.`,
      }),
    ),
  );

  return application;
}

async function uniqueReferralCode(displayName: string) {
  const base = normalizeReferralCode(displayName).slice(0, 22) || "partner";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${base}-${randomBytes(4).toString("hex")}`;
    const existing = await prisma.partnerProfile.findUnique({
      where: { normalizedReferralCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  throw new PartnerProgramError(
    "A unique referral code could not be generated.",
    "REFERRAL_CODE_FAILED",
    500,
  );
}

export async function reviewPartnerApplication(input: {
  adminUserId: string;
  applicationId: string;
  decision: "APPROVE" | "REJECT" | "WAITLIST";
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = input.reason.trim().slice(0, 2_000);
  if (reason.length < 3) {
    throw new PartnerProgramError("A review reason is required.", "REASON_REQUIRED");
  }

  const application = await prisma.partnerApplication.findUnique({
    where: { id: input.applicationId },
  });
  if (!application) {
    throw new PartnerProgramError("Application not found.", "APPLICATION_NOT_FOUND", 404);
  }
  if (application.status !== PartnerApplicationStatus.PENDING && application.status !== PartnerApplicationStatus.WAITLISTED) {
    throw new PartnerProgramError("This application has already been decided.", "APPLICATION_DECIDED", 409);
  }

  const settings = await getPartnerProgramSettings();
  const now = new Date();
  let partnerId: string | null = null;

  if (input.decision === "APPROVE") {
    if (!settingsCountries(settings).includes(application.country)) {
      throw new PartnerProgramError("The applicant country is not approved.", "COUNTRY_NOT_APPROVED", 409);
    }
    const referralCode = await uniqueReferralCode(application.displayName);

    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.partnerApplication.findUnique({
        where: { id: application.id },
      });
      if (
        !current ||
        (current.status !== PartnerApplicationStatus.PENDING &&
          current.status !== PartnerApplicationStatus.WAITLISTED)
      ) {
        throw new PartnerProgramError("This application has already been decided.", "APPLICATION_DECIDED", 409);
      }

      const partner = await transaction.partnerProfile.create({
        data: {
          userId: application.userId,
          applicationId: application.id,
          status: PartnerStatus.PENDING_TRAINING,
          tier: PartnerTier.CERTIFIED,
          referralCode,
          normalizedReferralCode: normalizeReferralCode(referralCode),
          commissionRateBps: settings.defaultCommissionRateBps,
          recurringCommissionMonths: settings.defaultRecurringCommissionMonths,
          referralWindowDays: settings.defaultReferralWindowDays,
          commissionHoldDays: settings.defaultCommissionHoldDays,
          minimumPayoutCents: settings.defaultMinimumPayoutCents,
          allowedCountry: application.country,
          approvedAt: now,
          scannerDailyLimit: settings.defaultScannerDailyLimit,
          scannerMonthlyLimit: settings.defaultScannerMonthlyLimit,
          scannerEnabled: false,
          referralEnabled: false,
        },
      });
      await transaction.partnerApplication.update({
        where: { id: application.id },
        data: {
          status: PartnerApplicationStatus.APPROVED,
          activeApplicationKey: null,
          reviewedAt: now,
          reviewedByUserId: input.adminUserId,
          reviewNotes: reason,
        },
      });
      await transaction.partnerAdminAuditLog.create({
        data: {
          adminUserId: input.adminUserId,
          partnerId: partner.id,
          action: "APPLICATION_APPROVED",
          entityType: "PartnerApplication",
          entityId: application.id,
          beforeState: { status: application.status },
          afterState: { status: PartnerApplicationStatus.APPROVED },
          reason,
        },
      });
      return partner;
    });
    partnerId = result.id;
    await createPartnerNotification({
      userId: application.userId,
      partnerId,
      type: "PARTNER_APPLICATION_APPROVED",
      title: "Application approved",
      message:
        "Your application was approved. Complete training, pass the assessment, and accept the current agreements to activate your referral link.",
    });
  } else {
    const status =
      input.decision === "REJECT"
        ? PartnerApplicationStatus.REJECTED
        : PartnerApplicationStatus.WAITLISTED;
    await prisma.$transaction([
      prisma.partnerApplication.update({
        where: { id: application.id },
        data: {
          status,
          activeApplicationKey:
            status === PartnerApplicationStatus.WAITLISTED
              ? application.userId
              : null,
          reviewedAt: now,
          reviewedByUserId: input.adminUserId,
          reviewNotes: reason,
          rejectionReason:
            status === PartnerApplicationStatus.REJECTED ? reason : null,
        },
      }),
      prisma.partnerAdminAuditLog.create({
        data: {
          adminUserId: input.adminUserId,
          action:
            status === PartnerApplicationStatus.REJECTED
              ? "APPLICATION_REJECTED"
              : "APPLICATION_WAITLISTED",
          entityType: "PartnerApplication",
          entityId: application.id,
          beforeState: { status: application.status },
          afterState: { status },
          reason,
        },
      }),
    ]);
    await createPartnerNotification({
      userId: application.userId,
      type: `PARTNER_APPLICATION_${status}`,
      title: status === PartnerApplicationStatus.REJECTED ? "Application decision" : "Application waitlisted",
      message:
        status === PartnerApplicationStatus.REJECTED
          ? "Your Partner Program application was not approved at this time. Review the application status for the decision note."
          : "Your Partner Program application is on the waitlist and remains under consideration.",
    });
  }

  return { status: input.decision, partnerId };
}

export async function withdrawPartnerApplication(userId: string, applicationId: string) {
  const result = await prisma.partnerApplication.updateMany({
    where: {
      id: applicationId,
      userId,
      status: { in: [PartnerApplicationStatus.PENDING, PartnerApplicationStatus.WAITLISTED] },
    },
    data: {
      status: PartnerApplicationStatus.WITHDRAWN,
      activeApplicationKey: null,
    },
  });

  if (result.count !== 1) {
    throw new PartnerProgramError("This application cannot be withdrawn.", "WITHDRAW_NOT_ALLOWED", 409);
  }
}
