import "server-only";

import { logError, logWarn } from "@/lib/observability/log";

export type GooglePlaceCandidate = {
  googlePlaceId: string;
  displayName: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
  types: string[];
  rawSnapshot: unknown;
};

export type GooglePlaceBusinessInput = {
  businessName: string;
  initialInput?: string | null;
  websiteUrl?: string | null;
  location?: string | null;
  detectedAddress?: string | null;
  detectedPhone?: string | null;
  detectedGoogleMapsLinks?: string[];
  detectedMapEmbeds?: string[];
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  } | null;
};

export type GooglePlaceMatchScore = {
  confidence: number;
  reasons: string[];
};

export type ScoredGooglePlaceCandidate = GooglePlaceCandidate &
  GooglePlaceMatchScore;

export type GooglePlacesSearchResult = {
  configured: boolean;
  searched: boolean;
  query?: string;
  candidates: ScoredGooglePlaceCandidate[];
  error?: string;
};

export type GooglePlaceDetailsResult = {
  configured: boolean;
  place?: GooglePlaceCandidate;
  error?: string;
};

type PlacesApiPlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
};

const placesBaseUrl = "https://places.googleapis.com/v1";
const fetchTimeoutMs = 8000;
const textSearchFieldMask = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
].join(",");
const detailsFieldMask = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "primaryType",
  "types",
  "regularOpeningHours",
].join(",");

export function isGooglePlacesConfigured() {
  return Boolean(getGooglePlacesApiKey());
}

export function getGooglePlacesApiKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export async function searchGooglePlacesForBusiness(
  input: GooglePlaceBusinessInput,
): Promise<GooglePlacesSearchResult> {
  const apiKey = getGooglePlacesApiKey();

  if (!apiKey) {
    return {
      configured: false,
      searched: false,
      candidates: [],
      error: "Google Places API key is not configured.",
    };
  }

  const query = buildSearchQuery(input);

  if (!query) {
    return {
      configured: true,
      searched: false,
      candidates: [],
      error: "Not enough business information to search Google Places.",
    };
  }

  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(`${placesBaseUrl}/places:searchText`, {
      method: "POST",
      signal: timeout.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": textSearchFieldMask,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,
      }),
    });
    timeout.clear();

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      logWarn("google_places_text_search_rejected", {
        status: response.status,
      });

      return {
        configured: true,
        searched: true,
        query,
        candidates: [],
        error: `Google Places returned HTTP ${response.status}.`,
      };
    }

    const data = (await response.json()) as { places?: PlacesApiPlace[] };
    const candidates = (data.places ?? [])
      .map(normalizePlace)
      .filter((place): place is GooglePlaceCandidate => Boolean(place))
      .map((place) => ({
        ...place,
        ...scoreGooglePlaceMatch(place, input),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      configured: true,
      searched: true,
      query,
      candidates,
    };
  } catch (error) {
    timeout.clear();
    logError("google_places_text_search_failed", error);

    return {
      configured: true,
      searched: true,
      query,
      candidates: [],
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Google Places request timed out."
          : "Google Places request failed.",
    };
  }
}

export async function getGooglePlaceDetails(
  placeIdOrUrl: string,
): Promise<GooglePlaceDetailsResult> {
  const apiKey = getGooglePlacesApiKey();

  if (!apiKey) {
    return {
      configured: false,
      error: "Google Places API key is not configured.",
    };
  }

  const placeId = normalizePlaceId(placeIdOrUrl);

  if (!placeId) {
    return {
      configured: true,
      error:
        "Enter a Google Place ID. Some Google Maps URLs do not include a resolvable Place ID.",
    };
  }

  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(
      `${placesBaseUrl}/places/${encodeURIComponent(placeId)}`,
      {
        signal: timeout.signal,
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": detailsFieldMask,
        },
      },
    );
    timeout.clear();

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      logWarn("google_places_details_rejected", { status: response.status });

      return {
        configured: true,
        error: `Google Places returned HTTP ${response.status}.`,
      };
    }

    const data = (await response.json()) as PlacesApiPlace;
    const place = normalizePlace(data);

    return place
      ? {
          configured: true,
          place,
        }
      : {
          configured: true,
          error: "Google Places returned an empty place response.",
        };
  } catch (error) {
    timeout.clear();
    logError("google_places_details_failed", error);

    return {
      configured: true,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Google Places request timed out."
          : "Google Places request failed.",
    };
  }
}

