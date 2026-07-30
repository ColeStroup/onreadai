export type CopyQualityIssue = {
  url: string;
  issueType:
    | "DUPLICATED_WORD"
    | "LIKELY_SPELLING"
    | "MALFORMED_CURRENCY"
    | "PLACEHOLDER_COPY";
  excerpt: string;
  suggestedCorrection: string;
  confidence: "HIGH" | "MEDIUM";
};

export type ThinContentAssessment = {
  status: "SUFFICIENT" | "THIN" | "EMPTY";
  mainContentWordCount: number;
  reason: string | null;
};

export type ConversionProcessAssessment = {
  applicable: boolean;
  conversionMethod:
    | "ORDER_FORM"
    | "EMAIL"
    | "PHONE"
    | "EXTERNAL_CHECKOUT"
    | "MANUAL_INQUIRY"
    | "UNKNOWN";
  estimatedManualSteps: number;
  formAvailable: boolean;
  emailOnly: boolean;
  phoneOnly: boolean;
  delayedConfirmation: boolean;
  externalInvoice: boolean;
  pricingClarity: "CLEAR" | "UNCLEAR" | "NOT_ASSESSED";
  fulfillmentClarity: "CLEAR" | "UNCLEAR" | "NOT_ASSESSED";
  frictionLevel: "NONE" | "LOW" | "MODERATE" | "HIGH" | "NOT_APPLICABLE";
  evidence: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type DuplicateContentGroup = {
  urls: string[];
  similarity: number;
  reason: "EXACT_MAIN_CONTENT" | "NEAR_DUPLICATE_MAIN_CONTENT";
};

const likelySpellingCorrections: Record<string, string> = {
  accomodate: "accommodate",
  accomodation: "accommodation",
  adress: "address",
  definately: "definitely",
  recieve: "receive",
  seperate: "separate",
  occassion: "occasion",
  availible: "available",
};

export function detectCopyQualityIssues({
  url,
  text,
  limit = 4,
}: {
  url: string;
  text: string;
  limit?: number;
}): CopyQualityIssue[] {
  const issues: CopyQualityIssue[] = [];
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return issues;

  const duplicated = normalized.match(/\b([a-z]{3,})\s+\1\b/i);
  if (
    duplicated &&
    !/^(very|had|that|bye)$/i.test(duplicated[1] ?? "")
  ) {
    issues.push({
      url,
      issueType: "DUPLICATED_WORD",
      excerpt: excerptAround(normalized, duplicated.index ?? 0, duplicated[0].length),
      suggestedCorrection: duplicated[1] ?? duplicated[0],
      confidence: "HIGH",
    });
  }

  for (const [misspelling, correction] of Object.entries(
    likelySpellingCorrections,
  )) {
    const match = new RegExp(`\\b${misspelling}\\b`, "i").exec(normalized);
    if (!match) continue;
    issues.push({
      url,
      issueType: "LIKELY_SPELLING",
      excerpt: excerptAround(normalized, match.index, match[0].length),
      suggestedCorrection: correction,
      confidence: "HIGH",
    });
    if (issues.length >= limit) return issues;
  }

  const malformedCurrency =
    /\$\s?\d+(?:\.\d{1,2})?\s+(?:dollars?|usd)\b/i.exec(normalized);
  if (malformedCurrency) {
    issues.push({
      url,
      issueType: "MALFORMED_CURRENCY",
      excerpt: excerptAround(
        normalized,
        malformedCurrency.index,
        malformedCurrency[0].length,
      ),
      suggestedCorrection: malformedCurrency[0].replace(
        /\s+(?:dollars?|usd)\b/i,
        "",
      ),
      confidence: "HIGH",
    });
  }

  const placeholder =
    /\b(lorem ipsum|placeholder text|coming soon(?:\s*\.{0,3})?|insert (?:text|copy) here|todo:?)\b/i.exec(
      normalized,
    );
  if (placeholder) {
    issues.push({
      url,
      issueType: "PLACEHOLDER_COPY",
      excerpt: excerptAround(normalized, placeholder.index, placeholder[0].length),
      suggestedCorrection:
        "Replace the placeholder with complete customer-facing copy or remove the unfinished section.",
      confidence: "HIGH",
    });
  }

  return issues.slice(0, limit);
}

export function assessThinContent({
  mainContentWordCount,
  pageTypes,
}: {
  mainContentWordCount: number;
  pageTypes: string[];
}): ThinContentAssessment {
  const compactUtilityPage = pageTypes.some((type) =>
    /contact|hours|map|location|shipping|returns/i.test(type),
  );
  const emptyThreshold = compactUtilityPage ? 12 : 25;
  const thinThreshold = compactUtilityPage ? 45 : 100;

  if (mainContentWordCount < emptyThreshold) {
    return {
      status: "EMPTY",
      mainContentWordCount,
      reason:
        "The extracted main content contains little beyond a page shell or navigation.",
    };
  }

  if (mainContentWordCount < thinThreshold) {
    return {
      status: "THIN",
      mainContentWordCount,
      reason: compactUtilityPage
        ? "The page is concise even after applying a lower threshold for utility pages."
        : "The extracted main content may not provide enough unique customer information.",
    };
  }

  return {
    status: "SUFFICIENT",
    mainContentWordCount,
    reason: null,
  };
}

export function analyzeConversionProcess({
  text,
  formLabels,
  actionTypes,
}: {
  text: string;
  formLabels: string[];
  actionTypes: string[];
}): ConversionProcessAssessment {
  const normalized = text.replace(/\s+/g, " ").trim();
  const orderRelevant =
    /\b(order|pre[- ]?order|purchase|buy|invoice|pickup|delivery|fulfillment)\b/i.test(
      normalized,
    ) ||
    actionTypes.some((type) => /order|buy|shop|takeout/i.test(type));

  if (!orderRelevant) {
    return {
      applicable: false,
      conversionMethod: "UNKNOWN",
      estimatedManualSteps: 0,
      formAvailable: formLabels.length > 0,
      emailOnly: false,
      phoneOnly: false,
      delayedConfirmation: false,
      externalInvoice: false,
      pricingClarity: "NOT_ASSESSED",
      fulfillmentClarity: "NOT_ASSESSED",
      frictionLevel: "NOT_APPLICABLE",
      evidence: [],
      confidence: "LOW",
    };
  }

  const formAvailable =
    formLabels.length > 0 &&
    formLabels.some((label) =>
      /name|email|phone|order|quantity|message|pickup|delivery|submit/i.test(
        label,
      ),
    );
  const hasEmailInstruction =
    /\b(email|send (?:us|me) an email|email your order)\b/i.test(normalized);
  const hasPhoneInstruction =
    /\b(call|text|phone)\b.{0,35}\b(order|place|submit|request)\b/i.test(
      normalized,
    );
  const externalInvoice =
    /\b(invoice|payment link|payment request)\b/i.test(normalized);
  const delayedConfirmation =
    /\b(we(?:'ll| will) (?:confirm|reply|respond)|confirmation (?:will|is) sent|wait for confirmation|within \d+ (?:hours?|days?))\b/i.test(
      normalized,
    );
  const requiredDetailMatches = normalized.match(
    /\b(name|email|phone|quantity|flavo(?:u)?r|size|pickup (?:date|time)|delivery (?:address|date|time)|allerg(?:y|ies)|customization)\b/gi,
  );
  const requiredDetailCount = new Set(
    (requiredDetailMatches ?? []).map((value) => value.toLowerCase()),
  ).size;
  const numberedSteps = normalized.match(
    /(?:^|\s)(?:step\s*)?\d+[.)]\s+[a-z]/gi,
  )?.length ?? 0;
  const sequencingSteps = normalized.match(
    /\b(first|then|next|after that|finally|once confirmed)\b/gi,
  )?.length ?? 0;
  const estimatedManualSteps = Math.min(
    8,
    Math.max(
      hasEmailInstruction || hasPhoneInstruction ? 1 : 0,
      numberedSteps,
      sequencingSteps,
      requiredDetailCount >= 4 ? 3 : requiredDetailCount >= 2 ? 2 : 1,
      externalInvoice ? 3 : 0,
      delayedConfirmation ? 3 : 0,
    ),
  );
  const emailOnly =
    hasEmailInstruction &&
    !formAvailable &&
    !actionTypes.some((type) => /buy|shop|checkout|order \/ takeout/i.test(type));
  const phoneOnly = hasPhoneInstruction && !formAvailable && !hasEmailInstruction;
  const pricingClarity = /\$\s?\d|pricing|price(?:s| list)?\b/i.test(normalized)
    ? "CLEAR"
    : "UNCLEAR";
  const fulfillmentClarity =
    /\b(pickup|pick up|delivery|ship(?:ping)?|service area)\b/i.test(normalized)
      ? "CLEAR"
      : "UNCLEAR";
  const frictionSignals = [
    emailOnly,
    phoneOnly,
    externalInvoice,
    delayedConfirmation,
    estimatedManualSteps >= 3,
    requiredDetailCount >= 4 && !formAvailable,
  ].filter(Boolean).length;
  const evidence = [
    emailOnly ? "Ordering appears to rely on email rather than a structured form." : null,
    phoneOnly ? "Ordering appears to rely on a phone call or text." : null,
    externalInvoice ? "Payment or confirmation references an invoice or later payment link." : null,
    delayedConfirmation ? "The process requires a later manual confirmation." : null,
    requiredDetailCount >= 4 && !formAvailable
      ? `${requiredDetailCount} order-detail types are requested, but no matching structured order form was detected.`
      : null,
    estimatedManualSteps >= 3
      ? `The visible instructions imply about ${estimatedManualSteps} manual steps.`
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    applicable: true,
    conversionMethod: formAvailable
      ? "ORDER_FORM"
      : emailOnly
        ? "EMAIL"
        : phoneOnly
          ? "PHONE"
          : externalInvoice || delayedConfirmation
            ? "MANUAL_INQUIRY"
            : actionTypes.some((type) => /buy|shop|checkout/i.test(type))
              ? "EXTERNAL_CHECKOUT"
              : "UNKNOWN",
    estimatedManualSteps,
    formAvailable,
    emailOnly,
    phoneOnly,
    delayedConfirmation,
    externalInvoice,
    pricingClarity,
    fulfillmentClarity,
    frictionLevel:
      frictionSignals >= 3
        ? "HIGH"
        : frictionSignals >= 2
          ? "MODERATE"
          : frictionSignals === 1
            ? "LOW"
            : "NONE",
    evidence,
    confidence: evidence.length >= 2 ? "HIGH" : evidence.length === 1 ? "MEDIUM" : "LOW",
  };
}

export function detectDuplicateContentGroups(
  pages: Array<{
    url: string;
    content: string | null;
    contentHash?: string | null;
    mainContentWordCount: number;
  }>,
): DuplicateContentGroup[] {
  const eligible = pages.filter(
    (page) => page.content && page.mainContentWordCount >= 60,
  );
  const groups: DuplicateContentGroup[] = [];
  const consumed = new Set<string>();

  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    const left = eligible[leftIndex]!;
    if (consumed.has(left.url)) continue;
    const matches = [left.url];
    let strongestSimilarity = 0;
    let exact = false;

    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const right = eligible[rightIndex]!;
      if (consumed.has(right.url)) continue;
      const isExact =
        Boolean(left.contentHash) && left.contentHash === right.contentHash;
      const similarity = isExact
        ? 1
        : jaccardSimilarity(left.content ?? "", right.content ?? "");
      if (similarity < 0.78) continue;
      matches.push(right.url);
      strongestSimilarity = Math.max(strongestSimilarity, similarity);
      exact ||= isExact;
    }

    if (matches.length < 2) continue;
    for (const url of matches) consumed.add(url);
    groups.push({
      urls: matches,
      similarity: Math.round((strongestSimilarity || 1) * 100) / 100,
      reason: exact ? "EXACT_MAIN_CONTENT" : "NEAR_DUPLICATE_MAIN_CONTENT",
    });
  }

  return groups.slice(0, 6);
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return overlap / union;
}

function tokenSet(value: string) {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const shingles = new Set<string>();
  for (let index = 0; index < words.length - 2; index += 1) {
    shingles.add(words.slice(index, index + 3).join(" "));
  }
  return shingles;
}

function excerptAround(value: string, index: number, length: number) {
  const start = Math.max(0, index - 45);
  const end = Math.min(value.length, index + length + 45);
  return value.slice(start, end).trim().slice(0, 180);
}
