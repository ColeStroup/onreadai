import { ScoreCategory } from "@prisma/client";

import type {
  CandidateFinding,
  PlainLanguageFinding,
  SpecialistCategory,
  SpecialistReadiness,
} from "@/lib/audits/quality/types";

export const PLAIN_LANGUAGE_STANDARD_VERSION = "audit-plain-language-v1";

export function buildPlainLanguageFinding(
  candidate: CandidateFinding,
): PlainLanguageFinding {
  const text = `${candidate.ruleId} ${candidate.claim} ${candidate.description}`.toLowerCase();

  if (/meta description/.test(text)) {
    return response({
      whatThisMeans:
        "This page does not have a search description. This is the short sentence Google may show below the page title.",
      whyItMatters:
        "A clear description can help people understand what the page offers before they click.",
      whatToDo:
        "Write one short, accurate sentence that names the offer and who it is for.",
      fixability: "MAY_REQUIRE_WEBSITE_ACCESS",
      specialist: "SEO_CONTENT_SPECIALIST",
      check:
        "Onread will fetch the page again and check that a nonempty search description exists.",
    });
  }

  if (/\bh1\b|main heading/.test(text)) {
    const missing = /missing|no h1|count[^0-9]*0/.test(text);
    return response({
      whatThisMeans: missing
        ? "This page does not have one clear main heading. The main heading tells people what the page is about."
        : "This page uses more than one top-level heading. That can make the page structure less clear.",
      whyItMatters:
        "A clear heading helps visitors and search tools understand the page quickly.",
      whatToDo: missing
        ? "Add one main heading that states the page topic in plain words."
        : "Ask the site editor to confirm which heading is the main one. Keep the rest as section headings when practical.",
      fixability: "MAY_REQUIRE_WEBSITE_ACCESS",
      specialist: "WEBSITE_DEVELOPER",
      check: missing
        ? "Onread will fetch the page again and check that a visible main heading exists."
        : "Onread will fetch the page again and recount its top-level headings.",
    });
  }

  if (/contact-path:broken|did not load|broken.*(?:contact|order)/.test(text)) {
    return response({
      whatThisMeans:
        "The site shows a customer action, but the linked page did not load during the audit.",
      whyItMatters:
        "A broken action can stop a customer before they can contact, book, or order.",
      whatToDo:
        "Open the action from the live homepage. Restore its page or replace the link with the correct destination.",
      fixability: "MAY_REQUIRE_WEBSITE_ACCESS",
      specialist: "WEBSITE_DEVELOPER",
      check:
        "Onread will open the same action again and check that its destination returns a usable page.",
    });
  }

  if (/contact-path|contact path|contact the business/.test(text)) {
    return response({
      whatThisMeans:
        "Onread could not verify a clear way for a visitor to contact, book, order, request a quote, buy, apply, or chat.",
      whyItMatters:
        "Visitors need a clear next step when they are ready to act.",
      whatToDo:
        "Add one visible customer action that fits the business, then link it to a working destination.",
      fixability: "MAY_REQUIRE_WEBSITE_ACCESS",
      specialist: "UX_CONVERSION_SPECIALIST",
      check:
        "Onread will look for a visible customer action and verify its destination when the page is in crawl scope.",
    });
  }

  if (/primary cta|primary visitor action|call to action/.test(text)) {
    return response({
      whatThisMeans:
        "The page has customer actions, but the static page structure did not prove which one should come first.",
      whyItMatters:
        "A clear first step can reduce the effort needed to decide what to do next.",
      whatToDo:
        "Choose the most useful customer action and give it stronger placement than secondary links.",
      fixability: "MAY_REQUIRE_WEBSITE_ACCESS",
      specialist: "UX_CONVERSION_SPECIALIST",
      check:
        "Onread will recheck the action labels, page region, button structure, and destination purpose.",
    });
  }

  if (/alt text/.test(text)) {
    return response({
      whatThisMeans:
        "Some images do not have text that explains their purpose to people using a screen reader.",
      whyItMatters:
        "Useful image text can make important content easier to understand and can help search tools read the page.",
      whatToDo:
        "Add short, useful text to meaningful images. Leave decorative images empty when your site tool supports that choice.",
      fixability: "EASY_TO_DO_YOURSELF",
      specialist: "ACCESSIBILITY_SPECIALIST",
      check:
        "Onread will fetch the page again and count meaningful images that still lack alt text.",
    });
  }

  if (/canonical/.test(text)) {
    return response({
      whatThisMeans:
        "The page does not clearly name its preferred web address for search tools.",
      whyItMatters:
        "A preferred address can help search tools group duplicate page versions correctly.",
      whatToDo:
        "Add or correct the canonical link in the page SEO settings. Ask a developer if the site creates many URL versions.",
      fixability: "BETTER_HANDLED_BY_SPECIALIST",
      specialist: "TECHNICAL_SEO_SPECIALIST",
      check:
        "Onread will fetch the page source and compare the canonical address with the final page address.",
    });
  }

  if (/robots\.txt|sitemap/.test(text)) {
    const robots = /robots/.test(text);
    return response({
      whatThisMeans: robots
        ? "Onread could not verify a readable robots.txt file. This file gives crawl instructions to search tools."
        : "Onread could not verify a readable sitemap. A sitemap lists important pages for search tools.",
      whyItMatters:
        "This setup can make it easier for search tools to discover and interpret the site, but it does not guarantee rankings.",
      whatToDo: robots
        ? "Check the site's robots.txt settings and publish a valid file at the main domain."
        : "Create or enable the site's sitemap and make sure it opens at the saved address.",
      fixability: "BETTER_HANDLED_BY_SPECIALIST",
      specialist: "TECHNICAL_SEO_SPECIALIST",
      check: robots
        ? "Onread will request robots.txt again and check that it returns readable text."
        : "Onread will request the sitemap again and check that it returns readable sitemap content.",
    });
  }

  if (/title/.test(text) && candidate.category === ScoreCategory.SEO) {
    return response({
      whatThisMeans:
        "This page needs a clearer search title. The search title is the page name a search engine may show.",
      whyItMatters:
        "A clear title helps people and search tools understand the page topic.",
      whatToDo:
        "Write a direct title that names the page topic and the business when that is useful.",
      fixability: "EASY_TO_DO_YOURSELF",
      specialist: "SEO_CONTENT_SPECIALIST",
      check:
        "Onread will fetch the page again and verify that a nonempty, relevant title exists.",
    });
  }

  return response({
    whatThisMeans: candidate.description,
    whyItMatters:
      candidate.category === ScoreCategory.SEO
        ? "This can affect how clearly search tools and potential visitors understand the page."
        : "This can affect how quickly a visitor understands the page and finds the next step.",
    whatToDo:
      "Review the saved evidence first. Make the smallest change that satisfies the stated check.",
    fixability: "MAY_REQUIRE_WEBSITE_ACCESS",
    specialist:
      candidate.category === ScoreCategory.SEO
        ? "TECHNICAL_SEO_SPECIALIST"
        : "WEBSITE_DEVELOPER",
    check:
      "Onread will repeat the saved evidence check on the affected page after the change.",
  });
}

