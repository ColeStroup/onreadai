"use server";

import { AuditStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  isBusinessSetupStep,
  type BusinessSetupStep,
} from "@/lib/onboarding/business-setup";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

async function requireOwnedBusiness(businessId: string) {
  const user = await requireUser(`/dashboard/businesses/${businessId}/setup`);
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    select: {
      id: true,
      audits: {
        where: { status: AuditStatus.COMPLETED },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!business) notFound();

  return business;
}

function cleanStep(value: FormDataEntryValue | null): BusinessSetupStep {
  const step = String(value ?? "");
  return isBusinessSetupStep(step) ? step : "profiles";
}

function revalidateSetupPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/setup`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");
}

export async function goToBusinessSetupStep(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const step = cleanStep(formData.get("step"));
  const business = await requireOwnedBusiness(businessId);

  await prisma.business.update({
    where: { id: business.id },
    data: {
      onboardingLastStep: step,
      onboardingDismissedAt: null,
    },
  });

  revalidateSetupPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/setup?step=${step}`);
}

export async function dismissBusinessSetup(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const step = cleanStep(formData.get("step"));
  const business = await requireOwnedBusiness(businessId);

  await prisma.business.update({
    where: { id: business.id },
    data: {
      onboardingDismissedAt: new Date(),
      onboardingLastStep: step,
    },
  });

  revalidateSetupPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/overview`);
}

export async function resumeBusinessSetup(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const business = await requireOwnedBusiness(businessId);

  await prisma.business.update({
    where: { id: business.id },
    data: { onboardingDismissedAt: null },
  });

  revalidateSetupPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/setup`);
}

export async function completeBusinessSetup(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const destination = String(formData.get("destination") ?? "overview");
  const business = await requireOwnedBusiness(businessId);

  if (business.audits.length === 0) {
    redirect(`/dashboard/businesses/${business.id}/setup?step=audit`);
  }

  await prisma.business.update({
    where: { id: business.id },
    data: {
      onboardingCompletedAt: new Date(),
      onboardingDismissedAt: null,
      onboardingLastStep: "results",
    },
  });

  revalidateSetupPaths(business.id);

  const allowedDestinations: Record<string, string> = {
    overview: `/dashboard/businesses/${business.id}/overview`,
    "action-plan": `/dashboard/businesses/${business.id}/action-plan`,
    chat: `/dashboard/businesses/${business.id}/chat`,
  };

  redirect(allowedDestinations[destination] ?? allowedDestinations.overview);
}
