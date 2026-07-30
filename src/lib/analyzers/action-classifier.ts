import type {
  DetectedActionLink,
  PrimaryCtaAssessment,
} from "@/lib/audits/evidence-contracts";

export type ActionBusinessKind =
  | "restaurant"
  | "saas"
  | "local_service"
  | "ecommerce"
  | "general";

export type ActionBusinessContext = {
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
};

export type ActionCandidateInput = {
  label?: string | null;
  href?: string | null;
  elementType?: string | null;
  domLocation?: DetectedActionLink["domLocation"] | null;
  buttonLike?: boolean;
  nearPrimaryHeading?: boolean;
  navigationLike?: boolean;
};

export type WebsiteActionSummary = {
  hasDetectedActionLinks: boolean;
  detectedActionLinkCount: number;
  detectedActionTypes: string[];
  detectedActionLinks: DetectedActionLink[];
  primaryCtaAssessment: PrimaryCtaAssessment;
  /** @deprecated Use detectedActionTypes. */
  primaryActions: string[];
  secondaryNavigation: string[];
  socialLinks: string[];
  eventLinks: string[];
  conversionLinks: string[];
  contactActions: string[];
  emailActions: string[];
  orderActions: string[];
  bookingActions: string[];
  newsletterActions: string[];
  utilityLinks: string[];
  rawCandidates: string[];
};

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

export function inferActionBusinessKind(
  context?: ActionBusinessContext | null,
): ActionBusinessKind {
  const text = contextText(context);

  if (
    /\b(restaurant|bar|grill|cafe|coffee|food|dining|menu|venue|brewery|pub|pizza|hospitality|tourism|beach club)\b/.test(
      text,
    )
  ) {
    return "restaurant";
  }
  if (
    /\b(saas|software|app|platform|subscription|demo|trial|product-led|b2b)\b/.test(
      text,
    )
  ) {
    return "saas";
  }
  if (
    /\b(ecommerce|e-commerce|shop|store|retail|products|shipping|returns|cart)\b/.test(
      text,
    )
  ) {
    return "ecommerce";
  }
  if (
    /\b(local|service area|roofing|plumber|hvac|salon|clinic|law|attorney|contractor|repair|appointment|estimate|quote)\b/.test(
      text,
    )
  ) {
    return "local_service";
  }

  return "general";
}

