import { brand } from "@/lib/brand";

export const partnerTrainingModules = [
  {
    slug: "platform-overview",
    title: "Platform Overview",
    description: `Understand how ${brand.name} turns public evidence and business context into practical growth work.`,
    estimatedMinutes: 8,
    sections: [
      "The audit uses deterministic website, SEO, social-presence, reviews, and competitor evidence.",
      "Action Plan tracks recommendations; Implementation Help creates drafts; the AI Consultant explains saved evidence.",
      "PDF and Presentation Mode help a business review the same evidence in client-ready formats.",
    ],
  },
  {
    slug: "audit-evidence",
    title: "Reading Audit Evidence",
    description: "Separate what the platform observed from what a consultant may reasonably interpret.",
    estimatedMinutes: 10,
    sections: [
      "Confirmed and pending profiles have different evidence confidence.",
      "Missing data is a limitation, not proof that a business performs poorly.",
      "Static HTML cannot prove visual hierarchy, private analytics, engagement, revenue, or conversion performance.",
    ],
  },
  {
    slug: "product-limitations",
    title: "Product Limitations",
    description: "Make accurate claims about what the product does and does not know.",
    estimatedMinutes: 7,
    sections: [
      "The platform does not know private competitor traffic, revenue, conversions, or engagement.",
      "It does not analyze individual social-post performance without future account integrations.",
      "It does not automatically edit websites or guarantee rankings, customers, revenue, or growth.",
    ],
  },
  {
    slug: "professional-outreach",
    title: "Professional Outreach",
    description: "Introduce the product honestly and respect the recipient's time and choices.",
    estimatedMinutes: 9,
    sections: [
      "Never imply that a business requested contact when it did not.",
      "Use honest subject lines, restrained follow-up, and clear opt-out handling.",
      "The program does not permit mass spam, robocalling, or automated texting.",
    ],
  },
  {
    slug: "content-promotion",
    title: "Content Promotion",
    description: "Create useful product education while respecting privacy and disclosure rules.",
    estimatedMinutes: 8,
    sections: [
      "Walkthroughs, public-evidence teardowns, and educational content must stay within observed facts.",
      "Obtain permission where a reasonable person would expect it and never expose private customer data.",
      `Disclose the relationship clearly: “I'm a certified partner of ${brand.name} and may earn a commission if you purchase through my link.”`,
    ],
  },
  {
    slug: "referrals-and-commissions",
    title: "Referral and Commission Rules",
    description: "Learn first-touch attribution, holds, recurring eligibility, and reversals.",
    estimatedMinutes: 10,
    sections: [
      "The first valid referral is locked only for a genuinely new customer within the referral window.",
      "Self-referrals and existing-customer attribution are prohibited.",
      "Eligible commissions use payment subtotal after discounts, exclude tax, and may be reversed for refunds or disputes.",
    ],
  },
  {
    slug: "independent-services",
    title: "Independent Services",
    description: "Understand the boundary between platform referrals and your own consulting work.",
    estimatedMinutes: 7,
    sections: [
      "Partners may independently offer SEO, website, advertising, social, or consulting services.",
      "The partner sets pricing, uses a separate contract, delivers the work, and handles their own taxes.",
      "The platform is not a party to that service agreement and does not process its payment.",
    ],
  },
  {
    slug: "brand-standards",
    title: "Brand and Promotion Standards",
    description: "Use approved claims, clear disclosures, and the product name responsibly.",
    estimatedMinutes: 8,
    sections: [
      "Do not invent testimonials, results, guarantees, private analytics, or product capabilities.",
      "Do not impersonate the company or claim authority to bind it.",
      "Use clear partner disclosure near a recommendation or referral link.",
    ],
  },
] as const;

export const partnerAssessmentQuestions = [
  {
    id: "private-analytics",
    prompt: "Can the platform verify a competitor's private traffic or revenue?",
    options: ["Yes", "No", "Only for Pro customers"],
    answer: "No",
  },
  {
    id: "self-referral",
    prompt: "May a partner purchase through their own referral link?",
    options: ["Yes", "Only once", "No"],
    answer: "No",
  },
  {
    id: "disclosure",
    prompt: "What should accompany a partner link in promotional content?",
    options: ["A clear commission disclosure", "Nothing", "A guaranteed result"],
    answer: "A clear commission disclosure",
  },
  {
    id: "refund",
    prompt: "What happens to commission when the related payment is refunded?",
    options: ["It is reduced or reversed", "It doubles", "Nothing"],
    answer: "It is reduced or reversed",
  },
  {
    id: "services",
    prompt: "Who is responsible for an independent implementation-service agreement?",
    options: ["The partner and business", "Stripe", "The platform"],
    answer: "The partner and business",
  },
] as const;

export const requiredPartnerAgreementTypes = [
  "PARTNER_TERMS",
  "COMMISSION_POLICY",
  "PROMOTION_STANDARDS",
  "SCANNER_POLICY",
] as const;

export const PARTNER_ASSESSMENT_PASSING_SCORE = 80;
