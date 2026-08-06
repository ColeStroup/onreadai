import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import type { BusinessModelClassification } from "@/lib/business-model";
import {
  canonicalReportUrl,
  isReportHomepagePath,
  reportPageLabel,
} from "@/lib/reports/report-urls";

export type CanonicalPagePurposeStatus =
  | "DEDICATED_PAGE"
  | "EQUIVALENT_SECTION"
  | "EQUIVALENT_CONVERSION_PATH"
  | "DISCOVERED_BUT_SKIPPED"
  | "NOT_DETECTED"
  | "NOT_EXPECTED"
  | "UNABLE_TO_DETERMINE";

export type CanonicalPagePurpose = {
  purpose: string;
  status: CanonicalPagePurposeStatus;
  pageIds: string[];
  explanation: string;
};

export type PurposePage = {
  pageId: string;
  url: string;
  label: string;
  pageTypes: string[];
  title: string | null;
  h1Text: string[];
  contactSignals: string[];
  contentExcerpt: string | null;
  analysisStatus: "ANALYZED" | "FAILED";
};

const publicLocationModels = new Set([
  "RESTAURANT",
  "CAFE",
  "LOCAL_RETAIL",
  "APPOINTMENT_BUSINESS",
]);

const purposeOrder = [
  "Homepage",
  "Contact",
  "About",
  "Services",
  "Products",
  "Menu",
  "Store / Gift Cards",
  "Order / Takeout",
  "Pricing",
  "Location",
  "Map",
  "Hours",
  "Reviews",
  "Testimonials",
  "FAQ",
];

export function buildPagePurposeCoverage({
  pages,
  website,
  crawl,
  businessModel,
}: {
  pages: PurposePage[];
  website: WebsiteAnalysis | null;
  crawl: WebsiteCrawlResult | null;
  businessModel: BusinessModelClassification;
}): CanonicalPagePurpose[] {
  const purposes = new Set<string>([
    "Homepage",
    ...(crawl?.scannedImportantPages.map((item) => item.type) ?? []),
    ...(crawl?.skippedImportantPages.map((item) => item.type) ?? []),
    ...(crawl?.missingImportantPageTypes ?? []),
  ]);
  if (businessModel.model === "COTTAGE_FOOD") {
    [
      "Contact",
      "About",
      "Store / Gift Cards",
      "Location",
      "Map",
      "Hours",
      "Reviews",
      "Testimonials",
      "FAQ",
    ].forEach((purpose) => purposes.add(purpose));
  }

  return [...purposes]
    .sort(
      (left, right) =>
        purposeRank(left) - purposeRank(right) || left.localeCompare(right),
    )
    .map((purpose) =>
      purposeCoverage({ purpose, pages, website, crawl, businessModel }),
    );
}

function purposeCoverage({
  purpose,
  pages,
  website,
  crawl,
  businessModel,
}: {
  purpose: string;
  pages: PurposePage[];
  website: WebsiteAnalysis | null;
  crawl: WebsiteCrawlResult | null;
  businessModel: BusinessModelClassification;
}): CanonicalPagePurpose {
  const analyzedPages = pages.filter(
    (page) => page.analysisStatus === "ANALYZED",
  );
  const dedicated = analyzedPages.filter((page) =>
    page.pageTypes.some((type) => purposeMatches(type, purpose)),
  );
  if (purpose === "Homepage") {
    const homepage = analyzedPages.find((page) => {
      const parsed = canonicalReportUrl(page.url);
      return (
        (parsed && isReportHomepagePath(parsed.path.split("?")[0])) ||
        page.pageTypes.includes("Homepage")
      );
    });
    return homepage
      ? {
          purpose,
          status: "DEDICATED_PAGE",
          pageIds: [homepage.pageId],
          explanation: `${homepage.label} was fetched and analyzed.`,
        }
      : {
          purpose,
          status: "NOT_DETECTED",
          pageIds: [],
          explanation: "The starting page was not successfully analyzed.",
        };
  }
  if (dedicated.length > 0) {
    return {
      purpose,
      status: "DEDICATED_PAGE",
      pageIds: dedicated.map((page) => page.pageId),
      explanation: `${dedicated.map((page) => page.label).join(", ")} ${dedicated.length === 1 ? "serves" : "serve"} this purpose.`,
    };
  }

  const equivalent = equivalentPurpose({
    purpose,
    pages: analyzedPages,
    website,
  });
  if (equivalent) return equivalent;

  const skipped = crawl?.skippedImportantPages.filter((item) =>
    purposeMatches(item.type, purpose),
  );
  if (skipped?.length) {
    return {
      purpose,
      status: "DISCOVERED_BUT_SKIPPED",
      pageIds: [],
      explanation: `${purpose} was discovered but was outside the saved crawl limit.`,
    };
  }

  if (isNotExpectedPurpose(purpose, businessModel)) {
    return {
      purpose,
      status: "NOT_EXPECTED",
      pageIds: [],
      explanation: notExpectedExplanation(purpose, businessModel),
    };
  }

  if (businessModel.confidence === "LOW" && businessSensitive(purpose)) {
    return {
      purpose,
      status: "UNABLE_TO_DETERMINE",
      pageIds: [],
      explanation: `Onread could not determine whether a separate ${purpose} page is appropriate for this business.`,
    };
  }

  return {
    purpose,
    status: "NOT_DETECTED",
    pageIds: [],
    explanation: `No separate ${purpose} page or equivalent function was found in the saved crawl evidence.`,
  };
}

