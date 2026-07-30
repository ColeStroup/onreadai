"use server";

import { BusinessGoal } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

function isBusinessGoal(value: string): value is BusinessGoal {
  return Object.values(BusinessGoal).includes(value as BusinessGoal);
}

function uniqueGoals(values: BusinessGoal[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export async function saveBusinessGoals(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const user = await requireUser(`/dashboard/businesses/${businessId}/goals`);

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    notFound();
  }

  const selectedGoals = uniqueGoals(
    formData
      .getAll("goals")
      .map(String)
      .filter(isBusinessGoal),
  );
  const primaryGoalValue = String(formData.get("primaryGoal") ?? "");
  const primaryGoal = isBusinessGoal(primaryGoalValue) ? primaryGoalValue : null;
  const goals =
    primaryGoal && !selectedGoals.includes(primaryGoal)
      ? [...selectedGoals, primaryGoal]
      : selectedGoals;
  const returnTo = String(formData.get("returnTo") ?? "");

  await prisma.business.update({
    where: {
      id: business.id,
    },
    data: {
      goals,
      primaryGoal,
      onboardingLastStep: returnTo === "setup-next" ? "audit" : undefined,
    },
  });

  revalidatePath(`/dashboard/businesses/${business.id}`);
  revalidatePath(`/dashboard/businesses/${business.id}/goals`);
  revalidatePath(`/dashboard/businesses/${business.id}/overview`);
  revalidatePath(`/dashboard/businesses/${business.id}/chat`);
  revalidatePath(`/dashboard/businesses/${business.id}/confirm`);
  revalidatePath(`/dashboard/businesses/${business.id}/setup`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");

  if (returnTo === "setup-next") {
    redirect(`/dashboard/businesses/${business.id}/setup?step=audit`);
  }

  redirect(
    returnTo === "setup"
      ? `/dashboard/businesses/${business.id}/setup?step=goals&saved=1`
      : `/dashboard/businesses/${business.id}/goals?saved=1`,
  );
}
