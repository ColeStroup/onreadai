import type { ScoreCategory } from "@prisma/client";

import {
  classifyBusinessModel,
  supportsCustomerVisitLanguage,
  type BusinessModelClassification,
} from "@/lib/business-model";
import { logWarn } from "@/lib/observability/log";

export type ReportBusinessArchetype =
  | "restaurant_hospitality"
  | "cottage_food"
  | "saas_software"
  | "local_service"
  | "appointment_business"
  | "mobile_business"
  | "ecommerce"
  | "creator_community"
  | "nonprofit"
  | "professional_service"
  | "general";

export type ReportBusinessContext = {
  name?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
  brandTone?: string | null;
};

export type CompatibilityResult = {
  compatible: boolean;
  archetype: ReportBusinessArchetype;
  reasons: string[];
};

type ContentItem = {
  title: string;
  description: string;
  category?: ScoreCategory | string | null;
};

const archetypeSignals: Record<
  Exclude<ReportBusinessArchetype, "general">,
  RegExp[]
> = {
  restaurant_hospitality: [
    /\brestaurant\b/i,
    /\bbeach club\b/i,
    /\bhospitality\b/i,
    /\b(food|dining|menu|takeout|bar|grill|cafe|brewery|pub)\b/i,
    /\b(venue|tourism|guest|reservations?)\b/i,
  ],
  cottage_food: [
    /\b(cottage food|cottage bakery|home[- ]based (?:bakery|food)|home baker|pre[- ]?order)\b/i,
  ],
  saas_software: [
    /\bsaas\b/i,
    /\bsoftware\b/i,
    /\b(subscription platform|software platform|web app|mobile app)\b/i,
    /\b(free trial|product demo|software demo|onboarding flow)\b/i,
  ],
  local_service: [
    /\b(home services?|service area)\b/i,
    /\b(roofing|roofer|plumb(?:er|ing)?|hvac|contractor|electrician)\b/i,
    /\b(salon|clinic|dentist|attorney|repair service)\b/i,
    /\b(estimate|service call|book an appointment)\b/i,
  ],
  appointment_business: [
    /\b(appointment[- ]based|salon|spa|clinic|book an appointment|schedule an appointment)\b/i,
  ],
  mobile_business: [
    /\b(mobile business|mobile service|food truck|we come to you|on[- ]site only)\b/i,
  ],
  ecommerce: [
    /\b(ecommerce|e-commerce|online store|retail store)\b/i,
    /\b(add to cart|checkout|product catalog|shipping|returns)\b/i,
  ],
  creator_community: [
    /\b(discord|guild|twitch|streamer|gaming audience)\b/i,
    /\b(content creator|creator business|creator community)\b/i,
    /\b(server owners?|community managers?)\b/i,
  ],
  nonprofit: [
    /\b(nonprofit|non-profit|charity|foundation|community organization)\b/i,
  ],
  professional_service: [
    /\b(consultant|consulting|agency|freelancer|professional services?)\b/i,
    /\b(advisory|client services?)\b/i,
  ],
};

const incompatibleLanguage: Partial<
  Record<ReportBusinessArchetype, Array<{ pattern: RegExp; label: string }>>
> = {
  restaurant_hospitality: [
    { pattern: /\b(discord|guild|gaming audiences?|server owners?)\b/i, label: "gaming/community terminology" },
    { pattern: /\b(developer community|software demo|free trial|saas)\b/i, label: "software terminology" },
    { pattern: /\b(b2b lead generation|product onboarding)\b/i, label: "B2B software terminology" },
  ],
  cottage_food: [
    {
      pattern:
        /\b(atmosphere|dine[- ]?in|dining room|guest experience|reasons? to visit|plan (?:a|your) visit|check (?:our )?hours|get directions)\b/i,
      label: "storefront hospitality terminology",
    },
  ],
  saas_software: [
    { pattern: /\b(menu specials?|table reservations?|dining room|happy hour|beach atmosphere)\b/i, label: "hospitality terminology" },
    { pattern: /\b(service area|request an estimate|service call)\b/i, label: "local-service terminology" },
  ],
  local_service: [
    { pattern: /\b(free trial|software demo|product onboarding|developer community)\b/i, label: "software terminology" },
    { pattern: /\b(menu specials?|table reservations?|dining room|happy hour)\b/i, label: "hospitality terminology" },
  ],
  appointment_business: [
    { pattern: /\b(dine[- ]?in|menu specials?|guest atmosphere)\b/i, label: "hospitality terminology" },
  ],
  mobile_business: [
    { pattern: /\b(visit our storefront|dine[- ]?in|store hours|guest atmosphere)\b/i, label: "fixed-location terminology" },
  ],
  ecommerce: [
    { pattern: /\b(request an estimate|service area|service call)\b/i, label: "local-service terminology" },
    { pattern: /\b(table reservations?|menu specials?|dining room)\b/i, label: "hospitality terminology" },
  ],
  creator_community: [
    { pattern: /\b(table reservations?|menu specials?|service area|request an estimate)\b/i, label: "unrelated local-business terminology" },
  ],
  nonprofit: [
    { pattern: /\b(add to cart|free trial|table reservation)\b/i, label: "commercial template terminology" },
  ],
  professional_service: [
    { pattern: /\b(table reservations?|menu specials?|gaming audiences?|discord server)\b/i, label: "unrelated business-type terminology" },
  ],
};

