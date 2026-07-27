"use server";

import { AuditStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { generateBusinessContextDraft } from "@/lib/ai/business-context-generator";
import {
  isSameBusinessWebsite,
  resolveBusinessContextWebsiteAnalysis,
} from "@/lib/ai/business-context-preanalysis";
import {
  hasCoreBusinessContext,
  normalizeContextConfidence,
} from "@/lib/business-context";
import {
  confirmedSocialProfiles,
  hasConfirmedWebsite,
} from "@/lib/audits/audit-applicability";
import { prisma } from "@/lib/prisma";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/session";

function clean(value: FormDataEntryValue | null, limit = 800) {
  return String(value ?? "")
    .trim()
    .slice(0, limit);
}

function numberFromForm(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? ""));

  return normalizeContextConfidence(Number.isNaN(parsed) ? null : parsed);
}

function contextReturnPath(
  formData: FormData,
  businessId: string,
  state: string,
) {
  return formData.get("returnTo") === "setup"
    ? `/dashboard/businesses/${businessId}/setup?step=context&${state}=1`
    : `/dashboard/businesses/${businessId}/context?${state}=1`;
}

function contextErrorPath(formData: FormData, businessId: string) {
  return formData.get("returnTo") === "setup"
    ? `/dashboard/businesses/${businessId}/setup?step=context&error=missing-core`
    : `/dashboard/businesses/${businessId}/context?error=missing-core`;
}

export async function saveBusinessContext(formData: FormData) {
  const businessId = clean(formData.get("businessId"), 120);
  const user = await requireUser(`/dashboard/businesses/${businessId}/context`);
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

  await prisma.business.update({
    where: {
      id: business.id,
    },
    data: {
      description: clean(formData.get("description"), 1000) || null,
      targetAudience: clean(formData.get("targetAudience"), 1000) || null,
      mainOffer: clean(formData.get("mainOffer"), 800) || null,
      industry: clean(formData.get("industry"), 240) || null,
      businessType: clean(formData.get("businessType"), 240) || null,
      primaryConversionGoal:
        clean(formData.get("primaryConversionGoal"), 600) || null,
      brandTone: clean(formData.get("brandTone"), 400) || null,
      contextConfidence: numberFromForm(formData.get("contextConfidence")),
      contextSource: "user_edited",
      contextConfirmedAt: null,
      contextUpdatedAt: new Date(),
    },
  });

  revalidateContextPaths(business.id);
  redirect(contextReturnPath(formData, business.id, "saved"));
}

export async function confirmBusinessContext(formData: FormData) {
  const businessId = clean(formData.get("businessId"), 120);
  const user = await requireUser(`/dashboard/businesses/${businessId}/context`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
      contextSource: true,
      description: true,
      targetAudience: true,
      mainOffer: true,
      profiles: {
        select: {
          platform: true,
          status: true,
          url: true,
          handle: true,
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  const socialFirst =
    !hasConfirmedWebsite(business.profiles) &&
    confirmedSocialProfiles(business.profiles).length > 0;

  if (socialFirst && !hasCoreBusinessContext(business)) {
    redirect(contextErrorPath(formData, business.id));
  }

  await prisma.business.update({
    where: {
      id: business.id,
    },
    data: {
      contextSource: business.contextSource ?? "manual",
      contextConfirmedAt: new Date(),
      contextUpdatedAt: new Date(),
    },
  });

  revalidateContextPaths(business.id);
  redirect(contextReturnPath(formData, business.id, "confirmed"));
}

export async function regenerateBusinessContext(formData: FormData) {
  const businessId = clean(formData.get("businessId"), 120);
  const user = await requireUser(`/dashboard/businesses/${businessId}/context`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    include: {
      profiles: {
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
      },
      audits: {
        where: {
          status: AuditStatus.COMPLETED,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          analysisSnapshot: true,
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  try {
    await enforceRateLimit({
      scope: "business-context-generation",
      identifiers: [user.id, business.id, await currentRequestRateLimitIdentifier()],
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const destination =
        formData.get("returnTo") === "setup"
          ? `/dashboard/businesses/${business.id}/setup?step=context&error=rate-limited`
          : `/dashboard/businesses/${business.id}/context?error=rate-limited`;
      redirect(destination);
    }
    throw error;
  }

  const latestAudit = business.audits.at(0);
  const savedWebsiteAnalysis = latestAudit
    ? getWebsiteAnalysis(latestAudit.analysisSnapshot)
    : null;
  const websitePreanalysis = await resolveBusinessContextWebsiteAnalysis({
    profiles: business.profiles,
    savedWebsiteAnalysis,
    businessContext: {
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      industry: business.industry,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
    },
  });
  const draft = await generateBusinessContextDraft({
    businessName: business.name,
    initialInput: business.initialInput,
    websiteAnalysis: websitePreanalysis.analysis,
    websiteCrawl:
      latestAudit &&
      savedWebsiteAnalysis &&
      websitePreanalysis.analysis &&
      isSameBusinessWebsite(
        savedWebsiteAnalysis.normalizedUrl,
        websitePreanalysis.analysis.normalizedUrl,
      )
        ? getWebsiteCrawl(latestAudit.analysisSnapshot)
        : null,
    profiles: business.profiles,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
  });

  await prisma.business.update({
    where: {
      id: business.id,
    },
    data: {
      description: draft.description,
      targetAudience: draft.targetAudience,
      mainOffer: draft.mainOffer,
      industry: draft.industry,
      businessType: draft.businessType,
      primaryConversionGoal: draft.primaryConversionGoal,
      brandTone: draft.brandTone,
      contextConfidence: draft.confidence,
      contextSource: "generated",
      contextConfirmedAt: null,
      contextUpdatedAt: new Date(),
    },
  });

  revalidateContextPaths(business.id);
  redirect(contextReturnPath(formData, business.id, "generated"));
}

function revalidateContextPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath(`/dashboard/businesses/${businessId}/context`);
  revalidatePath(`/dashboard/businesses/${businessId}/setup`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getWebsiteAnalysis(snapshot: unknown): WebsiteAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.website)) {
    return null;
  }

  const website = snapshot.website;

  if (
    typeof website.normalizedUrl !== "string" ||
    typeof website.score !== "number"
  ) {
    return null;
  }

  return website as WebsiteAnalysis;
}

function getWebsiteCrawl(snapshot: unknown): WebsiteCrawlResult | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.websiteCrawl)) {
    return null;
  }

  const crawl = snapshot.websiteCrawl;

  if (
    typeof crawl.pagesScanned !== "number" ||
    !Array.isArray(crawl.pageResults)
  ) {
    return null;
  }

  return crawl as WebsiteCrawlResult;
}