export function classifyWebsiteActions({
  candidates,
  businessContext,
  businessKind,
}: {
  candidates: ActionCandidateInput[];
  businessContext?: ActionBusinessContext | null;
  businessKind?: ActionBusinessKind;
}): WebsiteActionSummary {
  const kind = businessKind ?? inferActionBusinessKind(businessContext);
  const context = contextText(businessContext);
  const reservationRelevant =
    /\b(reservation|reserve|book a table|table booking)\b/.test(context) ||
    candidates.some((candidate) =>
      /\b(reservation|reserve|book a table|table booking)\b/i.test(
        `${candidate.label ?? ""} ${candidate.href ?? ""}`,
      ),
    );
  const primaryActions = new Set<string>();
  const secondaryNavigation = new Set<string>();
  const socialLinks = new Set<string>();
  const eventLinks = new Set<string>();
  const conversionLinks = new Set<string>();
  const contactActions = new Set<string>();
  const emailActions = new Set<string>();
  const orderActions = new Set<string>();
  const bookingActions = new Set<string>();
  const newsletterActions = new Set<string>();
  const utilityLinks = new Set<string>();
  const rawCandidates = new Set<string>();
  const detectedActionLinks = new Map<string, DetectedActionLink>();

  for (const candidate of candidates) {
    const label = cleanLabel(candidate.label);
    const href = candidate.href?.trim() ?? "";
    const display = label || href;
    const text = `${label} ${href}`.toLowerCase();

    if (!display) continue;
    rawCandidates.add(display);

    if (socialHosts.some((host) => href.toLowerCase().includes(host))) {
      socialLinks.add(socialLabel(href, label));
      continue;
    }

    if (isSpecificEventLink(label, href)) {
      eventLinks.add(label || "Event link");
      continue;
    }

    const primary =
      primaryActionLabel({
        text: label.toLowerCase(),
        kind,
        reservationRelevant,
      }) ??
      (!label
        ? primaryActionLabel({
            text: safePathText(href).toLowerCase(),
            kind,
            reservationRelevant,
          })
        : null);
    if (primary) {
      primaryActions.add(primary);
      conversionLinks.add(display);
      if (/contact|call/i.test(primary)) contactActions.add(display);
      if (/email/i.test(primary)) emailActions.add(display);
      if (/order|takeout|buy|shop/i.test(primary)) orderActions.add(display);
      if (/book|schedule|reservation|appointment/i.test(primary)) {
        bookingActions.add(display);
      }
      if (/newsletter|subscribe/i.test(primary)) {
        newsletterActions.add(display);
      }
      const action = toDetectedActionLink(candidate, primary, label, href);
      const key = `${action.actionType}:${action.label}:${action.href ?? ""}`;
      const existing = detectedActionLinks.get(key);
      if (!existing || existing.prominenceScore < action.prominenceScore) {
        detectedActionLinks.set(key, action);
      }
      continue;
    }

    if (/\/events?\b|\/calendar\b|event|festival|party|celebration/i.test(text)) {
      eventLinks.add(label || "Event link");
      continue;
    }
    if (/privacy|terms|login|admin|cart|checkout/i.test(text)) {
      utilityLinks.add(label || href);
      continue;
    }

    secondaryNavigation.add(display);
  }

  const detectedActionTypes = [...primaryActions];
  const detectedActions = [...detectedActionLinks.values()];

  return {
    hasDetectedActionLinks: detectedActions.length > 0,
    detectedActionLinkCount: detectedActions.length,
    detectedActionTypes,
    detectedActionLinks: detectedActions,
    primaryCtaAssessment: assessPrimaryCta(detectedActions),
    primaryActions: detectedActionTypes,
    secondaryNavigation: [...secondaryNavigation],
    socialLinks: [...socialLinks],
    eventLinks: [...eventLinks],
    conversionLinks: [...conversionLinks],
    contactActions: [...contactActions],
    emailActions: [...emailActions],
    orderActions: [...orderActions],
    bookingActions: [...bookingActions],
    newsletterActions: [...newsletterActions],
    utilityLinks: [...utilityLinks],
    rawCandidates: [...rawCandidates],
  };
}

export function emptyWebsiteActionSummary(): WebsiteActionSummary {
  return {
    hasDetectedActionLinks: false,
    detectedActionLinkCount: 0,
    detectedActionTypes: [],
    detectedActionLinks: [],
    primaryCtaAssessment: {
      clarity: "NOT_ASSESSED",
      primaryCtaText: null,
      primaryCtaType: null,
      evidence: ["The page could not be assessed for primary CTA clarity."],
      confidence: "LOW",
      assessmentMethod: "NOT_ASSESSED",
      assessed: false,
    },
    primaryActions: [],
    secondaryNavigation: [],
    socialLinks: [],
    eventLinks: [],
    conversionLinks: [],
    contactActions: [],
    emailActions: [],
    orderActions: [],
    bookingActions: [],
    newsletterActions: [],
    utilityLinks: [],
    rawCandidates: [],
  };
}

export function getPrimaryCtaAssessment(
  summary?: Partial<WebsiteActionSummary> | null,
): PrimaryCtaAssessment {
  if (summary?.primaryCtaAssessment) {
    return summary.primaryCtaAssessment;
  }

  const legacyActions = summary?.primaryActions ?? [];
  if (legacyActions.length > 0) {
    return {
      clarity: "UNCERTAIN",
      primaryCtaText: null,
      primaryCtaType: null,
      evidence: [
        `${legacyActions.length} action type${legacyActions.length === 1 ? " was" : "s were"} detected in legacy analyzer data, but visual or structural prominence was not assessed.`,
      ],
      confidence: "LOW",
      assessmentMethod: "LEGACY_ACTION_LINKS_ONLY",
      assessed: false,
    };
  }

  return emptyWebsiteActionSummary().primaryCtaAssessment;
}