function equivalentPurpose({
  purpose,
  pages,
  website,
}: {
  purpose: string;
  pages: PurposePage[];
  website: WebsiteAnalysis | null;
}) {
  const homepage = pages.find((page) => page.label === "Homepage") ?? pages[0];
  const searchable = pages
    .map((page) =>
      [page.title, ...page.h1Text, ...page.contactSignals, page.contentExcerpt]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");
  const actionText = [
    ...(website?.actionSummary.contactActions ?? []),
    ...(website?.actionSummary.emailActions ?? []),
    ...(website?.actionSummary.orderActions ?? []),
    ...(website?.actionSummary.bookingActions ?? []),
    ...(website?.actionSummary.primaryActions ?? []),
  ].join(" ");

  if (
    purpose === "Contact" &&
    (website?.contactEvidence?.hasAnyContactPath ||
      website?.hasContactLink ||
      website?.detectedPhone ||
      /\b(contact|inquir|email|call|book|quote|order)\b/i.test(actionText))
  ) {
    return {
      purpose,
      status: "EQUIVALENT_CONVERSION_PATH" as const,
      pageIds: homepage ? [homepage.pageId] : [],
      explanation:
        "No separate Contact page was detected, but a usable contact, inquiry, order, booking, email, or phone path is available.",
    };
  }
  if (
    purpose === "About" &&
    /\b(founder|founded by|our story|who we are|family[- ]owned|started by|meet the (?:owner|team))\b/i.test(
      searchable,
    )
  ) {
    return {
      purpose,
      status: "EQUIVALENT_SECTION" as const,
      pageIds: matchingTextPages(pages, /\b(founder|founded by|our story|who we are|family[- ]owned|started by|meet the (?:owner|team))\b/i),
      explanation:
        "No separate About page was detected, but founder, team, or business-story content serves that purpose.",
    };
  }
  if (
    purpose === "Store / Gift Cards" &&
    pages.some((page) => /\b(merch|merchandise|shop|store|gift card|product)\b/i.test(`${page.label} ${page.url}`))
  ) {
    const matching = pages.filter((page) =>
      /\b(merch|merchandise|shop|store|gift card|product)\b/i.test(
        `${page.label} ${page.url}`,
      ),
    );
    return {
      purpose,
      status: "EQUIVALENT_CONVERSION_PATH" as const,
      pageIds: matching.map((page) => page.pageId),
      explanation: `${matching.map((page) => reportPageLabel(page)).join(", ")} provides a store or product path.`,
    };
  }
  if (
    (purpose === "Reviews" || purpose === "Testimonials") &&
    /\b(review|testimonial|customer stor|what customers say|rated)\b/i.test(
      searchable,
    )
  ) {
    return {
      purpose,
      status: "EQUIVALENT_SECTION" as const,
      pageIds: matchingTextPages(
        pages,
        /\b(review|testimonial|customer stor|what customers say|rated)\b/i,
      ),
      explanation: `Customer proof is present even though no separate ${purpose} page was detected.`,
    };
  }
  if (
    purpose === "Hours" &&
    (website?.operatingHoursSignals.length ?? 0) > 0
  ) {
    return {
      purpose,
      status: "EQUIVALENT_SECTION" as const,
      pageIds: homepage ? [homepage.pageId] : [],
      explanation:
        "Operating hours are shown in page content even though no separate Hours page was detected.",
    };
  }
  if (
    (purpose === "Location" || purpose === "Map") &&
    (website?.detectedAddress ||
      website?.detectedMapEmbeds.length ||
      website?.detectedGoogleMapsLinks.length)
  ) {
    return {
      purpose,
      status: "EQUIVALENT_SECTION" as const,
      pageIds: homepage ? [homepage.pageId] : [],
      explanation: `Location information is present even though no separate ${purpose} page was detected.`,
    };
  }
  return null;
}

function isNotExpectedPurpose(
  purpose: string,
  businessModel: BusinessModelClassification,
) {
  if (!["Location", "Map", "Hours"].includes(purpose)) return false;
  if (businessModel.locationStatus === "NO_PUBLIC_LOCATION") return true;
  return !publicLocationModels.has(businessModel.model) &&
    ["Map", "Hours"].includes(purpose);
}

function notExpectedExplanation(
  purpose: string,
  businessModel: BusinessModelClassification,
) {
  if (businessModel.locationStatus === "NO_PUBLIC_LOCATION") {
    return `A public ${purpose.toLowerCase()} page is not expected because current Business Context indicates there is no customer-facing storefront.`;
  }
  return `A separate ${purpose} page is optional for this business model and was not treated as a defect.`;
}

function purposeMatches(value: string, purpose: string) {
  const normalized = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const left = normalized(value);
  const right = normalized(purpose);
  return left === right || left.includes(right) || right.includes(left);
}

function matchingTextPages(pages: PurposePage[], pattern: RegExp) {
  return pages
    .filter((page) =>
      pattern.test(
        [page.title, ...page.h1Text, page.contentExcerpt]
          .filter(Boolean)
          .join(" "),
      ),
    )
    .map((page) => page.pageId);
}

function businessSensitive(purpose: string) {
  return ["Location", "Map", "Hours", "Pricing", "Store / Gift Cards"].includes(
    purpose,
  );
}

function purposeRank(value: string) {
  const index = purposeOrder.indexOf(value);
  return index === -1 ? 100 : index;
}