const unsupportedObservationPatterns = [
  /\bcontent cadence\b/i,
  /\bposting frequency\b/i,
  /\btop[- ]performing content\b/i,
  /\bsocial engagement\b/i,
  /\b(audience reach|impressions|social growth|audience response)\b/i,
];

export function classifyReportBusiness(
  context: ReportBusinessContext,
): ReportBusinessArchetype {
  const normalized = classifyBusinessModel({ context });
  const mapped: Partial<Record<typeof normalized.model, ReportBusinessArchetype>> = {
    RESTAURANT: "restaurant_hospitality",
    CAFE: "restaurant_hospitality",
    COTTAGE_FOOD: "cottage_food",
    LOCAL_RETAIL: "ecommerce",
    ECOMMERCE: "ecommerce",
    PROFESSIONAL_SERVICE: "professional_service",
    HOME_SERVICE: "local_service",
    APPOINTMENT_BUSINESS: "appointment_business",
    MOBILE_BUSINESS: "mobile_business",
    CREATOR: "creator_community",
    NONPROFIT: "nonprofit",
    SAAS: "saas_software",
  };
  if (mapped[normalized.model]) {
    return mapped[normalized.model]!;
  }

  const weightedFields = [
    [context.businessType, 5],
    [context.industry, 4],
    [context.mainOffer, 3],
    [context.description, 2],
    [context.targetAudience, 2],
    [context.primaryConversionGoal, 1],
    [context.brandTone, 1],
    [context.name, 1],
  ] as const;
  const scores = Object.fromEntries(
    Object.keys(archetypeSignals).map((key) => [key, 0]),
  ) as Record<Exclude<ReportBusinessArchetype, "general">, number>;

  for (const [value, weight] of weightedFields) {
    if (!value) continue;

    for (const [archetype, patterns] of Object.entries(archetypeSignals) as Array<
      [Exclude<ReportBusinessArchetype, "general">, RegExp[]]
    >) {
      scores[archetype] += patterns.filter((pattern) => pattern.test(value)).length * weight;
    }
  }

  const [bestArchetype, bestScore] = (Object.entries(scores) as Array<
    [Exclude<ReportBusinessArchetype, "general">, number]
  >).sort((a, b) => b[1] - a[1])[0];

  return bestScore >= 3 ? bestArchetype : "general";
}

export function validateBusinessCompatibleContent({
  item,
  context,
  sourceEvidence = "",
  businessModel,
}: {
  item: ContentItem;
  context: ReportBusinessContext;
  sourceEvidence?: string;
  businessModel?: BusinessModelClassification;
}): CompatibilityResult {
  const archetype = classifyReportBusiness(context);
  const normalizedBusinessModel =
    businessModel ?? classifyBusinessModel({ context });
  const text = `${item.title} ${item.description}`;
  const reasons: string[] = [];

  for (const rule of incompatibleLanguage[archetype] ?? []) {
    const match = text.match(rule.pattern)?.[0];

    if (match && !sourceEvidence.toLowerCase().includes(match.toLowerCase())) {
      reasons.push(`Contains ${rule.label} unsupported by current evidence.`);
    }
  }

  if (hasUnsupportedObservationClaim(text)) {
    reasons.push("Claims social or content performance data that was not analyzed.");
  }

  if (
    !supportsCustomerVisitLanguage(normalizedBusinessModel) &&
    /\b(guest atmosphere|guest experience|dine[- ]?in|dining room|reasons? to visit|plan (?:a|your) visit|visit us|check (?:our )?hours|get directions)\b/i.test(
      text,
    )
  ) {
    reasons.push(
      "Uses customer-visit or storefront language without a confirmed public customer-facing location.",
    );
  }

  return {
    compatible: reasons.length === 0,
    archetype,
    reasons,
  };
}

