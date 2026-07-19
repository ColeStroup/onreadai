"use server";

import { RecommendationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type RecommendationStatusInput = {
  businessId: string;
  recommendationId: string;
};

type RecommendationActionResult = {
  ok: boolean;
  error?: string;
};

export async function updateRecommendationStatus({
  businessId,
  recommendationId,
  status,
}: RecommendationStatusInput & {
  status: RecommendationStatus;
}): Promise<RecommendationActionResult> {
  const user = await requireUser(
    `/dashboard/businesses/${businessId}/action-plan`,
  );

  const recommendation = await prisma.recommendation.findFirst({
    where: {
      id: recommendationId,
      businessId,
      business: {
        ownerId: user.id,
      },
    },
    select: {
      id: true,
      auditId: true,
    },
  });

  if (!recommendation) {
    return {
      ok: false,
      error: "Recommendation was not found.",
    };
  }

  await prisma.recommendation.update({
    where: {
      id: recommendation.id,
    },
    data: {
      status,
      completedAt:
        status === RecommendationStatus.COMPLETED ? new Date() : null,
    },
  });

  revalidateRecommendationPaths({
    businessId,
    auditId: recommendation.auditId,
  });

  return {
    ok: true,
  };
}

export async function markRecommendationTodo(input: RecommendationStatusInput) {
  return updateRecommendationStatus({
    ...input,
    status: RecommendationStatus.TODO,
  });
}

export async function markRecommendationInProgress(
  input: RecommendationStatusInput,
) {
  return updateRecommendationStatus({
    ...input,
    status: RecommendationStatus.IN_PROGRESS,
  });
}

export async function markRecommendationCompleted(
  input: RecommendationStatusInput,
) {
  return updateRecommendationStatus({
    ...input,
    status: RecommendationStatus.COMPLETED,
  });
}

export async function markRecommendationDismissed(
  input: RecommendationStatusInput,
) {
  return updateRecommendationStatus({
    ...input,
    status: RecommendationStatus.DISMISSED,
  });
}

function revalidateRecommendationPaths({
  businessId,
  auditId,
}: {
  businessId: string;
  auditId: string | null;
}) {
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/action-plan`);
  revalidatePath(`/dashboard/businesses/${businessId}/history`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);

  if (auditId) {
    revalidatePath(
      `/dashboard/businesses/${businessId}/audit/${auditId}/present`,
    );
  }
}
