import {
  BarChart3,
  Bot,
  FileText,
  Globe2,
  ListChecks,
  Presentation,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export const marketingFaqs = [
  {
    question: "What does the audit analyze?",
    answer:
      "Onread crawls your public website and checks website experience, conversion paths, content clarity, important-page coverage, and SEO foundations such as titles, descriptions, headings, internal links, indexability, canonicals, robots.txt, and sitemap.xml.",
  },
  {
    question: "Do I need a website?",
    answer:
      "Yes. The launch product is built specifically for website and SEO improvement, so a public website is required to run an audit.",
  },
  {
    question: "How many pages does Onread check?",
    answer:
      "The crawl limit depends on your plan. Onread starts with the homepage, prioritizes important pages, and records which URLs were analyzed, skipped, or unavailable so the report's coverage is clear.",
  },
  {
    question: "What does the Website Growth Score mean?",
    answer:
      "It is an explainable summary of the Website and SEO evidence Onread could verify. Website contributes 55% and SEO contributes 45%. Missing or unavailable evidence is disclosed rather than silently treated as a confirmed defect.",
  },
  {
    question: "Does the app change my website?",
    answer:
      "No. The platform analyzes observable evidence and creates recommendations or implementation drafts. You review the output and make changes in your website, profiles, or other tools.",
  },
  {
    question: "What does Implementation Help generate?",
    answer:
      "Depending on the recommendation, it can draft headlines, page titles, meta descriptions, calls to action, page structures, and ordered implementation steps using saved Business Context and audit evidence.",
  },
  {
    question: "Can consultants use it for clients?",
    answer:
      "Yes. Consultants can organize multiple business audits, explain findings with PDF reports or Presentation Mode, generate practical drafts, and use repeat audits to discuss progress. The platform does not promise client acquisition or income results.",
  },
  {
    question: "How do repeat audits measure progress?",
    answer:
      "The latest completed audit is compared with the previous compatible audit for the same website. Onread identifies score changes, new or resolved findings, and recommendation progress while clearly disclosing methodology or coverage changes.",
  },
  {
    question: "What happens when information is unavailable?",
    answer:
      "Unavailable pages and checks are labeled clearly. Onread separates verified issues, AI-reviewed opportunities, strengths, coverage notes, and limitations instead of treating every observation as a problem.",
  },
  {
    question: "Is a credit card required for the free audit?",
    answer:
      "No. Creating a free account and starting the free audit does not require a credit card. Eligible paid packages are purchased securely through Stripe Checkout.",
  },
  {
    question: "How long does an audit take?",
    answer:
      "Timing varies with website availability, crawl depth, and the amount of confirmed context. The run screen shows each stage as the audit prepares the business profile, checks available sources, and saves the report.",
  },
] as const;

export const howItWorks = [
  {
    title: "Add your website",
    description:
      "Enter your business name and public website URL. No social profiles or competitor setup is required.",
    icon: Globe2,
  },
  {
    title: "Run the audit",
    description:
      "Onread crawls important pages and checks website experience, content, conversion paths, and SEO foundations.",
    icon: SearchCheck,
  },
  {
    title: "See what to fix first",
    description:
      "Review evidence-backed findings and a prioritized Action Plan tied to affected pages and expected impact.",
    icon: BarChart3,
  },
  {
    title: "Make the improvements",
    description:
      "Use implementation guidance and the Website & SEO Consultant to turn recommendations into finished work.",
    icon: Sparkles,
  },
  {
    title: "Verify the results",
    description:
      "Run another audit to see what was fixed, what remains, and how compatible evidence changed.",
    icon: ShieldCheck,
  },
] as const;

export const analysisCategories = [
  {
    title: "Website experience",
    description:
      "Messaging, navigation, calls to action, trust elements, content clarity, and customer conversion paths.",
    points: [
      "Controlled multi-page crawl",
      "CTA and conversion clarity",
      "Important-page coverage",
    ],
    icon: Globe2,
  },
  {
    title: "SEO",
    description:
      "Titles, descriptions, headings, internal links, canonicals, robots.txt, sitemap.xml, and indexability signals.",
    points: [
      "Page-level metadata",
      "Heading and linking structure",
      "Search accessibility",
    ],
    icon: SearchCheck,
  },
  {
    title: "Technical and content quality",
    description:
      "Broken links, thin or duplicate pages, image accessibility, page purpose, and important technical gaps.",
    points: [
      "Broken and inaccessible pages",
      "Thin and duplicate content",
      "Accessibility basics",
    ],
    icon: ShieldCheck,
  },
] as const;

export const userOutcomes = [
  {
    title: "Prioritized Action Plan",
    description:
      "See which changes matter most based on impact, effort, goals, current evidence, and completion status.",
    icon: ListChecks,
  },
  {
    title: "Implementation Help",
    description:
      "Create usable headlines, metadata, CTA structures, page outlines, and ordered fix instructions.",
    icon: Sparkles,
  },
  {
    title: "AI Consultant",
    description:
      "Ask questions using your website evidence, SEO findings, business context, goals, and saved recommendations.",
    icon: Bot,
  },
  {
    title: "Professional reports",
    description:
      "Export a detailed PDF or walk through the findings in a client-ready, fixed-slide presentation experience.",
    icon: Presentation,
  },
  {
    title: "Progress tracking",
    description:
      "Rerun audits to understand what changed, what improved, and whether expanded evidence affected the comparison.",
    icon: BarChart3,
  },
] as const;

export const businessArchetypes = [
  "Local service websites",
  "Restaurant and hospitality websites",
  "Consultant and agency websites",
  "Ecommerce and product websites",
  "SaaS and software websites",
  "Creator and portfolio websites",
  "Community and nonprofit websites",
  "Multi-location business websites",
] as const;

export const deliverables = [
  {
    title: "Top three actions",
    description:
      "The most important website and SEO improvements, supported by evidence.",
    icon: ListChecks,
  },
  {
    title: "Evidence-backed report",
    description:
      "Affected pages, observed evidence, limitations, and verification guidance.",
    icon: SearchCheck,
  },
  {
    title: "Implementation drafts",
    description:
      "Ready-to-review copy and practical steps tied to recommendations.",
    icon: Sparkles,
  },
  {
    title: "AI Consultant",
    description:
      "Business-aware explanations and prioritization without inventing findings.",
    icon: Bot,
  },
  {
    title: "PDF and Presentation",
    description:
      "Two professional formats for sharing and discussing the assessment.",
    icon: FileText,
  },
] as const;

export const trustPrinciples = [
  "Observed data is separated from interpretation.",
  "Unavailable pages and checks remain limitations instead of becoming failures.",
  "Verified strengths are not presented as issues.",
  "AI-reviewed opportunities are distinct from deterministic technical findings.",
  "Uncertain conclusions include confidence and limitations.",
  "Action Plan tasks connect back to findings and supporting evidence.",
] as const;

export const unsupportedMarketingClaims = [
  "guaranteed growth",
  "guaranteed revenue",
  "automatic website editing",
  "private analytics without a connected data source",
] as const;

export const trustIcon = ShieldCheck;