export function filterBusinessCompatibleContent<T extends ContentItem>({
  items,
  context,
  sourceEvidence,
  diagnosticLabel,
}: {
  items: T[];
  context: ReportBusinessContext;
  sourceEvidence?: string;
  diagnosticLabel?: string;
}) {
  return items.filter((item) => {
    const result = validateBusinessCompatibleContent({
      item,
      context,
      sourceEvidence,
    });

    if (!result.compatible && process.env.NODE_ENV !== "production") {
      logWarn("report_content_compatibility_rejected", {
        diagnosticLabel,
        archetype: result.archetype,
        reasonCount: result.reasons.length,
      });
    }

    return result.compatible;
  });
}

export function containsUnsupportedObservedClaim(value: string) {
  return hasUnsupportedObservationClaim(value);
}

export function publicCompetitorMonitoringCopy(competitorNames: string[]) {
  const names = competitorNames.slice(0, 3).join(", ") || "saved competitors";

  return `Periodically review changes in ${names}'s public homepage messaging, offers, calls to action, important pages, Google listing signals when available, and confirmed profile coverage.`;
}

export function deterministicSocialRecommendation(
  context: ReportBusinessContext,
) {
  const archetype = classifyReportBusiness(context);
  const businessModel = classifyBusinessModel({ context });

  if (archetype === "restaurant_hospitality") {
    if (!supportsCustomerVisitLanguage(businessModel)) {
      return {
        title: "Build product and ordering content around the confirmed path",
        description:
          "Create short-form content around specific products, preparation, founder perspective, customer proof, and the confirmed ordering or contact process. Keep every next step tied to the saved inquiry, pickup, delivery, or fulfillment path.",
      };
    }
    const offer = context.mainOffer?.trim();
    return {
      title: "Build a visual hospitality content rhythm",
      description: `Create short-form content around ${
        offer
          ? `${offer.toLowerCase()}, the guest experience, atmosphere, events, and local reasons to visit`
          : "the atmosphere, food and drinks, events, customer experiences, and local reasons to visit"
      }. Connect each post to a clear action such as checking hours, viewing the menu, getting directions, ordering, or visiting.`,
    };
  }

  if (archetype === "cottage_food") {
    return {
      title: "Build product and preorder content around the real buying path",
      description:
        "Create short-form content around products, flavors, seasonal releases, preparation, founder perspective, ingredient or allergen information, customer proof, and clear ordering, pickup, or delivery instructions. Point each post only to a confirmed preorder, inquiry, profile, or delivery path.",
    };
  }

  if (archetype === "saas_software") {
    return {
      title: "Turn product value into repeatable educational content",
      description:
        "Use short demonstrations, customer problems, practical workflows, and proof to explain the product. Connect each post to the most relevant signup, trial, demo, or pricing step supported by the current offer.",
    };
  }

  if (
    archetype === "local_service" ||
    archetype === "appointment_business" ||
    archetype === "mobile_business"
  ) {
    return {
      title: "Publish local proof and useful service guidance",
      description:
        "Build content around completed work, common customer questions, service-area expertise, reviews, and clear booking or contact paths without claiming performance data that was not measured.",
    };
  }

  if (archetype === "ecommerce") {
    return {
      title: "Build product-led content around purchase decisions",
      description:
        "Use product demonstrations, use cases, customer proof, comparisons, and offer-led posts that point to the appropriate storefront or product path.",
    };
  }

  if (archetype === "creator_community") {
    return {
      title: "Build a repeatable social-first content system",
      description:
        "Use audience problems, practical teaching, proof, and community-specific examples across the confirmed channels, then point each post to the saved profile conversion path.",
    };
  }

  return {
    title: "Create a focused weekly content plan",
    description:
      "Use the confirmed business offer, audience, customer proof, and primary conversion path to create a small set of repeatable content themes.",
  };
}

function hasUnsupportedObservationClaim(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        !/\b(not|never|without)\b.{0,40}\b(analy[sz]ed|inspected|measured|available)\b/i.test(
          sentence,
        ) &&
        !/\b(analy[sz]ed|inspected|measured)\b.{0,40}\b(not|never)\b/i.test(
          sentence,
        ),
    )
    .some((sentence) =>
      unsupportedObservationPatterns.some((pattern) => pattern.test(sentence)),
    );
}
