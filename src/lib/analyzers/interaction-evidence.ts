import { createHash } from "node:crypto";

import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

import {
  BUSINESS_INTENT_ONTOLOGY_VERSION,
  classifyBusinessIntent,
  isCustomerContactOrConversionIntent,
  type BusinessIntentPurpose,
} from "@/lib/analyzers/business-intent";
import type { ActionBusinessKind } from "@/lib/analyzers/action-classifier";

export const INTERACTION_EXTRACTION_VERSION = "interaction-evidence-v1";

export type InteractionDomRegion =
  | "HEADER"
  | "PRIMARY_NAVIGATION"
  | "SECONDARY_NAVIGATION"
  | "HERO"
  | "BODY"
  | "FOOTER"
  | "FLOATING"
  | "UNKNOWN";

export type InteractionVisibility = "VISIBLE" | "ACCESSIBLE_ONLY" | "HIDDEN";

export type ExtractedInteractionEvidence = {
  id: string;
  sourceUrl: string;
  visibleText: string | null;
  accessibleName: string | null;
  elementType: string;
  destinationUrl: string | null;
  destinationPurpose: BusinessIntentPurpose;
  destinationStatus?:
    | "ANALYZED"
    | "FAILED"
    | "NOT_CRAWLED"
    | "EXTERNAL"
    | "NON_HTTP";
  intentConfidence: number;
  intentSignals: string[];
  domRegion: InteractionDomRegion;
  relativeProminence: number;
  visibility: InteractionVisibility;
  repeated: boolean;
  surroundingText: string | null;
  extractionMethod: "STATIC_HTML" | "RENDERED_HTML";
  analyzerVersion: string;
};