export function scoreGooglePlaceMatch(
  candidate: GooglePlaceCandidate,
  businessData: GooglePlaceBusinessInput,
): GooglePlaceMatchScore {
  const reasons: string[] = [];
  let score = 0;
  const nameScore = nameSimilarity(
    candidate.displayName ?? "",
    businessData.businessName,
  );

  if (nameScore >= 0.9) {
    score += 34;
    reasons.push("Business name is a very close match.");
  } else if (nameScore >= 0.7) {
    score += 26;
    reasons.push("Business name is similar.");
  } else if (nameScore >= 0.45) {
    score += 15;
    reasons.push("Business name is a possible match.");
  } else {
    score -= 18;
    reasons.push("Business name is weakly matched.");
  }

  const inputDomain = comparableDomain(businessData.websiteUrl);
  const candidateDomain = comparableDomain(candidate.websiteUri);

  if (inputDomain && candidateDomain) {
    if (inputDomain === candidateDomain) {
      score += 28;
      reasons.push("Website domain matches.");
    } else {
      score -= 18;
      reasons.push("Website domain differs.");
    }
  }

  const inputPhone = phoneDigits(businessData.detectedPhone);
  const candidatePhone = phoneDigits(candidate.phoneNumber);

  if (inputPhone && candidatePhone) {
    if (inputPhone.endsWith(candidatePhone.slice(-10)) || candidatePhone.endsWith(inputPhone.slice(-10))) {
      score += 22;
      reasons.push("Phone number matches.");
    } else {
      score -= 12;
      reasons.push("Phone number differs.");
    }
  }

  const addressScore = addressSimilarity(
    candidate.formattedAddress,
    businessData.detectedAddress ?? businessData.location,
  );

  if (addressScore >= 0.55) {
    score += 20;
    reasons.push("Address or location appears to match.");
  } else if (addressScore > 0) {
    score += 8;
    reasons.push("Some address or location terms overlap.");
  }

  const mapsLinkCount =
    (businessData.detectedGoogleMapsLinks?.length ?? 0) +
    (businessData.detectedMapEmbeds?.length ?? 0);

  if (mapsLinkCount > 0) {
    score += 10;
    reasons.push("Google Maps link or embed was detected on the website.");
  }

  const contextText = [
    businessData.businessContext?.description,
    businessData.businessContext?.industry,
    businessData.businessContext?.businessType,
    businessData.businessContext?.mainOffer,
    candidate.primaryType,
    ...(candidate.types ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(restaurant|bar|grill|cafe|food|dining|store|local|service|contractor|salon|clinic|lawyer)\b/.test(
      contextText,
    )
  ) {
    score += 6;
    reasons.push("Place category fits local/review discovery.");
  }

  if (candidate.businessStatus === "OPERATIONAL") {
    score += 4;
    reasons.push("Google listing is marked operational.");
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

export function normalizePlaceId(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^places\//i.test(trimmed)) {
    return trimmed.replace(/^places\//i, "");
  }

  if (/^ChI[a-zA-Z0-9_-]+/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const placeId =
      url.searchParams.get("place_id") ||
      url.searchParams.get("q")?.match(/place_id:([^&]+)/)?.[1] ||
      url.pathname.match(/\/place\/([^/]+)/)?.[1];

    return placeId ? decodeURIComponent(placeId) : null;
  } catch {
    return trimmed.length > 12 && !trimmed.includes(" ")
      ? trimmed.replace(/^places\//i, "")
      : null;
  }
}

function buildSearchQuery(input: GooglePlaceBusinessInput) {
  const websiteDomain = comparableDomain(input.websiteUrl);
  const queryParts = [
    input.businessName,
    input.detectedAddress,
    input.location,
    websiteDomain,
  ]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean);

  return [...new Set(queryParts)].join(" ");
}

function normalizePlace(place: PlacesApiPlace): GooglePlaceCandidate | null {
  if (!place.id) {
    return null;
  }

  return {
    googlePlaceId: place.id.replace(/^places\//i, ""),
    displayName: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    phoneNumber:
      place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    websiteUri: place.websiteUri ?? null,
    googleMapsUri: place.googleMapsUri ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount:
      typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    businessStatus: place.businessStatus ?? null,
    primaryType: place.primaryType ?? null,
    types: place.types ?? [],
    rawSnapshot: place,
  };
}

function createTimeoutSignal() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function comparableDomain(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function phoneDigits(value?: string | null) {
  const digits = value?.replace(/\D+/g, "") ?? "";

  return digits.length >= 7 ? digits.slice(-10) : null;
}

function normalizedTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(llc|inc|co|company|the|and|restaurant|bar|grill)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function nameSimilarity(candidateName: string, businessName: string) {
  const candidate = normalizedTokens(candidateName);
  const business = normalizedTokens(businessName);

  if (candidate.length === 0 || business.length === 0) {
    return 0;
  }

  const candidateText = candidate.join(" ");
  const businessText = business.join(" ");

  if (candidateText === businessText) {
    return 1;
  }

  if (candidateText.includes(businessText) || businessText.includes(candidateText)) {
    return 0.92;
  }

  const candidateSet = new Set(candidate);
  const businessSet = new Set(business);
  const intersection = [...candidateSet].filter((token) =>
    businessSet.has(token),
  ).length;
  const union = new Set([...candidateSet, ...businessSet]).size;

  return union > 0 ? intersection / union : 0;
}

function addressSimilarity(
  candidateAddress?: string | null,
  inputAddress?: string | null,
) {
  const candidate = normalizedAddressTokens(candidateAddress);
  const input = normalizedAddressTokens(inputAddress);

  if (candidate.length === 0 || input.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidate);
  const inputSet = new Set(input);
  const intersection = [...candidateSet].filter((token) =>
    inputSet.has(token),
  ).length;

  return intersection / Math.max(1, Math.min(candidateSet.size, inputSet.size));
}

function normalizedAddressTokens(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["usa", "united", "states"].includes(token));
}
