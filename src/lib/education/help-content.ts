import type { ScoreCategory } from "@prisma/client";

export type HelpEntry = {
  question: string;
  answer: string;
};

export type HelpSection = {
  title: string;
  description: string;
  entries: HelpEntry[];
};

export const contextualHelp = {
  overview: {
    title: "What is this report?",
    description:
      "The overview summarizes your latest website and SEO audit. It brings together the Website Growth Score, strongest evidence, top actions, and compatible progress so you can quickly see what matters most.",
  },
  context: {
    title: "What is Business Context?",
    description:
      "Business Context tells the app what your business does, who you serve, and what you want visitors to do. This helps the AI avoid generic recommendations and tailor advice to your actual audience.",
  },
  website: {
    title: "What does Website Analysis mean?",
    description:
      "This section checks the homepage plus a controlled crawl of important internal pages for clarity, trust signals, links, calls to action, images, and basic page structure. Crawl depth depends on your plan.",
  },
  seo: {
    title: "What does SEO Analysis check?",
    description:
      "This section checks basic search visibility signals like title tags, meta descriptions, H1 structure, robots.txt, sitemap.xml, canonical tags, viewport settings, and other technical SEO basics.",
  },
  social: {
    title: "What does Social Strategy help with?",
    description:
      "Social Strategy helps you decide where to post, what to post, and how to turn social attention into business results. Recommendations are based on your Business Context, goals, confirmed profiles, competitors, and audit data.",
  },
  reviews: {
    title: "What does Reviews / Trust measure?",
    description:
      "Reviews and trust signals help potential customers decide whether your business looks credible. This section checks whether important review platforms, especially Google Business, are present, discovered, and confirmed.",
  },
  competitors: {
    title: "What is Competitor Intelligence?",
    description:
      "Competitor Intelligence creates timestamped snapshots from public website pages, detected or confirmed profiles, and Google Places data when configured. Comparisons use only available evidence and never claim private traffic, sales, or social engagement data.",
  },
  actionPlan: {
    title: "What is the Action Plan?",
    description:
      "Your Action Plan turns website and SEO recommendations into trackable tasks so you can make progress between audits and verify what changed when you re-audit.",
  },
  history: {
    title: "Why audit history matters",
    description:
      "History helps you compare compatible completed audits over time. Methodology changes are labeled so a scoring-model change is not presented as genuine website improvement.",
  },
  chat: {
    title: "What does the AI Consultant know?",
    description:
      "The Website & SEO Consultant uses saved website evidence, Business Context, scores, findings, recommendations, action status, goals, and compatible progress history. Disabled future-module data is not included in its launch context.",
  },
} as const;

export const recommendationWhy: Record<ScoreCategory, string> = {
  OVERALL:
    "Overall recommendations connect multiple areas of the audit so you can focus on the changes most likely to improve your online presence.",
  WEBSITE:
    "Website recommendations usually focus on making your site clearer, easier to trust, and easier for visitors to take action.",
  SEO: "SEO recommendations help search engines understand your pages and help potential customers find you.",
  SOCIAL:
    "Social recommendations help improve consistency, platform coverage, content direction, and the path from social attention to a business result.",
  COMPETITORS:
    "Competitor recommendations help you compare your online presence against businesses you want to beat or learn from.",
  BRANDING:
    "Branding recommendations help make your business feel consistent, trustworthy, and recognizable.",
  REVIEWS:
    "Review recommendations help strengthen trust signals, local visibility, and the proof customers look for before choosing you.",
};

