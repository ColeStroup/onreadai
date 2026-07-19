import {
  BarChart3,
  Bot,
  FileText,
  Globe2,
  ListChecks,
  MessageSquareText,
  Presentation,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

export const marketingFaqs = [
  {
    question: "What does the audit analyze?",
    answer:
      "The audit can review a confirmed website, multi-page structure, technical SEO basics, review and trust presence, confirmed social profiles, Business Context, goals, and available public competitor evidence. The exact report depends on the information you provide and what the platform can verify.",
  },
  {
    question: "Do I need a website?",
    answer:
      "No. A business can complete setup with meaningful confirmed social profiles. Website and SEO are then marked not provided rather than scored as failures, and the assessment focuses on social presence, branding, trust, goals, competitors, and conversion paths.",
  },
  {
    question: "Can I use it for a social-first business?",
    answer:
      "Yes. Creators, coaches, local operators, restaurants, consultants, and other social-first businesses can confirm their profiles and Business Context to receive platform, content, trust, and conversion guidance without supplying a traditional website.",
  },
  {
    question: "Does it analyze individual social posts?",
    answer:
      "Not currently. Social analysis uses confirmed profile coverage, platform mix, Business Context, goals, and public competitor coverage. It does not claim to measure private engagement, posting frequency, reach, or individual post performance.",
  },
  {
    question: "How does competitor analysis work?",
    answer:
      "Competitor Intelligence compares timestamped public website, SEO, profile, review, and observable positioning evidence when available. Missing competitor data remains unavailable and is not treated as proof that a competitor is weak.",
  },
  {
    question: "Does the app change my website?",
    answer:
      "No. The platform analyzes observable evidence and creates recommendations or implementation drafts. You review the output and make changes in your website, profiles, or other tools.",
  },
  {
    question: "What does Implementation Help generate?",
    answer:
      "Depending on the recommendation, it can draft headlines, meta descriptions, CTA structures, review-request templates, social post concepts, profile copy, and ordered implementation steps using saved Business Context and audit evidence.",
  },
  {
    question: "Can consultants use it for clients?",
    answer:
      "Yes. Consultants can organize multiple business audits, explain findings with PDF reports or Presentation Mode, generate practical drafts, and use repeat audits to discuss progress. The platform does not promise client acquisition or income results.",
  },
  {
    question: "How do repeat audits measure progress?",
    answer:
      "The latest completed audit is compared with the previous completed audit for the same business. The report identifies score changes, improved or declined categories, new or resolved findings, and recommendation progress while disclosing methodology or data-coverage changes.",
  },
  {
    question: "What happens when information is unavailable?",
    answer:
      "Unavailable or unconfirmed information is labeled clearly. Categories that cannot be assessed may be excluded from the applicable overall score instead of automatically receiving a zero.",
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
    title: "Add your business",
    description:
      "Start with a website, public profile, or business name. The platform discovers relevant public signals for you to review.",
    icon: Globe2,
  },
  {
    title: "Confirm the context",
    description:
      "Check the audience, offer, goals, profiles, and conversion path so the assessment reflects how the business actually works.",
    icon: SearchCheck,
  },
  {
    title: "See what deserves attention",
    description:
      "Review evidence-backed findings, applicable scores, public competitor comparisons, and a prioritized Action Plan.",
    icon: BarChart3,
  },
  {
    title: "Put the fixes into action",
    description:
      "Generate practical drafts and implementation steps, track recommendation status, and rerun the audit to compare progress.",
    icon: Sparkles,
  },
] as const;

export const analysisCategories = [
  {
    title: "Website and conversion",
    description:
      "Page structure, important pages, visitor actions, headline clarity, contact paths, images, and conversion signals.",
    points: ["Controlled multi-page crawl", "CTA and action-path clarity", "Important-page coverage"],
    icon: Globe2,
  },
  {
    title: "SEO",
    description:
      "Titles, descriptions, headings, canonicals, robots.txt, sitemap.xml, and structural signals across scanned pages.",
    points: ["Homepage SEO basics", "Multi-page metadata coverage", "Indexability signals"],
    icon: SearchCheck,
  },
  {
    title: "Reviews and trust",
    description:
      "Confirmed Google Business information, public review coverage, customer-proof signals, and trust opportunities.",
    points: ["Listing confirmation status", "Available rating evidence", "Customer-proof opportunities"],
    icon: Star,
  },
  {
    title: "Social presence",
    description:
      "Confirmed profile coverage, channel suitability, content pillars, and the path from attention to a useful action.",
    points: ["Platform coverage", "Social-first conversion guidance", "Context-led content direction"],
    icon: MessageSquareText,
  },
  {
    title: "Competitor Intelligence",
    description:
      "Public website and SEO comparison, confirmed or detected profiles, available reviews, and observable positioning.",
    points: ["Timestamped public snapshots", "Side-by-side evidence", "Clearly labeled limitations"],
    icon: Users,
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
      "Create usable headlines, metadata, CTA structures, review templates, social ideas, and ordered fix instructions.",
    icon: Sparkles,
  },
  {
    title: "AI Consultant",
    description:
      "Ask questions using the context of your business, audit, reviews, competitors, goals, and saved recommendations.",
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
  "Restaurant and hospitality",
  "Local service business",
  "Consultant or agency",
  "Creator or personal brand",
  "Podcast or media brand",
  "Ecommerce or product business",
  "SaaS or software",
  "Community or nonprofit",
] as const;

export const deliverables = [
  {
    title: "Next 3 Moves",
    description: "The most important actions, supported by current findings.",
    icon: ListChecks,
  },
  {
    title: "Competitor comparison",
    description: "A public-evidence view of where each business appears stronger.",
    icon: Users,
  },
  {
    title: "Implementation drafts",
    description: "Ready-to-review copy and practical steps tied to recommendations.",
    icon: Sparkles,
  },
  {
    title: "AI Consultant",
    description: "Business-aware explanations and prioritization without inventing findings.",
    icon: Bot,
  },
  {
    title: "PDF and Presentation",
    description: "Two professional formats for sharing and discussing the assessment.",
    icon: FileText,
  },
] as const;

export const trustPrinciples = [
  "Observed data is separated from interpretation.",
  "Missing information remains unavailable instead of becoming a failure.",
  "Confirmed and detected profiles are labeled separately.",
  "Competitor reviews are compared only when both sides have evidence.",
  "Uncertain conclusions include confidence and limitations.",
  "Action Plan tasks connect back to findings and supporting evidence.",
] as const;

export const unsupportedMarketingClaims = [
  "guaranteed growth",
  "guaranteed revenue",
  "private competitor analytics",
  "individual social post performance",
  "automatic website editing",
  "automatic social publishing",
] as const;

export const trustIcon = ShieldCheck;
