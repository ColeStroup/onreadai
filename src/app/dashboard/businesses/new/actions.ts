"use server";

import {
  BusinessInputType,
  BusinessProfileSource,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canCreateBusiness } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/observability/log";
import { requireUser } from "@/lib/session";
import {
  normalizeProfileUrlSyntax,
  ProfileUrlError,
  profileUrlComparisonKey,
} from "@/lib/profiles/profile-url";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export async function createBusiness(formData: FormData) {
  const user = await requireUser("/dashboard/businesses/new");
  try {
    await enforceRateLimit({
      scope: "business-create",
      identifiers: [user.id, await currentRequestRateLimitIdentifier()],
      limit: 10,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect("/dashboard/businesses/new?error=rate_limited");
    }
    throw error;
  }
  const creationCheck = await canCreateBusiness(user.id);

  if (!creationCheck.allowed) {
    redirect("/dashboard/businesses/new?error=business_limit");
  }

  const businessName = String(formData.get("businessName") ?? "").trim();
  const rawInput = String(formData.get("websiteUrl") ?? "").trim();

  if (businessName.length < 2 || rawInput.length < 4) {
    redirect("/dashboard/businesses/new?error=missing");
  }

  let websiteUrl: string;
  let normalizedUrl: string;
  try {
    const normalized = normalizeProfileUrlSyntax(
      rawInput,
      ProfilePlatform.WEBSITE,
    );
    websiteUrl = normalized.url;
    normalizedUrl =
      profileUrlComparisonKey(normalized.url, ProfilePlatform.WEBSITE) ??
      normalized.normalizedUrl;
  } catch (error) {
    if (error instanceof ProfileUrlError) {
      redirect("/dashboard/businesses/new?error=invalid_source");
    }
    throw error;
  }

  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: businessName.slice(0, 160),
      initialInput: rawInput,
      inputType: BusinessInputType.WEBSITE,
      websiteUrl,
      profiles: {
        create: {
          platform: ProfilePlatform.WEBSITE,
          displayName: "Website",
          url: websiteUrl,
          handle: null,
          normalizedUrl,
          confidenceScore: 100,
          status: BusinessProfileStatus.PENDING,
          source: BusinessProfileSource.SUBMITTED,
          discoveredAt: new Date(),
        },
      },
    },
  });

  logInfo("guided_profile_discovered", {
    businessId: business.id,
    platform: ProfilePlatform.WEBSITE,
    source: BusinessProfileSource.SUBMITTED,
  });
  logInfo("website_added", { businessId: business.id });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/businesses");
  redirect(`/dashboard/businesses/${business.id}/setup?step=profiles`);
}