export const helpSections: HelpSection[] = [
  {
    title: "Getting Started",
    description:
      "The basic flow from adding a business to getting a usable growth plan.",
    entries: [
      {
        question: "How do I start using the app?",
        answer:
          "Add a business, website, or social profile, confirm the profiles that belong to you, then run an audit. The app will create a report, recommendations, and an action plan you can track.",
      },
      {
        question: "Why do I need to confirm profiles?",
        answer:
          "Confirmation keeps the audit focused on the profiles that really belong to your business. It prevents recommendations from being influenced by the wrong website, social profile, or competitor account.",
      },
      {
        question: "Do I need to connect my social accounts?",
        answer:
          "No. This version does not require account connections. It uses the profiles you confirm or add manually, then analyzes coverage, status, and platform mix.",
      },
    ],
  },
  {
    title: "Understanding Your Audit",
    description:
      "How to read scores, findings, recommendations, and report sections.",
    entries: [
      {
        question: "What does the Overall Score mean?",
        answer:
          "The Overall Score is a simple health indicator for your online presence. It combines signals from your website, SEO, social presence, branding, reviews, competitors, and profile setup so you can quickly understand the current baseline.",
      },
      {
        question: "Why is some data missing?",
        answer:
          "Some data may be missing if a website was unreachable, a profile was not confirmed, a competitor has not been added, or a feature has not been built yet. The app is designed to show what it can verify and explain what still needs setup.",
      },
      {
        question: "Why did my score change after another audit?",
        answer:
          "Scores can change when your profiles, website, competitors, or recommendations change. Re-audits compare the latest completed audit against the previous completed audit, so you can see what improved or declined.",
      },
    ],
  },
  {
    title: "Guided Setup",
    description:
      "The recommended sequence for preparing a new business before its first audit.",
    entries: [
      {
        question: "What should I complete before running an audit?",
        answer:
          "Confirm the profiles that belong to your business, review and confirm Business Context, then select at least one goal and a primary goal. The audit can run with partial setup, but confirmed inputs make the recommendations more accurate and useful.",
      },
      {
        question: "Can I skip a setup step?",
        answer:
          "Yes. Guided Setup does not trap you or replace the existing pages. You can skip a step, finish later, or open Profiles, Context, Goals, and Audit directly. A skipped step remains visible in the setup checklist until it is complete.",
      },
      {
        question: "Why should I confirm Business Context?",
        answer:
          "Confirmation tells the app that its understanding of your audience, offer, business type, and conversion goal is accurate enough to use. An unconfirmed generated draft is marked as needing review.",
      },
      {
        question: "Can I change setup information later?",
        answer:
          "Yes. Profiles, Business Context, goals, and competitors remain editable after setup. If those inputs change substantially, run another audit so scores and recommendations use the new information.",
      },
      {
        question: "How is setup completion determined?",
        answer:
          "Profiles are complete when at least one real profile is confirmed and no discovered profiles still need review. Context is complete when it exists and is confirmed. Goals need at least one selection plus a primary goal. The audit step completes after a saved completed audit, and setup finishes when you review the result step.",
      },
      {
        question: "How do I resume setup?",
        answer:
          "Open the business and choose Continue Setup from the Overview checklist, use Guided setup in the Setup navigation group, or select an incomplete business from the Businesses page.",
      },
    ],
  },
  {
    title: "Implementation Help",
    description:
      "How Generate Fix turns recommendations into copy, templates, and practical steps.",
    entries: [
      {
        question: "Does Generate Fix change my website?",
        answer:
          "No. Implementation Help creates a draft or checklist inside the app. It never publishes content, edits your website, changes an external profile, or completes a recommendation automatically.",
      },
      {
        question: "Can I copy the generated text?",
        answer:
          "Yes. You can copy an individual option or the full draft, then review and place it in the appropriate website, email, review-request, or social workflow.",
      },
      {
        question: "Can I save multiple versions?",
        answer:
          "Yes. Save a draft, regenerate another version, switch between versions inside the Implementation Help sheet, and archive versions you no longer need.",
      },
      {
        question: "Why does the output need review?",
        answer:
          "The output uses saved Business Context and audit evidence, but you remain the source of truth for your offer, brand voice, legal claims, customer permissions, and current business details. Review every draft before using it publicly.",
      },
      {
        question: "Does generating a fix complete the task?",
        answer:
          "No. Generation and task status are separate. Mark the recommendation complete only after you have implemented and verified the change.",
      },
      {
        question: "Does the app analyze my real social post performance?",
        answer:
          "No. It can draft or refine content using Business Context and Social Strategy, but it does not read individual post engagement, reach, conversions, or account analytics in this version.",
      },
      {
        question: "Why am I out of implementation generations?",
        answer:
          "Implementation Help uses AI when available, so each plan has a generation allowance: Free includes 1 per month, a one-time audit includes 10, Starter includes 25 per month, Pro includes 100 per month, and Agency includes 250 per month. Billing shows current usage.",
      },
      {
        question: "What happens if OpenAI is unavailable?",
        answer:
          "The feature uses a deterministic template fallback for supported copy and step types. The sheet labels the source so you know whether a result was AI generated or created from a fallback template.",
      },
    ],
  },
  {
    title: "Business Context",
    description:
      "How the app learns what your business does and uses that context in recommendations.",
    entries: [
      {
        question: "What is Business Context?",
        answer:
          "Business Context is the saved description of what your business does, who it serves, what it offers, what type of business it is, and what action you want visitors to take. It gives the app a clearer strategic baseline.",
      },
      {
        question: "Why should I confirm my business description?",
        answer:
          "Confirming the description tells the app that the context is accurate enough to rely on. That helps the AI Consultant avoid generic advice and tailor recommendations to your actual audience and offer.",
      },
      {
        question: "Does the AI use this when answering questions?",
        answer:
          "Yes. The AI Consultant treats Business Context as high-priority information when answering questions about social platforms, content, competitors, conversions, and what to fix next.",
      },
      {
        question: "What if the generated context is wrong?",
        answer:
          "Edit the Context tab and save it. Saving manual edits marks the context as user edited, and you can confirm it once it accurately describes the business.",
      },
      {
        question: "How does this affect social platform recommendations?",
        answer:
          "The app uses the target audience and business type before recommending channels. For example, a Discord or creator-focused tool may call for TikTok, YouTube Shorts, Discord communities, or Reddit before LinkedIn unless the audience is explicitly professional or B2B.",
      },
      {
        question: "What does the confidence score mean?",
        answer:
          "Confidence is a simple estimate of how much evidence the app had when generating the context. A lower score means you should review and edit the fields before relying on strategic recommendations.",
      },
      {
        question: "What happens if the app misunderstands the business?",
        answer:
          "Recommendations may feel too generic or aimed at the wrong audience. Update and confirm the Context tab, then rerun audits or continue chatting with the corrected business context.",
      },
    ],
  },
  {
    title: "Website Analysis",
    description:
      "What the homepage analyzer checks and how to use those findings.",
    entries: [
      {
        question: "What does the Website tab analyze?",
        answer:
          "The Website tab analyzes the homepage and a controlled same-site crawl. It checks page titles, meta descriptions, H1s, links, images, missing alt text, social links, important pages, and call-to-action signals. The number of crawled pages depends on your plan.",
      },
      {
        question: "Why does the homepage matter so much?",
        answer:
          "Your homepage is often the first place a customer checks before contacting you. Clear messaging, visible trust signals, and obvious next steps can make the rest of your marketing work harder.",
      },
    ],
  },
  {
    title: "Website Crawling",
    description:
      "How the crawler chooses pages, handles limits, and avoids overstating what it found.",
    entries: [
      {
        question: "Why did the app not scan every page?",
        answer:
          "The crawler is intentionally limited so audits stay fast, safe, and predictable. It starts with the homepage, discovers internal links, prioritizes business-critical pages, and scans up to the page limit included with your plan.",
      },
      {
        question: "What does crawl limit mean?",
        answer:
          "Crawl limit is the maximum number of website pages the audit will fetch for one run. Free scans fewer pages, while paid plans scan deeper. The Website and SEO tabs show the limit used for the saved audit.",
      },
      {
        question: "Why does my plan scan fewer pages?",
        answer:
          "Deeper crawls take more time and resources. Plan-based limits keep the product responsive while still letting higher plans inspect more of the website.",
      },
      {
        question: "How are important pages prioritized?",
        answer:
          "The crawler looks for pages such as contact, about, services, pricing, menu, hours, reviews, FAQ, events, products, and resources. Business Context can shift priorities, so restaurants, SaaS companies, local services, and ecommerce businesses get different page priority.",
      },
      {
        question: "What if the app says a page was not scanned?",
        answer:
          "That means the page was discovered but not included before the crawl limit was reached. The app should not treat that page as missing. Review the skipped page manually or run a deeper audit before making decisions from it.",
      },
      {
        question: "Why was /index.htm skipped?",
        answer:
          "The crawler treats common homepage variants like /, /index.htm, /index.html, /home, and trailing-slash versions as duplicates. Skipping them prevents duplicate pages from wasting crawl slots.",
      },
      {
        question: "Why can a contact recommendation sound cautious?",
        answer:
          "Contact-page recommendations depend on what was scanned versus only discovered. If a contact page was found but not scanned, the app should tell you to verify it instead of claiming the site is missing a contact page.",
      },
    ],
  },
  {
    title: "SEO Analysis",
    description:
      "Plain-English explanations of basic search visibility checks.",
    entries: [
      {
        question: "What does the SEO tab check?",
        answer:
          "The SEO tab checks basic homepage search signals: title tag, meta description, H1 structure, canonical tag, viewport tag, robots.txt, sitemap.xml, and simple indexability warnings.",
      },
      {
        question: "Does this replace a full SEO audit?",
        answer:
          "No. This is a first-pass SEO check. It helps you catch obvious basics before deeper keyword research, technical crawling, local SEO, and content analysis are added later.",
      },
    ],
  },
  {
    title: "Social Presence",
    description:
      "How the app evaluates social coverage without connecting accounts.",
    entries: [
      {
        question: "What does the Social tab measure?",
        answer:
          "The Social tab measures confirmed profiles, pending profiles, platform coverage, missing recommended platforms, and whether competitors appear to have broader social coverage.",
      },
      {
        question: "Does the app scrape Instagram, TikTok, or YouTube?",
        answer:
          "No. This version does not scrape social platforms or require social logins. It only uses the profiles saved in your dashboard.",
      },
      {
        question: "Why can public-profile and social-profile counts differ?",
        answer:
          "A public-profile count can include a website, Google Business listing, and confirmed social profiles. A social-profile count includes only confirmed social platforms, so a website is never counted as social and pending links are never counted as confirmed.",
      },
    ],
  },
  {
    title: "Social Strategy",
    description:
      "How the app recommends platforms, content pillars, weekly plans, and social-to-conversion next steps.",
    entries: [
      {
        question: "What is Social Strategy?",
        answer:
          "Social Strategy turns your saved Business Context, goals, confirmed profiles, competitors, and audit data into practical guidance about where to post, what to post, and how to connect attention back to your website, product, booking flow, or lead path.",
      },
      {
        question: "How are platform recommendations chosen?",
        answer:
          "The app starts with your target audience and offer, then considers profile coverage, goals, competitors, and audit signals. It should recommend channels based on audience fit rather than a generic rule like every software business needs LinkedIn.",
      },
      {
        question: "Why does Business Context matter for social strategy?",
        answer:
          "A social plan depends on who you are trying to reach and what action you want them to take. Confirming Business Context helps the app avoid generic ideas and make better calls about channels, topics, tone, and conversion steps.",
      },
      {
        question:
          "Why might it recommend TikTok, Shorts, or Discord instead of LinkedIn?",
        answer:
          "If your audience is creator-focused, gaming-oriented, community-based, local, visual, or social-first, the app may prioritize short-form video or community channels. LinkedIn becomes more relevant when your audience is professional, B2B, hiring, partnerships, or executive buyers.",
      },
      {
        question: "What are content pillars?",
        answer:
          "Content pillars are repeatable themes you can post about without starting from scratch each time. They usually cover audience problems, proof or trust, education, offer clarity, and conversion prompts.",
      },
      {
        question: "How should I use the weekly content plan?",
        answer:
          "Treat it as a starting rhythm. Pick the ideas that match your capacity, adapt the captions to your voice, and make sure each post points to one clear next step instead of trying to do everything at once.",
      },
      {
        question: "How should social content connect to website conversions?",
        answer:
          "The promise in the post should match the page or profile link people click. Use clear CTAs, pinned posts, profile links, landing page headlines, booking paths, signup flows, or lead magnets so attention has somewhere useful to go.",
      },
      {
        question: "What are the limits without connected social accounts?",
        answer:
          "Without connected accounts or social scraping, the app does not know real follower counts, engagement rates, reach, or post performance. It can still plan strategy from your business context, goals, profiles, competitors, and audit evidence.",
      },
    ],
  },
  {
    title: "Reviews and Trust",
    description:
      "How the app checks review platform readiness without scraping reviews.",
    entries: [
      {
        question: "What does the Reviews tab measure?",
        answer:
          "The Reviews tab checks whether review and trust platforms are present and confirmed, especially Google Business. When Google Places discovery is configured, it can save public listing details such as rating and review count.",
      },
      {
        question: "Do I need a Google Business profile?",
        answer:
          "For local businesses, service providers, restaurants, creators with local offers, and consultants who rely on trust, a Google Business profile can be an important credibility and discovery signal.",
      },
      {
        question: "Why is my review score not 100 if I have many reviews?",
        answer:
          "A strong Google rating and high review count are excellent trust signals, but the score also considers whether the listing is confirmed, whether other relevant review channels are present, and whether customer proof is used clearly across the website and conversion path.",
      },
      {
        question: "Does the app read my actual Google reviews?",
        answer:
          "No. This version can store public listing details such as rating and review count from Google Places, but it does not scrape review text or analyze review sentiment.",
      },
      {
        question: "Does this use Google APIs?",
        answer:
          "It can use the Google Places API for public discovery when a server-side Places key is configured. It does not use the Google Business Profile management API and it does not require you to connect a Google account.",
      },
    ],
  },
  {
    title: "Google Business Profiles",
    description:
      "How public Google listing discovery, confirmation, and match confidence work.",
    entries: [
      {
        question:
          "Why does the app say my Google Business Profile is not confirmed?",
        answer:
          "The app may have found a possible listing, but it still needs you to confirm that it belongs to your business. This prevents the audit from relying on the wrong Google Maps listing.",
      },
      {
        question: "Does the app search Google Maps?",
        answer:
          "If GOOGLE_PLACES_API_KEY is configured on the server, the app can use Google Places public search to find likely listings. If it is not configured, the app can still detect clues such as Google Maps embeds, address text, phone numbers, and LocalBusiness schema.",
      },
      {
        question: "Is this the same as signing in with Google?",
        answer:
          "No. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are for Google login. GOOGLE_PLACES_API_KEY is a server-only API key used to discover public Google Maps / Places listings.",
      },
      {
        question: "Why do I need to confirm the listing?",
        answer:
          "Many businesses share similar names, locations, or websites. Confirmation tells the audit which listing is truly yours before it treats rating, review count, or local trust signals as evidence.",
      },
      {
        question: "Why does Google Business matter?",
        answer:
          "Google Business is a major trust and reviews channel for local, storefront, restaurant, and service-area businesses. It helps potential customers validate that the business looks active, credible, and easy to find.",
      },
      {
        question: "Why does the app separate platform name from listing name?",
        answer:
          "Google Business is the review platform. The listing name is the specific public profile that belongs to the business. Separating the two keeps reports clear, especially when the listing name matches the business name.",
      },
      {
        question: "What is a Place ID?",
        answer:
          "A Place ID is Google's stable identifier for a public place listing. If you know it, you can manually add it so the app can resolve the correct listing when the Places API key is available.",
      },
      {
        question: "Can I manually add my Google Business listing?",
        answer:
          "Yes. On the Reviews tab, add a Google Maps URL or Place ID. If Places is configured, the app will try to resolve details. If not, it stores the manual listing for confirmation with limited data.",
      },
      {
        question: "What if the app finds the wrong listing?",
        answer:
          "Remove the incorrect candidate, then regenerate discovery or manually add the correct Google Maps URL or Place ID.",
      },
    ],
  },
  {
    title: "Competitor Intelligence",
    description:
      "What public competitor analysis can verify, how snapshots work, and why some comparisons are limited.",
    entries: [
      {
        question: "What is Competitor Intelligence?",
        answer:
          "Competitor Intelligence scans a saved competitor's public website, basic SEO signals, detected or confirmed profiles, observable positioning, and public Google listing data when Places is configured. It saves a timestamped snapshot and compares only values supported by evidence.",
      },
      {
        question: "How many competitors should I add?",
        answer:
          "Start with two or three direct competitors. Pick businesses your customers would realistically compare against you, plus one aspirational benchmark if useful.",
      },
      {
        question: "Why is my competitor saved but not analyzed?",
        answer:
          "Saving creates the directory record and profile list. Analysis is a separate action because it crawls public pages and counts against plan-specific competitor scan limits. Click Analyze on the competitor card, then rerun your business audit to include the comparison in reports and AI context.",
      },
      {
        question: "What does competitor analysis scan?",
        answer:
          "It checks a limited number of same-domain public pages, homepage title and headline, calls to action, important page coverage, basic SEO, public social links, observable positioning, and Google Places data when configured. Crawl depth depends on your plan.",
      },
      {
        question: "Does the app analyze competitor social posts?",
        answer:
          "No. Social comparison is limited to detected and confirmed public profile coverage. It does not inspect individual posts, posting frequency, engagement, reach, impressions, or audience demographics.",
      },
      {
        question: "What do competitor profile counts include?",
        answer:
          "Confirmed public profiles can include the competitor website plus confirmed social or review-capable profiles. Confirmed social profiles exclude the website, while pending or detected links are shown separately and are not treated as confirmed.",
      },
      {
        question: "Does it know competitor traffic or sales?",
        answer:
          "No. The app does not have private analytics, traffic, conversions, ad spend, revenue, or sales data. It describes only publicly observable website, profile, listing, and positioning signals.",
      },
      {
        question: "How often is competitor data refreshed?",
        answer:
          "Completed snapshots are normally reused for about seven days to control scan time and cost. You can manually refresh within your plan allowance. Every refresh creates a new historical snapshot rather than overwriting the old one.",
      },
      {
        question: "Why does a competitor show partial data?",
        answer:
          "A site may block requests, return limited HTML, time out, omit a section, or have no applicable Google listing. The app keeps successful sections, labels the snapshot partial, and explains unavailable evidence instead of guessing.",
      },
      {
        question: "Why can't the AI compare my competitor yet?",
        answer:
          "The AI needs structured comparison evidence saved in a completed business audit. Analyze the competitor first, then rerun the business audit. If the snapshot is stale or partial, the AI should disclose that limitation.",
      },
      {
        question: "Can I manually refresh competitor data?",
        answer:
          "Yes. Use Refresh on one card or Refresh all. Manual refreshes use your plan's scan allowance; reusing a fresh cached snapshot does not consume another scan.",
      },
      {
        question: "What happens when a competitor website blocks crawling?",
        answer:
          "The scan records the failure or saves available sections as partial. If an older completed snapshot exists, the app can continue using it as stale data and clearly labels its date.",
      },
      {
        question: "How do plan limits affect competitor analysis?",
        answer:
          "Plans limit the number of analyzed competitors, refreshes in a plan period, and pages scanned per competitor. The Billing page shows current scan usage and crawl depth before another network scan begins.",
      },
    ],
  },
  {
    title: "Action Plan",
    description:
      "Turning audit recommendations into visible progress between audits.",
    entries: [
      {
        question: "What is the Action Plan?",
        answer:
          "The Action Plan turns recommendations into trackable tasks. You can mark items as To Do, In Progress, Completed, or Dismissed, then use progress to decide when to re-audit.",
      },
      {
        question: "How should I choose what to work on first?",
        answer:
          "Start with low-effort, high-impact recommendations, especially items tied to your primary goal. The 30-day plan groups work into quick wins, website and SEO basics, social improvements, and follow-up review.",
      },
    ],
  },
  {
    title: "AI Consultant",
    description: "What the chat can answer today and what it will do later.",
    entries: [
      {
        question: "What does the AI Consultant know about my business?",
        answer:
          "It knows your saved Business Context, audit data, scores, findings, recommendations, action statuses, confirmed profiles, goals, competitors, and progress history. It only answers when the AI service is configured and available.",
      },
      {
        question: "Can I ask what to do next?",
        answer:
          "Yes. Ask about what to fix first, social content, competitors, SEO, website issues, progress, or what is left in your action plan.",
      },
    ],
  },
  {
    title: "PDF Reports",
    description:
      "What is included when you download a professional audit report.",
    entries: [
      {
        question: "What does Download PDF include?",
        answer:
          "The PDF includes a cover page, executive summary, score breakdown, website analysis, SEO analysis, competitor intelligence, top priorities, next steps, progress since the previous audit, and technical findings.",
      },
    ],
  },
  {
    title: "Presentation Mode",
    description:
      "Using the audit report in client, team, or sales conversations.",
    entries: [
      {
        question: "What is Presentation Mode for?",
        answer:
          "Presentation Mode turns the audit into full-screen slides. It is useful for reviewing your own priorities, walking a client through findings, or sharing a simple strategy discussion with a team.",
      },
    ],
  },
  {
    title: "Re-Audits and Progress",
    description: "How repeated audits show improvement and decline over time.",
    entries: [
      {
        question: "How often should I run another audit?",
        answer:
          "Run another audit after you complete meaningful changes, such as updating your homepage, confirming profiles, adding competitors, or completing several recommendations. Weekly or monthly can work depending on how quickly you make changes.",
      },
      {
        question: "What changed since my last audit?",
        answer:
          "The app compares the latest completed audit with the previous completed audit. It shows score change, improved categories, declined categories, new findings, resolved findings, and recommendations completed since the previous audit.",
      },
    ],
  },
  {
    title: "Plans and Feature Limits",
    description:
      "How the free, one-time, and subscription packages affect what you can use.",
    entries: [
      {
        question: "What is included in the Free plan?",
        answer:
          "The Free plan is for trying the workflow with one business, one monthly audit, a 5-page website crawl, limited AI messages, basic competitor tracking, and preview access to some advanced report features.",
      },
      {
        question: "What is included in a one-time audit?",
        answer:
          "A one-time audit unlocks one full report experience for a single business, including a deeper 25-page crawl, the professional report, PDF export, presentation mode, action plan, progress comparison, and a larger AI message allowance.",
      },
      {
        question: "What is Starter best for?",
        answer:
          "Starter is best for one business that wants to keep improving over time. It includes recurring audits, a 25-page crawl, more AI consultant messages, PDF and presentation access, social strategy, action tracking, and more competitor capacity.",
      },
      {
        question: "What is Pro best for?",
        answer:
          "Pro is designed for users managing multiple businesses, freelancers, consultants, or small teams. It raises business, audit, AI message, crawl depth, competitor, and strategy limits so you can work across more accounts.",
      },
      {
        question: "What does Agency coming soon mean?",
        answer:
          "Agency is reserved for higher-volume client work. It is shown so the product packaging is clear, but checkout and agency-specific billing are not connected yet.",
      },
      {
        question: "Why are some features locked?",
        answer:
          "Locked features are part of the planned paid packages. You can still preview what the feature does, then upgrade later when billing is connected.",
      },
      {
        question: "Are AI messages limited?",
        answer:
          "Yes. AI message limits help keep usage predictable. The Billing page shows your current monthly allowance and how many messages have been used.",
      },
      {
        question: "Is billing live yet?",
        answer:
          "No. Stripe checkout is not connected yet. Plan limits and upgrade paths are in place so the product experience can be tested before real payments are added.",
      },
    ],
  },
  {
    title: "Common Questions",
    description:
      "Short answers to questions business owners usually ask first.",
    entries: [
      {
        question: "Is this using real AI yet?",
        answer:
          "Yes, when the AI provider is configured and available. If it is missing, quota-limited, or temporarily unavailable, chat clearly reports that it is unavailable instead of fabricating a provider response.",
      },
      {
        question: "Can I use this for clients?",
        answer:
          "Yes. The report, PDF, presentation mode, and action plan are designed to support consultants, freelancers, agencies, creators, and business owners.",
      },
      {
        question: "Do I need a subscription?",
        answer:
          "Not always. The Free plan is useful for trying the app, and the one-time audit package is meant for a single full report. A subscription makes more sense if you want recurring audits, ongoing AI help, or multiple businesses.",
      },
      {
        question: "What plan is best for one business?",
        answer:
          "Starter is the best fit for one business that wants ongoing improvement. If you only need a single report, the one-time audit package is the simpler option.",
      },
      {
        question: "What plan is best for consultants or agencies?",
        answer:
          "Pro is the practical starting point for consultants because it supports multiple businesses and higher usage limits. Agency packaging is planned for higher-volume client work later.",
      },
      {
        question: "Why is this feature locked?",
        answer:
          "A feature may be locked because your current plan has reached a usage limit or because that feature belongs to a higher package. The Billing page shows your current plan and usage.",
      },
      {
        question: "Will this crawl my whole website?",
        answer:
          "No. The crawler is intentionally limited. It checks the homepage and then scans internal pages up to your plan limit, prioritizing important pages like contact, about, services, pricing, menu, hours, reviews, FAQ, products, events, and resources.",
      },
      {
        question: "Does the app analyze my actual social media posts?",
        answer:
          "Not yet. Social Strategy v1 does not scrape Instagram, TikTok, YouTube, LinkedIn, Facebook, or other social platforms. It uses saved profiles, Business Context, goals, competitors, and audit data.",
      },
      {
        question: "Why did it recommend this platform?",
        answer:
          "Platform recommendations are based on audience fit, business type, offer, conversion goal, confirmed profiles, goals, and available competitor context. Review the reasoning on the Social tab and update Business Context if the audience or offer is wrong.",
      },
      {
        question: "What are content pillars?",
        answer:
          "Content pillars are recurring themes for your posts. They help you stay consistent, avoid random posting, and repeatedly explain the problems you solve, the proof you have, and the next action you want people to take.",
      },
      {
        question: "How should I use the weekly content plan?",
        answer:
          "Use it as a lightweight publishing guide. You do not have to post every item exactly as written. Adapt the ideas to your voice, reuse what performs well, and keep each post tied to one clear business goal.",
      },
      {
        question: "Can this help if my business is mainly social media driven?",
        answer:
          "Yes. For social-first businesses, creators, community products, local services, ecommerce, restaurants, beauty, fitness, and similar businesses, the app can treat social as the discovery layer while the website or profile link acts as the conversion layer.",
      },
      {
        question:
          "Why should I confirm Business Context before generating social strategy?",
        answer:
          "Because channel and content advice depends on the audience. A Discord-community product, local restaurant, consultant, ecommerce brand, and B2B software tool may all need different platforms and post types. Confirmed context makes the strategy more specific.",
      },
    ],
  },
];