export function buildSpecialistReadiness(
  candidate: CandidateFinding,
  plainLanguage: PlainLanguageFinding,
): SpecialistReadiness {
  const text = `${candidate.ruleId} ${candidate.claim}`.toLowerCase();
  const accessLevel = /meta description|title/.test(text)
    ? ("SEO_SETTINGS" as const)
    : /robots|sitemap|canonical/.test(text)
      ? ("SERVER_OR_DNS" as const)
      : /h1|cta|contact|link|alt text/.test(text)
        ? ("CONTENT_EDITOR" as const)
        : ("UNKNOWN" as const);
  const objectivelyVerifiable =
    candidate.verificationType === "DETERMINISTIC" &&
    candidate.classification !== "OPTIONAL_REFINEMENT";

  return {
    suggestedSpecialist: plainLanguage.whoCanHelp,
    supportedPlatform: null,
    requiredAccessLevel: accessLevel,
    estimatedComplexity:
      plainLanguage.ownerFixability === "EASY_TO_DO_YOURSELF"
        ? "LOW"
        : accessLevel === "SERVER_OR_DNS"
          ? "HIGH"
          : "MEDIUM",
    verificationMethod: plainLanguage.howOnreadWillCheck,
    objectivelyVerifiable,
    ownerApprovalRequired: true,
    requiredCompletionCriteria: [requiredOutcome(candidate)],
    explicitExclusions: verificationExclusions(candidate),
  };
}

function response(input: {
  whatThisMeans: string;
  whyItMatters: string;
  whatToDo: string;
  fixability: PlainLanguageFinding["ownerFixability"];
  specialist: SpecialistCategory;
  check: string;
}): PlainLanguageFinding {
  return {
    whatThisMeans: input.whatThisMeans,
    whyItMatters: input.whyItMatters,
    whatToDo: input.whatToDo,
    ownerFixability: input.fixability,
    ownerFixabilityLabel: fixabilityLabel(input.fixability),
    whoCanHelp: input.specialist,
    whoCanHelpLabel: specialistLabel(input.specialist),
    howOnreadWillCheck: input.check,
  };
}

function requiredOutcome(candidate: CandidateFinding) {
  const text = `${candidate.ruleId} ${candidate.claim}`.toLowerCase();
  if (/meta description/.test(text)) return "A nonempty meta description exists.";
  if (/h1/.test(text) && /missing|no h1/.test(text)) {
    return "A visible top-level heading exists on the affected page.";
  }
  if (/contact-path:broken|broken.*(?:contact|order)/.test(text)) {
    return "The saved customer action opens a usable destination.";
  }
  if (/contact-path|contact path/.test(text)) {
    return "A visible, usable customer contact or conversion path exists.";
  }
  return "The original evidence condition is no longer detected.";
}

function verificationExclusions(candidate: CandidateFinding) {
  const text = `${candidate.ruleId} ${candidate.claim}`.toLowerCase();
  if (/meta description/.test(text)) {
    return [
      "Preferred character length",
      "Alternative wording preferences",
      "Guaranteed ranking or click changes",
    ];
  }
  if (/primary cta/.test(text)) {
    return ["A specific button color", "A specific phrase", "Guaranteed conversion lift"];
  }
  return ["New opportunities outside the original finding", "Guaranteed business results"];
}

function fixabilityLabel(value: PlainLanguageFinding["ownerFixability"]) {
  const labels: Record<PlainLanguageFinding["ownerFixability"], string> = {
    EASY_TO_DO_YOURSELF: "Easy to do yourself",
    MAY_REQUIRE_WEBSITE_ACCESS: "May require website access",
    BETTER_HANDLED_BY_SPECIALIST: "Better handled by a specialist",
    REQUIRES_TECHNICAL_REVIEW: "Requires technical review",
  };
  return labels[value];
}

function specialistLabel(value: SpecialistCategory) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .replace("Seo", "SEO")
    .replace("Ux", "UX");
}

