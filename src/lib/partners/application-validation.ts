import { PartnerProgramError } from "@/lib/partners/errors";

export type PartnerApplicationInput = {
  legalName: string;
  displayName: string;
  email: string;
  country: string;
  stateOrRegion?: string;
  websiteUrl?: string;
  socialProfiles: string[];
  experienceSummary: string;
  intendedPromotionMethods: string[];
  audienceOrOutreachSummary: string;
  applicationMessage: string;
  ageConfirmation: boolean;
  standardsAgreement: boolean;
  earningsDisclaimerAccepted: boolean;
};

function cleanText(value: string, max: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function optionalUrl(value: string | undefined) {
  const cleaned = value?.trim();
  if (!cleaned) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function validatePartnerApplication(input: PartnerApplicationInput) {
  const normalized = {
    legalName: cleanText(input.legalName, 120),
    displayName: cleanText(input.displayName, 80),
    email: input.email.trim().toLowerCase().slice(0, 254),
    country: input.country.trim().toUpperCase(),
    stateOrRegion: cleanText(input.stateOrRegion ?? "", 100) || null,
    websiteUrl: optionalUrl(input.websiteUrl),
    socialProfiles: input.socialProfiles
      .map((profile) => optionalUrl(profile))
      .filter((profile): profile is string => Boolean(profile))
      .slice(0, 8),
    experienceSummary: input.experienceSummary.trim().slice(0, 2_500),
    intendedPromotionMethods: [...new Set(input.intendedPromotionMethods)]
      .map((method) => cleanText(method, 80))
      .filter(Boolean)
      .slice(0, 10),
    audienceOrOutreachSummary: input.audienceOrOutreachSummary.trim().slice(0, 2_500),
    applicationMessage: input.applicationMessage.trim().slice(0, 2_500),
    ageConfirmation: input.ageConfirmation,
    standardsAgreement: input.standardsAgreement,
    earningsDisclaimerAccepted: input.earningsDisclaimerAccepted,
  };

  if (normalized.legalName.length < 2 || normalized.displayName.length < 2) {
    throw new PartnerProgramError("Enter your legal and public display names.", "INVALID_NAME");
  }
  if (!normalized.email.includes("@")) {
    throw new PartnerProgramError("Enter a valid email address.", "INVALID_EMAIL");
  }
  if (!/^[A-Z]{2}$/.test(normalized.country)) {
    throw new PartnerProgramError("Select an approved country.", "INVALID_COUNTRY");
  }
  if (
    normalized.experienceSummary.length < 40 ||
    normalized.audienceOrOutreachSummary.length < 40 ||
    normalized.applicationMessage.length < 40
  ) {
    throw new PartnerProgramError(
      "Please provide a little more detail in each written response.",
      "APPLICATION_DETAIL_REQUIRED",
    );
  }
  if (normalized.intendedPromotionMethods.length === 0) {
    throw new PartnerProgramError("Select at least one intended promotion method.", "PROMOTION_METHOD_REQUIRED");
  }
  if (
    !normalized.ageConfirmation ||
    !normalized.standardsAgreement ||
    !normalized.earningsDisclaimerAccepted
  ) {
    throw new PartnerProgramError("All application confirmations are required.", "CONFIRMATIONS_REQUIRED");
  }

  return normalized;
}