export const websiteSeoHelpSections: HelpSection[] = [
  {
    title: "Getting Started",
    description:
      "The shortest path from a website URL to a useful Action Plan.",
    entries: [
      {
        question: "How do I start using Onread?",
        answer:
          "Add your business name and public website URL, confirm the website, review the generated Business Context, choose a goal, and run your first website audit.",
      },
      {
        question: "Why do I need to confirm my website?",
        answer:
          "Confirmation prevents Onread from analyzing the wrong site. New audits require one confirmed public website and do not require social, competitor, or listing setup.",
      },
    ],
  },
  {
    title: "Understanding Your Audit",
    description: "How to read the score, evidence, findings, and limitations.",
    entries: [
      {
        question: "What does the Website Growth Score mean?",
        answer:
          "It summarizes the Website and SEO evidence Onread could verify. Website contributes 55% and SEO contributes 45%. Read the findings and evidence to understand the score rather than treating it as a promise of business results.",
      },
      {
        question: "Why is some data missing?",
        answer:
          "A page may block automated access, time out, return non-HTML content, or sit beyond your plan's crawl limit. Onread labels unavailable evidence and coverage limits instead of treating them as confirmed defects.",
      },
      {
        question: "What is a legacy score?",
        answer:
          "Older audits used a broader methodology. Those reports remain unchanged and are labeled Legacy scoring model. Onread does not directly compare them with the Website Growth Score as if the difference represented website progress.",
      },
    ],
  },
  {
    title: "Website Analysis",
    description: "What the controlled crawl checks across public pages.",
    entries: [
      {
        question: "What does the Website tab analyze?",
        answer:
          "It reviews the homepage and prioritized internal pages for headings, navigation, calls to action, images, links, important-page coverage, content clarity, and observable conversion paths. Crawl depth depends on your plan.",
      },
      {
        question: "Why did Onread not scan every page?",
        answer:
          "The crawler is intentionally limited for safety and predictability. It starts with the homepage, prioritizes important internal pages, and records pages that were discovered but not scanned.",
      },
    ],
  },
  {
    title: "SEO Analysis",
    description: "Plain-language explanations of search-readiness checks.",
    entries: [
      {
        question: "What does the SEO tab check?",
        answer:
          "It checks page titles, meta descriptions, heading structure, internal links, canonicals, robots.txt, sitemap.xml, indexability signals, image alt text, and related technical foundations that Onread can verify.",
      },
      {
        question: "Does this guarantee rankings?",
        answer:
          "No. The audit identifies observable website and SEO foundations. Rankings also depend on search demand, competition, authority, content quality, location, and factors Onread may not have access to.",
      },
    ],
  },
  {
    title: "Action Plan",
    description: "How findings become prioritized, trackable website work.",
    entries: [
      {
        question: "What should I work on first?",
        answer:
          "Start with the best next action shown on Overview. Priority considers evidence, expected impact, effort, your goals, and current task status. Each action remains connected to its source finding.",
      },
      {
        question: "Does completing a task change my score?",
        answer:
          "Not by itself. Task status records your work. Run another audit after implementation so Onread can inspect the website again and verify whether the underlying evidence changed.",
      },
    ],
  },
  {
    title: "Implementation Help",
    description: "Drafts and instructions tied to supported recommendations.",
    entries: [
      {
        question: "Does Generate Fix change my website?",
        answer:
          "No. It creates review-ready copy or implementation steps inside Onread. You decide what to use and publish changes through your own website tools.",
      },
      {
        question: "What can it help draft?",
        answer:
          "Supported recommendations can produce page titles, meta descriptions, headings, calls to action, page outlines, internal-link suggestions, and ordered implementation instructions.",
      },
    ],
  },
  {
    title: "AI Consultant",
    description:
      "What the Website & SEO Consultant knows and how it stays grounded.",
    entries: [
      {
        question: "What does the Consultant know about my business?",
        answer:
          "It receives compact context from your Business Context, website and SEO scores, findings, recommendations, action status, key crawl evidence, and compatible audit progress. It must disclose missing evidence rather than invent it.",
      },
      {
        question: "What can I ask it?",
        answer:
          "Ask what to fix first, why an issue matters, how to rewrite a title or call to action, which pages need attention, or how to verify a completed recommendation.",
      },
    ],
  },
  {
    title: "Reports and Progress",
    description:
      "Sharing results and measuring compatible before-and-after evidence.",
    entries: [
      {
        question: "What does the PDF include?",
        answer:
          "Completed paid reports can include the Website Growth Score, Website and SEO findings, top priorities, implementation guidance, crawl coverage, limitations, and a technical appendix.",
      },
      {
        question: "How often should I run another audit?",
        answer:
          "Run one after implementing meaningful changes or on the cadence supported by your plan. Rechecking too soon, before the website has changed, is unlikely to produce useful progress evidence.",
      },
      {
        question: "Why can a comparison be limited?",
        answer:
          "Scores are directly comparable only when the audits use compatible scoring methods. Coverage changes are also disclosed because scanning different pages can change what Onread observes.",
      },
    ],
  },
];
