import type { ActionBusinessKind } from "@/lib/analyzers/action-classifier";

export const BUSINESS_INTENT_ONTOLOGY_VERSION = "business-intent-v1";

export type BusinessIntentPurpose =
  | "CONTACT"
  | "ORDER"
  | "BOOKING"
  | "QUOTE"
  | "PURCHASE"
  | "APPLICATION"
  | "DIRECTIONS"
  | "SUBSCRIBE"
  | "CHAT"
  | "OTHER";

export type BusinessIntentResult = {
  purpose: BusinessIntentPurpose;
  confidence: number;
  matchedSignals: string[];
  source:
    | "ACCESSIBLE_NAME"
    | "VISIBLE_TEXT"
    | "URL_PATH"
    | "SURROUNDING_TEXT"
    | "DESTINATION_PAGE"
    | "NONE";
};

type IntentInput = {
  label?: string | null;
  accessibleName?: string | null;
  href?: string | null;
  surroundingText?: string | null;
  destinationTitle?: string | null;
  destinationH1?: string[] | null;
  destinationText?: string | null;
  businessKind?: ActionBusinessKind;
};

const phraseGroups: Record<Exclude<BusinessIntentPurpose, "OTHER">, string[]> = {
  CONTACT: [
    "contact",
    "contact us",
    "get in touch",
    "reach us",
    "email us",
    "call us",
    "call now",
    "ask a question",
    "send a message",
    "speak with an advisor",
    "free consultation",
    "start your case",
  ],
  ORDER: [
    "order",
    "order now",
    "order online",
    "order inquiries",
    "ordering inquiries",
    "place an order",
    "place your order",
    "how to order",
    "pre order",
    "takeout",
    "take out",
    "pickup",
    "delivery",
    "catering inquiries",
  ],
  BOOKING: [
    "book",
    "book now",
    "book online",
    "book a consultation",
    "make an appointment",
    "schedule",
    "schedule service",
    "schedule a call",
    "reserve",
    "reserve a table",
    "reservation",
    "find a time",
    "check availability",
  ],
  QUOTE: [
    "request a quote",
    "get a quote",
    "request quote",
    "get an estimate",
    "request an estimate",
    "request service",
    "request a proposal",
    "start a project",
  ],
  PURCHASE: [
    "shop",
    "shop now",
    "buy",
    "buy now",
    "purchase",
    "add to cart",
    "checkout",
    "storefront",
  ],
  APPLICATION: ["apply", "apply now", "start application", "submit application"],
  DIRECTIONS: [
    "directions",
    "get directions",
    "find us",
    "location",
    "visit us",
    "view map",
  ],
  SUBSCRIBE: [
    "subscribe",
    "join the list",
    "join our newsletter",
    "email list",
    "mailing list",
    "join community",
  ],
  CHAT: ["chat", "live chat", "message us", "talk to us"],
};

const sourceWeights: Array<{
  source: BusinessIntentResult["source"];
  value: (input: IntentInput) => string;
  confidence: number;
}> = [
  {
    source: "DESTINATION_PAGE",
    value: (input) =>
      [
        input.destinationTitle,
        ...(input.destinationH1 ?? []),
        input.destinationText,
      ]
        .filter(Boolean)
        .join(" "),
    confidence: 0.96,
  },
  {
    source: "ACCESSIBLE_NAME",
    value: (input) => input.accessibleName ?? "",
    confidence: 0.94,
  },
  {
    source: "VISIBLE_TEXT",
    value: (input) => input.label ?? "",
    confidence: 0.92,
  },
  {
    source: "URL_PATH",
    value: (input) => safePath(input.href),
    confidence: 0.82,
  },
  {
    source: "SURROUNDING_TEXT",
    value: (input) => input.surroundingText ?? "",
    confidence: 0.72,
  },
];

