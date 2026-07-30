export const businessModelValues = [
  "RESTAURANT",
  "CAFE",
  "COTTAGE_FOOD",
  "LOCAL_RETAIL",
  "ECOMMERCE",
  "PROFESSIONAL_SERVICE",
  "HOME_SERVICE",
  "APPOINTMENT_BUSINESS",
  "MOBILE_BUSINESS",
  "CREATOR",
  "NONPROFIT",
  "SAAS",
  "OTHER",
] as const;

export type BusinessModel = (typeof businessModelValues)[number];

export type CustomerLocationStatus =
  | "CONFIRMED_PUBLIC_LOCATION"
  | "NO_PUBLIC_LOCATION"
  | "UNKNOWN";

export type BusinessModelContext = {
  name?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
  brandTone?: string | null;
};

export type BusinessModelClassification = {
  model: BusinessModel;
  locationStatus: CustomerLocationStatus;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
};

export function classifyBusinessModel({
  context,
  detectedAddress,
  operatingHoursSignals = [],
  detectedActionTypes = [],
}: {
  context: BusinessModelContext;
  detectedAddress?: string | null;
  operatingHoursSignals?: string[];
  detectedActionTypes?: string[];
}): BusinessModelClassification {
  const weightedText = contextText(context);
  const evidence: string[] = [];
  const explicitNoLocation =
    /\b(cottage food|home[- ]based|from (?:my|our) home|no storefront|online[- ]only|delivery[- ]only|pickup (?:only|by appointment)|pre[- ]?order(?: only)?|mobile business|pop[- ]?up only)\b/.test(
      weightedText,
    );
  const explicitPublicLocation =
    /\b(dine[- ]?in|walk[- ]?in|storefront|retail location|visit (?:our|the) (?:store|shop|restaurant|cafe)|customer-facing location|reserve a table|book a table)\b/.test(
      weightedText,
    );
  const observedPublicLocation =
    Boolean(detectedAddress) &&
    (operatingHoursSignals.length > 0 ||
      detectedActionTypes.some((action) =>
        /directions|location|reservations/i.test(action),
      ));

  let model: BusinessModel = "OTHER";

  if (
    /\b(cottage food|cottage bakery|home[- ]based (?:bakery|baker|food)|home baker|pre[- ]?order(?:ed)? (?:baked|food)|pickup and delivery bakery)\b/.test(
      weightedText,
    )
  ) {
    model = "COTTAGE_FOOD";
    evidence.push("Business Context describes a cottage-food, home-based, or preorder operating model.");
  } else if (
    /\b(restaurant|diner|bistro|bar and grill|grill|pub|brewery|dining|reserve a table|table reservation)\b/.test(
      weightedText,
    )
  ) {
    model = "RESTAURANT";
    evidence.push("Business Context describes a restaurant or dine-in hospitality model.");
  } else if (/\b(cafe|coffee shop|coffeehouse|tea shop)\b/.test(weightedText)) {
    model = "CAFE";
    evidence.push("Business Context describes a cafe or coffeehouse model.");
  } else if (
    /\b(mobile (?:business|service|vendor)|food truck|mobile salon|on[- ]site only|we come to you)\b/.test(
      weightedText,
    )
  ) {
    model = "MOBILE_BUSINESS";
    evidence.push("Business Context describes a mobile or on-site operating model.");
  } else if (
    /\b(salon|spa|studio appointment|appointment[- ]based|clinic|dentist|therapist|book an appointment|schedule an appointment|coach(?:ing)? session)\b/.test(
      weightedText,
    )
  ) {
    model = "APPOINTMENT_BUSINESS";
    evidence.push("Business Context describes an appointment-led customer path.");
  } else if (
    /\b(home service|roof(?:er|ing)|plumb(?:er|ing)|hvac|electrician|contractor|landscap(?:er|ing)|repair service|cleaning service|service area)\b/.test(
      weightedText,
    )
  ) {
    model = "HOME_SERVICE";
    evidence.push("Business Context describes a service-area or home-service model.");
  } else if (
    /\b(ecommerce|e-commerce|online store|online shop|direct[- ]to[- ]consumer|shopify|product catalog|shipping|add to cart|checkout)\b/.test(
      weightedText,
    )
  ) {
    model = "ECOMMERCE";
    evidence.push("Business Context describes an ecommerce purchase path.");
  } else if (
    /\b(retail store|local retail|boutique|storefront|brick[- ]and[- ]mortar|gift shop)\b/.test(
      weightedText,
    )
  ) {
    model = "LOCAL_RETAIL";
    evidence.push("Business Context describes a customer-facing retail model.");
  } else if (
    /\b(saas|software|web app|mobile app|software platform|subscription platform|free trial|product demo)\b/.test(
      weightedText,
    )
  ) {
    model = "SAAS";
    evidence.push("Business Context describes a software or subscription product.");
  } else if (
    /\b(content creator|creator business|podcast|podcaster|artist|influencer|streamer|newsletter creator|community brand)\b/.test(
      weightedText,
    )
  ) {
    model = "CREATOR";
    evidence.push("Business Context describes a creator, media, or community-led model.");
  } else if (
    /\b(nonprofit|non-profit|charity|foundation|community organization|donation|volunteer)\b/.test(
      weightedText,
    )
  ) {
    model = "NONPROFIT";
    evidence.push("Business Context describes a nonprofit or community organization.");
  } else if (
    /\b(consultant|consulting|agency|freelancer|professional service|advisor|advisory|law firm|accounting firm)\b/.test(
      weightedText,
    )
  ) {
    model = "PROFESSIONAL_SERVICE";
    evidence.push("Business Context describes a professional-service model.");
  }

  const locationStatus: CustomerLocationStatus = explicitNoLocation
    ? "NO_PUBLIC_LOCATION"
    : (explicitPublicLocation || observedPublicLocation) &&
        model !== "HOME_SERVICE" &&
        model !== "MOBILE_BUSINESS"
      ? "CONFIRMED_PUBLIC_LOCATION"
      : "UNKNOWN";

  if (locationStatus === "NO_PUBLIC_LOCATION") {
    evidence.push("Current evidence indicates there is no public customer-facing storefront.");
  } else if (locationStatus === "CONFIRMED_PUBLIC_LOCATION") {
    evidence.push("Current evidence supports a public customer-facing location.");
  }

  return {
    model,
    locationStatus,
    confidence:
      model !== "OTHER" && locationStatus !== "UNKNOWN"
        ? "HIGH"
        : model !== "OTHER"
          ? "MEDIUM"
          : "LOW",
    evidence,
  };
}

export function businessModelLabel(model: BusinessModel) {
  return model
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function supportsCustomerVisitLanguage(
  classification: Pick<BusinessModelClassification, "model" | "locationStatus">,
) {
  if (classification.locationStatus !== "CONFIRMED_PUBLIC_LOCATION") {
    return false;
  }

  return ["RESTAURANT", "CAFE", "LOCAL_RETAIL", "APPOINTMENT_BUSINESS"].includes(
    classification.model,
  );
}

function contextText(context: BusinessModelContext) {
  return [
    context.businessType,
    context.description,
    context.mainOffer,
    context.primaryConversionGoal,
    context.industry,
    context.targetAudience,
    context.brandTone,
    context.name,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();
}
