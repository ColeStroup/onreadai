"use server";

import {
  BusinessInputType,
  BusinessProfileSource,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canCreateBusiness } from "@/lib/billing/entitlements";
import { discoverSubmittedProfiles } from "@/lib/discovery/submitted-profile-discovery";
import { discoverGoogleBusinessProfiles } from "@/lib/google/google-business-discovery";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/observability/log";
import { requireUser } from "@/lib/session";
import { platformForSubmittedUrl } from "@/lib/profiles/platforms";
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

function classifyInput(input: string) {
  const value = input.trim().toLowerCase();
  const socialHosts = [
    "instagram.com",
    "facebook.com",
    "tiktok.com",
    "youtube.com",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "pinterest.com",
  ];

  if (
    socialHosts.some((host) => value.includes(host)) ||
    platformForSubmittedUrl(value)
  ) {
    return BusinessInputType.SOCIAL_PROFILE;
  }

  if (!value.includes(" ") && value.includes(".")) {
    return BusinessInputType.WEBSITE;
  }

  return BusinessInputType.BUSINESS_NAME;
}

function normalizeUrl(input: string) {
  const value = input.trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function titleCase(value: string) {
  return value
    .replace(/[-_.]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferBusinessName(input: string) {
  const inputType = classifyInput(input);

  if (inputType === BusinessInputType.BUSINESS_NAME) {
    return input.trim();
  }

  try {
    const url = new URL(normalizeUrl(input));
    const pathName = url.pathname
      .split("/")
      .filter(Boolean)
      .at(0)
      ?.replace(/^@/, "");
    const hostName = url.hostname.replace(/^www\./, "").split(".").at(0);

    return titleCase(pathName || hostName || input);
  } catch {
    return input.trim();
  }
}

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

  const rawInput = String(formData.get("businessInput") ?? "").trim();

  if (rawInput.length < 2) {
    redirect("/dashboard/businesses/new?error=missing");
  }

  const inputType = classifyInput(rawInput);
  const websiteUrl =
    inputType === BusinessInputType.WEBSITE ? normalizeUrl(rawInput) : null;
  let discoveredProfiles;
  try {
    discoveredProfiles = discoverSubmittedProfiles(rawInput, inputType).map(
      (profile) => {
        const normalized = profile.url
          ? normalizeProfileUrlSyntax(profile.url, profile.platform)
          : null;
        return {
          ...profile,
          url: normalized?.url ?? null,
          normalizedUrl: normalized
            ? profileUrlComparisonKey(normalized.url, profile.platform)
            : null,
        };
      },
    );
  } catch (error) {
    if (error instanceof ProfileUrlError) {
      redirect("/dashboard/businesses/new?error=invalid_source");
    }
    throw error;
  }

  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: inferBusinessName(rawInput),
      initialInput: rawInput,
      inputType,
      websiteUrl,
      profiles: {
        create: discoveredProfiles.map((profile) => ({
          platform: profile.platform,
          displayName: profile.label,
          url: profile.url,
          handle: profile.handle,
          normalizedUrl: profile.normalizedUrl,
          confidenceScore: profile.confidenceScore,
          status: profile.status,
          source: BusinessProfileSource.SUBMITTED,
          discoveredAt: new Date(),
        })),
      },
    },
  });

  for (const profile of discoveredProfiles) {
    logInfo("guided_profile_discovered", {
      businessId: business.id,
      platform: profile.platform,
      source: BusinessProfileSource.SUBMITTED,
    });
  }

  try {
    await discoverGoogleBusinessProfiles({
      business,
    });
  } catch (error) {
    logError("signup_google_business_discovery_failed", error, {
      businessId: business.id,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/businesses");
  redirect(`/dashboard/businesses/${business.id}/setup?step=profiles`);
}