export function classifyBusinessIntent(input: IntentInput): BusinessIntentResult {
  let best: BusinessIntentResult | null = null;

  for (const signal of sourceWeights) {
    const raw = signal.value(input);
    const normalized = normalizeIntentText(raw);
    if (!normalized) continue;

    for (const [purpose, phrases] of Object.entries(phraseGroups) as Array<
      [Exclude<BusinessIntentPurpose, "OTHER">, string[]]
    >) {
      const matched = phrases.filter((phrase) =>
        containsIntentPhrase(normalized, normalizeIntentText(phrase)),
      );
      if (matched.length === 0) continue;

      const contextualBoost = businessKindBoost(purpose, input.businessKind);
      const candidate: BusinessIntentResult = {
        purpose,
        confidence: Math.min(0.99, signal.confidence + contextualBoost),
        matchedSignals: matched.slice(0, 4),
        source: signal.source,
      };

      if (!best || candidate.confidence > best.confidence) {
        best = candidate;
      }
    }
  }

  if (best) {
    const directLabel = normalizeIntentText(
      input.accessibleName?.trim() || input.label?.trim() || "",
    );
    const hasSubstantiveUnmatchedLabel =
      best.source === "URL_PATH" &&
      directLabel.length > 0 &&
      !/^(?:learn more|more|click here|read more|go|open|visit)$/.test(
        directLabel,
      ) &&
      !Object.values(phraseGroups).some((phrases) =>
        phrases.some((phrase) =>
          containsIntentPhrase(directLabel, normalizeIntentText(phrase)),
        ),
      );

    return hasSubstantiveUnmatchedLabel
      ? {
          ...best,
          confidence: Math.min(best.confidence, 0.58),
          matchedSignals: [...best.matchedSignals, "URL_HINT_CONFLICTS_WITH_LABEL"],
        }
      : best;
  }

  return {
    purpose: "OTHER",
    confidence: 0,
    matchedSignals: [],
    source: "NONE",
  };
}

export function isCustomerContactOrConversionIntent(
  purpose: BusinessIntentPurpose,
) {
  return [
    "CONTACT",
    "ORDER",
    "BOOKING",
    "QUOTE",
    "PURCHASE",
    "APPLICATION",
    "CHAT",
  ].includes(purpose);
}

export function normalizeIntentText(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[%+]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsIntentPhrase(value: string, phrase: string) {
  if (!value || !phrase) return false;
  const paddedValue = ` ${value} `;
  if (paddedValue.includes(` ${phrase} `)) return true;

  const valueTokens = value.split(" ").map(stemToken);
  const phraseTokens = phrase.split(" ").map(stemToken);
  if (phraseTokens.length === 0 || phraseTokens.length > valueTokens.length) {
    return false;
  }

  return valueTokens.some((_, index) =>
    phraseTokens.every((token, offset) => valueTokens[index + offset] === token),
  );
}

function stemToken(value: string) {
  if (value.length <= 4) return value;
  return value
    .replace(/(?:ies)$/i, "y")
    .replace(/(?:ing|ers|er|ed)$/i, "")
    .replace(/s$/i, "");
}

function safePath(value?: string | null) {
  if (!value) return "";
  if (/^(?:mailto|tel):/i.test(value)) return value;
  try {
    const url = new URL(value, "https://intent.invalid");
    return `${url.pathname} ${url.searchParams.toString()}`;
  } catch {
    return value;
  }
}

function businessKindBoost(
  purpose: BusinessIntentPurpose,
  businessKind?: ActionBusinessKind,
) {
  if (businessKind === "restaurant" && purpose === "ORDER") return 0.04;
  if (businessKind === "local_service" && ["QUOTE", "BOOKING"].includes(purpose)) {
    return 0.04;
  }
  if (businessKind === "ecommerce" && purpose === "PURCHASE") return 0.04;
  if (businessKind === "saas" && ["BOOKING", "CONTACT"].includes(purpose)) {
    return 0.03;
  }
  return 0;
}