export function matchesActionCandidate({
  label,
  href,
  terms,
}: {
  label: string;
  href: string;
  terms: string[];
}) {
  const searchable = `${label} ${safePathText(href)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return terms.some((term) => {
    const normalized = term
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return normalized.length > 0 && ` ${searchable} `.includes(` ${normalized} `);
  });
}

function toDetectedActionLink(
  candidate: ActionCandidateInput,
  actionType: string,
  label: string,
  href: string,
): DetectedActionLink {
  const domLocation = candidate.domLocation ?? "unknown";
  const buttonLike = Boolean(candidate.buttonLike);
  const nearPrimaryHeading = Boolean(candidate.nearPrimaryHeading);
  const navigationLike =
    candidate.navigationLike ??
    (domLocation === "navigation" ||
      domLocation === "header" ||
      domLocation === "footer");
  let prominenceScore = 0;

  if (buttonLike) prominenceScore += 3;
  if (nearPrimaryHeading) prominenceScore += 3;
  if (domLocation === "hero") prominenceScore += 2;
  if (domLocation === "main") prominenceScore += 1;
  if (navigationLike) prominenceScore -= 3;
  if (domLocation === "footer") prominenceScore -= 1;
  if (!/^(learn more|more|click here|read more)$/i.test(label)) {
    prominenceScore += 1;
  }

  return {
    label: label || actionType,
    href: href || null,
    actionType,
    elementType: candidate.elementType?.trim().toLowerCase() || "unknown",
    domLocation,
    buttonLike,
    nearPrimaryHeading,
    navigationLike,
    prominenceScore: Math.max(0, Math.min(10, prominenceScore)),
  };
}

function assessPrimaryCta(
  actions: DetectedActionLink[],
): PrimaryCtaAssessment {
  if (actions.length === 0) {
    return {
      clarity: "NEEDS_IMPROVEMENT",
      primaryCtaText: null,
      primaryCtaType: null,
      evidence: [
        "No customer action link or button was detected in the static HTML.",
      ],
      confidence: "MEDIUM",
      assessmentMethod: "STATIC_HTML_STRUCTURE",
      assessed: true,
    };
  }

  const ranked = [...actions].sort(
    (left, right) => right.prominenceScore - left.prominenceScore,
  );
  const top = ranked[0];
  const second = ranked.find(
    (item) => item.actionType !== top.actionType,
  );
  const actionTypes = [...new Set(actions.map((item) => item.actionType))];
  const topIsStrong = top.prominenceScore >= 5;
  const topIsDistinct =
    !second || top.prominenceScore - second.prominenceScore >= 3;

  if (topIsStrong && topIsDistinct) {
    return {
      clarity: "CLEAR",
      primaryCtaText: top.label,
      primaryCtaType: top.actionType,
      evidence: [
        `The strongest detected action is “${top.label}” (${top.actionType}).`,
        "It has stronger static structural signals than competing actions, such as button-like markup or proximity to the primary heading.",
      ],
      confidence: top.nearPrimaryHeading && top.buttonLike ? "HIGH" : "MEDIUM",
      assessmentMethod: "STATIC_HTML_STRUCTURE",
      assessed: true,
    };
  }

  if (actionTypes.length > 1) {
    return {
      clarity: "NEEDS_IMPROVEMENT",
      primaryCtaText: null,
      primaryCtaType: null,
      evidence: [
        `${actionTypes.length} customer action types were detected: ${actionTypes.join(", ")}.`,
        "No single action had sufficiently stronger static structural prominence than the alternatives.",
      ],
      confidence: "MEDIUM",
      assessmentMethod: "STATIC_HTML_STRUCTURE",
      assessed: true,
    };
  }

  return {
    clarity: "UNCERTAIN",
    primaryCtaText: top.label,
    primaryCtaType: top.actionType,
    evidence: [
      `The action “${top.label}” was detected, but static HTML did not provide enough prominence evidence to verify it as the clear primary CTA.`,
    ],
    confidence: "LOW",
    assessmentMethod: "STATIC_HTML_STRUCTURE",
    assessed: true,
  };
}

function safePathText(value: string) {
  try {
    const url = new URL(value, "https://local.invalid");
    return `${url.pathname} ${url.searchParams.toString()}`;
  } catch {
    return value;
  }
}

function primaryActionLabel({
  text,
  kind,
  reservationRelevant,
}: {
  text: string;
  kind: ActionBusinessKind;
  reservationRelevant: boolean;
}) {
  if (/^mailto:|\bemail\b|email us|send (?:us )?an email/.test(text)) {
    return "Email";
  }
  if (
    /\b(newsletter|email list|mailing list|join the list|subscribe for updates)\b/.test(
      text,
    )
  ) {
    return "Newsletter Signup";
  }
  if (/get directions|directions|location|map/.test(text)) {
    return "Directions / Location";
  }
  if (/call now|\bcall\b|\bphone\b|^tel:/.test(text)) return "Call";
  if (/\bcontact\b|get in touch|email us/.test(text)) return "Contact";
  if (
    /\b(order inquiries?|place (?:an?|your) order|how to order|order now|pre[- ]?order|submit (?:an? )?order)\b/.test(
      text,
    )
  ) {
    return "Order / Inquiry";
  }
  if (
    /\b(book now|book online|schedule now|schedule a call|schedule consultation|book consultation)\b/.test(
      text,
    )
  ) {
    return "Booking / Scheduling";
  }

  if (kind === "restaurant") {
    if (/gift card|gift certificate|\bstore\b/.test(text)) return "Gift Cards";
    if (/order online|takeout|take-out|pickup|online order/.test(text)) {
      return "Order / Takeout";
    }
    if (/\bmenu\b/.test(text)) return "Menu";
    if (/\bhours?\b|hours of operation/.test(text)) return "Hours";
    if (/\bevents?\b|\bcalendar\b/.test(text)) return "Events";
    if (
      reservationRelevant &&
      /reservation|reserve|book a table|table booking/.test(text)
    ) {
      return "Reservations";
    }
  }

  if (kind === "saas") {
    if (/start free|free trial|start trial|try free/.test(text)) {
      return "Start Trial";
    }
    if (/request demo|book demo|schedule demo|view demo/.test(text)) {
      return "Request Demo";
    }
    if (/sign up|signup|create account|get started/.test(text)) return "Sign Up";
    if (/pricing|plans/.test(text)) return "Pricing";
    if (/contact sales/.test(text)) return "Contact Sales";
  }

  if (kind === "local_service") {
    if (/request quote|get quote|estimate/.test(text)) return "Request a Quote";
    if (/book appointment|schedule service|schedule appointment/.test(text)) {
      return "Schedule Service";
    }
  }

  if (kind === "ecommerce") {
    if (/shop now|\bshop\b|view products|browse products/.test(text)) return "Shop";
    if (/buy now|add to cart|checkout/.test(text)) return "Buy";
    if (/subscribe/.test(text)) return "Subscribe";
  }

  if (/request quote|get quote/.test(text)) return "Request a Quote";
  if (/get started|sign up|signup/.test(text)) return "Get Started";
  if (/buy now|\bbuy\b|\bshop\b/.test(text)) return "Buy / Shop";
  if (/\bsubscribe\b/.test(text)) return "Subscribe";

  return null;
}

function contextText(context?: ActionBusinessContext | null) {
  return [
    context?.description,
    context?.targetAudience,
    context?.mainOffer,
    context?.industry,
    context?.businessType,
    context?.primaryConversionGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function cleanLabel(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function socialLabel(href: string, label: string) {
  const lower = href.toLowerCase();
  if (lower.includes("instagram.com")) return "Instagram";
  if (lower.includes("facebook.com")) return "Facebook";
  if (lower.includes("tiktok.com")) return "TikTok";
  if (lower.includes("youtube.com")) return "YouTube";
  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("x.com") || lower.includes("twitter.com")) return "X / Twitter";
  if (lower.includes("pinterest.com")) return "Pinterest";
  return label || "Social profile";
}

function isSpecificEventLink(label: string, href: string) {
  if (!/\/events?\b|\/calendar\b/i.test(href)) return false;

  const normalizedLabel = label.toLowerCase().trim();
  if (
    /^(events?|all events|event calendar|upcoming events|calendar)$/.test(
      normalizedLabel,
    )
  ) {
    return false;
  }

  try {
    const path = new URL(href).pathname.replace(/\/+$/, "").toLowerCase();
    return path !== "/event" && path !== "/events" && path !== "/calendar";
  } catch {
    return true;
  }
}