export type ContactEvidenceSummary = {
  hasAnyContactPath: boolean;
  contactPathEvidenceIds: string[];
  allContactEvidenceIds?: string[];
  usableContactPathEvidenceIds?: string[];
  brokenContactPathEvidenceIds?: string[];
  contactSectionHeadings: string[];
  contactSectionEvidenceIds?: string[];
  visibleEmailAddresses: string[];
  visibleEmailEvidenceIds?: string[];
  visiblePhoneNumbers: string[];
  visiblePhoneEvidenceIds?: string[];
  hasContactForm: boolean;
  contactFormEvidenceIds: string[];
  detectedPurposes: BusinessIntentPurpose[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type InteractionExtractionResult = {
  interactions: ExtractedInteractionEvidence[];
  contact: ContactEvidenceSummary;
};

export function extractInteractionEvidence({
  $,
  pageUrl,
  businessKind = "general",
  extractionMethod = "STATIC_HTML",
}: {
  $: CheerioAPI;
  pageUrl: string;
  businessKind?: ActionBusinessKind;
  extractionMethod?: ExtractedInteractionEvidence["extractionMethod"];
}): InteractionExtractionResult {
  const draft = $(
    "a[href], button, [role='button'], form, input[type='submit'], input[type='button']",
  )
    .map((_, rawElement) => {
      const element = rawElement as Element;
      const node = $(element);
      const elementType = element.tagName?.toLowerCase() ?? "unknown";
      const visibleText = cleanText(
        elementType === "input"
          ? node.attr("value") ?? ""
          : node.clone().find("svg, style, script").remove().end().text(),
      );
      const accessibleName = accessibleElementName($, element, visibleText);
      const rawDestination =
        node.attr("href") ?? node.attr("action") ?? node.attr("data-href") ?? "";
      const destinationUrl = resolveDestination(rawDestination, pageUrl);
      const surroundingText = nearbyText($, element);
      const visibility = elementVisibility($, element);
      const domRegion = elementRegion($, element);
      const intent = classifyBusinessIntent({
        label: visibleText,
        accessibleName,
        href: destinationUrl ?? rawDestination,
        surroundingText,
        businessKind,
      });
      const id = interactionId({
        pageUrl,
        elementType,
        accessibleName,
        destinationUrl,
        domRegion,
      });

      return {
        id,
        sourceUrl: pageUrl,
        visibleText: visibleText || null,
        accessibleName: accessibleName || null,
        elementType,
        destinationUrl,
        destinationPurpose: intent.purpose,
        destinationStatus: /^(?:mailto|tel):/i.test(destinationUrl ?? "")
          ? "NON_HTTP"
          : undefined,
        intentConfidence: intent.confidence,
        intentSignals: intent.matchedSignals,
        domRegion,
        relativeProminence: prominenceScore($, element, domRegion),
        visibility,
        repeated: false,
        surroundingText: surroundingText || null,
        extractionMethod,
        analyzerVersion: `${INTERACTION_EXTRACTION_VERSION}:${BUSINESS_INTENT_ONTOLOGY_VERSION}`,
      } satisfies ExtractedInteractionEvidence;
    })
    .get();

  const occurrenceCount = new Map<string, number>();
  for (const interaction of draft) {
    const key = repetitionKey(interaction);
    occurrenceCount.set(key, (occurrenceCount.get(key) ?? 0) + 1);
  }
  const interactions = dedupeInteractions(
    draft.map((interaction) => ({
      ...interaction,
      repeated: (occurrenceCount.get(repetitionKey(interaction)) ?? 0) > 1,
    })),
  ).slice(0, 180);

  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript, template, svg, canvas").remove();
  bodyClone.find("[hidden], [aria-hidden='true']").remove();
  const visibleBodyText = cleanText(bodyClone.text());
  const visibleEmailAddresses = unique(
    visibleBodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
  ).slice(0, 12);
  const visiblePhoneNumbers = unique(
    visibleBodyText.match(
      /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g,
    ) ?? [],
  ).slice(0, 12);
  const contactSectionHeadings = unique(
    $("h1, h2, h3, h4, [role='heading']")
      .map((_, element) => cleanText($(element).text()))
      .get()
      .filter((value) =>
        /\b(contact(?: us)?|get in touch|reach us|order(?:ing)? inquiries?|catering inquiries?|ask a question|send (?:us )?a message)\b/i.test(
          value,
        ),
      ),
  ).slice(0, 12);
  const contactSectionEvidenceIds = contactSectionHeadings.map((heading) =>
    contactSignalEvidenceId(pageUrl, "heading", heading),
  );
  const visibleEmailEvidenceIds = visibleEmailAddresses.map((email) =>
    contactSignalEvidenceId(pageUrl, "email", email),
  );
  const visiblePhoneEvidenceIds = visiblePhoneNumbers.map((phone) =>
    contactSignalEvidenceId(pageUrl, "phone", phone),
  );
  const contactFormEvidenceIds = interactions
    .filter(
      (interaction) =>
        interaction.elementType === "form" &&
        interaction.visibility !== "HIDDEN" &&
        (isCustomerContactOrConversionIntent(interaction.destinationPurpose) ||
          /contact|message|question|inquir|quote|book|order/i.test(
            interaction.surroundingText ?? "",
          )),
    )
    .map((interaction) => interaction.id);
  const contactPathEvidenceIds = interactions
    .filter(
      (interaction) =>
        interaction.visibility !== "HIDDEN" &&
        interaction.intentConfidence >= 0.7 &&
        isCustomerContactOrConversionIntent(interaction.destinationPurpose),
    )
    .map((interaction) => interaction.id);
  const hasAnyContactPath =
    contactPathEvidenceIds.length > 0 ||
    contactSectionHeadings.length > 0 ||
    visibleEmailAddresses.length > 0 ||
    visiblePhoneNumbers.length > 0 ||
    contactFormEvidenceIds.length > 0;
  const strongestInteractionConfidence = interactions
    .filter((interaction) => contactPathEvidenceIds.includes(interaction.id))
    .reduce((maximum, interaction) => Math.max(maximum, interaction.intentConfidence), 0);

  return {
    interactions,
    contact: {
      hasAnyContactPath,
      contactPathEvidenceIds: unique(contactPathEvidenceIds),
      allContactEvidenceIds: unique([
        ...contactPathEvidenceIds,
        ...contactFormEvidenceIds,
        ...contactSectionEvidenceIds,
        ...visibleEmailEvidenceIds,
        ...visiblePhoneEvidenceIds,
      ]),
      usableContactPathEvidenceIds: unique(contactPathEvidenceIds),
      brokenContactPathEvidenceIds: [],
      contactSectionHeadings,
      contactSectionEvidenceIds,
      visibleEmailAddresses,
      visibleEmailEvidenceIds,
      visiblePhoneNumbers,
      visiblePhoneEvidenceIds,
      hasContactForm: contactFormEvidenceIds.length > 0,
      contactFormEvidenceIds: unique(contactFormEvidenceIds),
      detectedPurposes: unique(
        interactions
          .filter((interaction) => contactPathEvidenceIds.includes(interaction.id))
          .map((interaction) => interaction.destinationPurpose),
      ),
      confidence:
        contactSectionHeadings.length > 0 ||
        visibleEmailAddresses.length > 0 ||
        visiblePhoneNumbers.length > 0 ||
        strongestInteractionConfidence >= 0.9
          ? "HIGH"
          : hasAnyContactPath
            ? "MEDIUM"
            : "LOW",
    },
  };
}

export function contactSignalEvidenceId(
  pageUrl: string,
  kind: "heading" | "email" | "phone",
  value: string,
) {
  return `contact_${createHash("sha256")
    .update(`${pageUrl}|${kind}|${value.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 20)}`;
}

export function enrichInteractionDestinationPurpose({
  interaction,
  destinationTitle,
  destinationH1,
  destinationText,
  destinationStatus,
  businessKind = "general",
}: {
  interaction: ExtractedInteractionEvidence;
  destinationTitle?: string | null;
  destinationH1?: string[] | null;
  destinationText?: string | null;
  destinationStatus?: ExtractedInteractionEvidence["destinationStatus"];
  businessKind?: ActionBusinessKind;
}): ExtractedInteractionEvidence {
  const intent = classifyBusinessIntent({
    label: interaction.visibleText,
    accessibleName: interaction.accessibleName,
    href: interaction.destinationUrl,
    surroundingText: interaction.surroundingText,
    destinationTitle,
    destinationH1,
    destinationText,
    businessKind,
  });

  if (intent.confidence <= interaction.intentConfidence) {
    return destinationStatus ? { ...interaction, destinationStatus } : interaction;
  }
  return {
    ...interaction,
    destinationStatus: destinationStatus ?? interaction.destinationStatus,
    destinationPurpose: intent.purpose,
    intentConfidence: intent.confidence,
    intentSignals: unique([...interaction.intentSignals, ...intent.matchedSignals]),
  };
}

function accessibleElementName(
  $: CheerioAPI,
  element: Element,
  visibleText: string,
) {
  const node = $(element);
  const labelledBy = (node.attr("aria-labelledby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => cleanText($(`#${escapeId(id)}`).first().text()))
    .filter(Boolean)
    .join(" ");
  const imageAlt = cleanText(
    node
      .find("img[alt]")
      .map((_, image) => $(image).attr("alt") ?? "")
      .get()
      .join(" "),
  );

  return cleanText(
    [
      node.attr("aria-label"),
      labelledBy,
      visibleText,
      imageAlt,
      node.attr("title"),
      node.attr("value"),
    ].find((value) => Boolean(value?.trim())) ?? "",
  );
}

function elementVisibility($: CheerioAPI, element: Element): InteractionVisibility {
  const node = $(element);
  const hiddenAncestor = node.closest("[hidden], [aria-hidden='true']");
  const styleText = `${node.attr("style") ?? ""} ${node
    .parents()
    .slice(0, 4)
    .map((_, parent) => $(parent).attr("style") ?? "")
    .get()
    .join(" ")}`;
  if (
    hiddenAncestor.length > 0 ||
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(styleText)
  ) {
    return "HIDDEN";
  }

  const classText = `${node.attr("class") ?? ""} ${node
    .parents()
    .slice(0, 3)
    .map((_, parent) => $(parent).attr("class") ?? "")
    .get()
    .join(" ")}`;
  if (/\b(sr-only|screen-reader|visually-hidden|a11y-hidden)\b/i.test(classText)) {
    return node.attr("aria-label") || node.attr("aria-labelledby")
      ? "ACCESSIBLE_ONLY"
      : "HIDDEN";
  }
  return "VISIBLE";
}

function elementRegion($: CheerioAPI, element: Element): InteractionDomRegion {
  const node = $(element);
  if (node.closest("footer").length > 0) return "FOOTER";
  if (
    node.closest("[class*='floating'], [class*='sticky'], [class*='chat-widget']")
      .length > 0
  ) {
    return "FLOATING";
  }
  if (
    node.closest(
      "[class*='hero'], [class*='Hero'], [id*='hero'], [id*='Hero'], [class*='banner'], [class*='Banner']",
    ).length > 0
  ) {
    return "HERO";
  }
  if (node.closest("nav").length > 0) {
    return node.closest("header").length > 0
      ? "PRIMARY_NAVIGATION"
      : "SECONDARY_NAVIGATION";
  }
  if (node.closest("header").length > 0) return "HEADER";
  if (node.closest("main, [role='main'], article, section").length > 0) {
    return "BODY";
  }
  return "UNKNOWN";
}

function prominenceScore(
  $: CheerioAPI,
  element: Element,
  region: InteractionDomRegion,
) {
  const node = $(element);
  const role = (node.attr("role") ?? "").toLowerCase();
  const className = node.attr("class") ?? "";
  const buttonLike =
    element.tagName === "button" ||
    role === "button" ||
    /(?:^|\s)(?:btn|button|cta)(?:\s|$|-|_)/i.test(className);
  let score = buttonLike ? 4 : 1;
  if (region === "HERO") score += 3;
  if (region === "BODY") score += 1;
  if (region === "PRIMARY_NAVIGATION" || region === "HEADER") score += 2;
  if (region === "FOOTER") score -= 1;
  if (node.closest("section, main").find("h1").length > 0) score += 1;
  return Math.max(0, Math.min(10, score));
}

function nearbyText($: CheerioAPI, element: Element) {
  const node = $(element);
  const container = node.closest("section, article, form, li, p, div").first();
  const text = cleanText(container.length > 0 ? container.text() : node.parent().text());
  return text.slice(0, 280);
}

function resolveDestination(raw: string, pageUrl: string) {
  const value = raw.trim();
  if (!value) return null;
  if (/^(?:mailto|tel):/i.test(value)) return value;
  if (/^(?:javascript|data|file):/i.test(value)) return null;
  try {
    const url = new URL(value, pageUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function interactionId(input: {
  pageUrl: string;
  elementType: string;
  accessibleName: string;
  destinationUrl: string | null;
  domRegion: InteractionDomRegion;
}) {
  const logical = [
    comparableUrl(input.pageUrl),
    input.elementType,
    cleanText(input.accessibleName).toLowerCase(),
    input.destinationUrl ? comparableUrl(input.destinationUrl) : "no-destination",
    input.domRegion,
  ].join("|");
  return `interaction-${createHash("sha256").update(logical).digest("hex").slice(0, 18)}`;
}

function comparableUrl(value: string) {
  if (/^(?:mailto|tel):/i.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function repetitionKey(interaction: ExtractedInteractionEvidence) {
  return `${interaction.accessibleName?.toLowerCase() ?? ""}|${interaction.destinationUrl ? comparableUrl(interaction.destinationUrl) : ""}`;
}

function dedupeInteractions(values: ExtractedInteractionEvidence[]) {
  const byId = new Map<string, ExtractedInteractionEvidence>();
  for (const value of values) {
    const current = byId.get(value.id);
    if (!current || value.relativeProminence > current.relativeProminence) {
      byId.set(value.id, value);
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      right.relativeProminence - left.relativeProminence ||
      left.id.localeCompare(right.id),
  );
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeId(value: string) {
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function unique<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}
