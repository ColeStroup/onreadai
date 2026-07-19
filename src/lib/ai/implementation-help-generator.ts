import "server-only";

import type {
  ImplementationContext,
  ImplementationTaskType,
} from "@/lib/ai/implementation-context";
import {
  getOpenAIClient,
  getOpenAIModel,
  isOpenAIConfigured,
} from "@/lib/ai/openai-client";
import { logError } from "@/lib/observability/log";

export type ImplementationOption = {
  label: string;
  fields: Array<{
    label: string;
    value: string;
    meta?: string;
  }>;
  rationale?: string;
};

export type ImplementationHelpResult = {
  type: ImplementationTaskType;
  title: string;
  summary: string;
  whyItMatters: string;
  options: ImplementationOption[];
  recommendedOption: number;
  implementationSteps: string[];
  placementGuidance: string[];
  validationChecklist: string[];
  limitations: string[];
  assumptions: string[];
  generatedAt: string;
};

export type GeneratedImplementationHelp = ImplementationHelpResult & {
  source: "ai_generated" | "template_fallback";
};

export async function generateImplementationHelp(
  context: ImplementationContext,
): Promise<GeneratedImplementationHelp> {
  const fallback = buildFallback(context);
  if (!isOpenAIConfigured()) {
    return { ...fallback, source: "template_fallback" };
  }

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions:
        "You create practical implementation drafts for business owners from deterministic audit evidence. Business Context is high-priority. Return only valid JSON. Never invent existing website copy, profile bios, customer quotes, ratings, review counts, social performance, or facts not in context. For competitor-informed tasks, use only supplied public comparison evidence, create business-specific work, and never copy competitor wording. Never infer traffic, sales, conversions, revenue, private analytics, engagement, reach, impressions, audience demographics, or post performance. Do not promise results. Clearly label assumptions. Keep copy specific, concise, and ready to use. For social-first businesses, generate useful profile bios, social CTAs, link-in-bio structures, pinned-post concepts, hooks, captions, review requests, or weekly plans instead of redirecting the task toward a website. For meta descriptions, target roughly 140-160 characters and provide exact character counts. For customer proof, use only verified rating/review counts and never fabricate quotes. Never generate image-specific alt text when the image was not visually inspected. For technical or unsupported tasks, provide ordered steps instead of pretending to edit the website.",
      input: `Task type: ${context.type}\n\nCompact saved context:\n${JSON.stringify(
        contextForModel(context),
        null,
        2,
      )}\n\nReturn this JSON shape exactly: {"type": string, "title": string, "summary": string, "whyItMatters": string, "options": [{"label": string, "fields": [{"label": string, "value": string, "meta": string?}], "rationale": string?}], "recommendedOption": number, "implementationSteps": string[], "placementGuidance": string[], "validationChecklist": string[], "limitations": string[], "assumptions": string[], "generatedAt": string}. Use a zero-based recommendedOption. Return three options for headline and meta-description tasks. Task-specific fields should be plainly labeled, such as Headline, Subheadline, Primary CTA, Meta description, Character count, SMS, Email subject, Email body, Hook, Caption, or CTA.`,
      max_output_tokens: 1800,
      store: false,
    });
    const parsed = parseJson(response.output_text);

    if (parsed) {
      return {
        ...normalizeResult(parsed, fallback, context.type),
        source: "ai_generated",
      };
    }
  } catch (error) {
    logError("implementation_help_ai_failed", error, {
      taskType: context.type,
      businessId: context.businessId,
    });
  }

  return { ...fallback, source: "template_fallback" };
}

function buildFallback(context: ImplementationContext): ImplementationHelpResult {
  const audience =
    context.businessContext.targetAudience || "your ideal customers";
  const offer = context.businessContext.mainOffer || context.businessName;
  const location = context.businessContext.location;
  const ctas = callToActions(context);
  const common = {
    type: context.type,
    whyItMatters: whyItMatters(context),
    generatedAt: new Date().toISOString(),
    limitations: [
      "This is a draft for your review and does not change your website or accounts.",
      ...(context.freshnessNote ? [context.freshnessNote] : []),
    ],
    assumptions: context.businessContext.confirmed
      ? []
      : ["Business Context has not been confirmed, so wording should be reviewed carefully."],
  };

  if (context.type === "homepage_headline") {
    return {
      ...common,
      title: "Homepage headline options",
      summary: `Three clear ways to introduce ${context.businessName} to ${audience}.`,
      options: [
        option("Option 1", {
          Headline: `${clearOffer(offer)} for ${audience}`,
          Subheadline: supportingLine(context, audience),
          "Primary CTA": ctas.primary,
        }, "Leads with the offer and the intended audience."),
        option("Option 2", {
          Headline: `A clearer way to ${conversionOutcome(context)}`,
          Subheadline: `${context.businessName} helps ${audience} take the next step with less friction.`,
          "Primary CTA": ctas.primary,
        }, "Leads with the outcome while avoiding an unsupported promise."),
        option("Option 3", {
          Headline: `${context.businessName}: ${shortOffer(offer)}`,
          Subheadline: supportingLine(context, audience),
          "Primary CTA": ctas.primary,
        }, "Keeps the brand name prominent and makes the offer explicit."),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Choose one option and adjust any wording that does not match the actual offer.",
        "Replace the current homepage hero H1 with the chosen headline.",
        "Place the subheadline directly below it and the primary CTA immediately after it.",
        "Check the mobile layout and make sure the full message is visible without overlap.",
      ],
      placementGuidance: [
        "Use the headline as the single primary H1 near the top of the homepage.",
        "Keep the CTA inside the same hero area so the next step is obvious.",
      ],
      validationChecklist: [
        "The headline describes the real offer.",
        "The page contains one clear primary H1.",
        "The CTA links to a working next step.",
      ],
    };
  }

  if (context.type === "meta_description") {
    const descriptions = [
      fitMeta(`${context.businessName} helps ${audience} with ${shortOffer(offer)}. ${ctaSentence(ctas.primary)}`),
      fitMeta(`${shortOffer(offer)} for ${audience}${location ? ` in ${location}` : ""}. Learn what ${context.businessName} offers and ${ctaSentence(ctas.primary).toLowerCase()}`),
      fitMeta(`Discover how ${context.businessName} supports ${audience} with ${shortOffer(offer)}. ${ctaSentence(ctas.primary)}`),
    ];

    return {
      ...common,
      title: "Meta description drafts",
      summary: "Three search-description options grounded in the saved offer and audience.",
      options: descriptions.map((description, index) =>
        option(`Version ${index + 1}`, {
          "Meta description": description,
          "Character count": String(description.length),
        }),
      ),
      recommendedOption: 0,
      implementationSteps: [
        "Choose the version that most accurately describes the page.",
        "Add it to the homepage meta description in your CMS or page settings.",
        "Publish the change and inspect the page source to confirm the description is present.",
      ],
      placementGuidance: [
        "Use this only for the homepage meta description, not every page on the site.",
      ],
      validationChecklist: [
        "The description matches visible page content.",
        "The description is concise and has no unsupported claims.",
        "The published page contains one meta description tag.",
      ],
    };
  }

  if (context.type === "cta_improvement") {
    return {
      ...common,
      title: "CTA structure",
      summary: "A focused primary and secondary action based on the saved conversion goal.",
      options: [
        option("Recommended CTA pair", {
          "Primary CTA": ctas.primary,
          "Secondary CTA": ctas.secondary,
          "Supporting copy": `Ready to ${conversionOutcome(context)}? Choose the next step that works for you.`,
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Use one primary CTA consistently in the homepage hero.",
        "Link the primary CTA to the shortest valid conversion path.",
        "Use the secondary CTA for visitors who need more information.",
        "Repeat the primary CTA after the main proof or offer section.",
      ],
      placementGuidance: [
        "Place the primary CTA in the hero and near the end of the homepage.",
        "Keep secondary actions visually quieter than the primary action.",
      ],
      validationChecklist: [
        "Every CTA link works.",
        "Button labels describe what happens next.",
        "The mobile CTA remains easy to tap.",
      ],
    };
  }

  if (context.type === "customer_proof") {
    const ratingLine = verifiedRatingLine(context);
    return {
      ...common,
      title: "Customer proof section",
      summary: "A trust section that uses only currently verified review data.",
      options: [
        option("Website trust section", {
          "Section heading": `Why customers choose ${context.businessName}`,
          "Supporting copy": `${context.businessName} helps ${audience} with ${shortOffer(offer)}. Add approved customer examples or outcomes here to make that value easier to trust.`,
          "Rating line": ratingLine,
          CTA: ctas.secondary,
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Place the section after the main offer or benefits section.",
        "Keep the verified rating line only if it remains current and accurate.",
        "Add customer quotes only after receiving permission and verifying the exact wording.",
        "Link the CTA to the confirmed Google listing or another real proof source when available.",
      ],
      placementGuidance: [
        "Use this near the decision point, before the final homepage CTA.",
      ],
      validationChecklist: [
        "No customer quote or outcome was invented.",
        "Rating and review count match the current confirmed listing.",
        "Any proof link opens the intended public source.",
      ],
    };
  }

  if (context.type === "review_request") {
    return {
      ...common,
      title: "Review request process",
      summary: "Short request templates and a repeatable timing plan.",
      options: [
        option("SMS request", {
          SMS: `Hi [First name], thanks for choosing ${context.businessName}. If you have a moment, would you share an honest review? [Verified review link]`,
          Timing: "Send after the customer has received the service, product, or promised outcome.",
        }),
        option("Email request", {
          "Email subject": `How was your experience with ${context.businessName}?`,
          "Email body": `Hi [First name],\n\nThank you for choosing ${context.businessName}. Your honest feedback helps future customers make a confident decision. If you have a moment, please leave a review here:\n\n[Verified review link]\n\nThank you,\n${context.businessName}`,
        }),
        option("In-person wording", {
          Script: "If everything met your expectations today, an honest Google review would mean a lot to us. I can send you the direct link.",
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Confirm the correct public review link before sending requests.",
        "Choose the moment when customers have enough experience to give honest feedback.",
        "Send one clear request without offering rewards for positive reviews.",
        "Track whether the request was sent, but do not pressure customers to respond.",
      ],
      placementGuidance: [
        "Add the chosen template to the existing follow-up workflow or customer-service checklist.",
      ],
      validationChecklist: [
        "The review link is correct.",
        "The request asks for honest feedback, not only positive feedback.",
        "No incentive conflicts with the review platform's rules.",
      ],
    };
  }

  if (context.type === "profile_bio") {
    const bioBase = `${context.businessName} helps ${audience} with ${shortOffer(offer)}.`;
    return {
      ...common,
      title: "Social profile bio drafts",
      summary: "Three concise profile introductions grounded in the saved audience, offer, and conversion goal.",
      options: [
        option("Clear and direct", {
          Bio: `${bioBase} ${ctaSentence(ctas.primary)}`,
          CTA: ctas.primary,
        }),
        option("Outcome led", {
          Bio: `Helping ${audience} ${conversionOutcome(context)} through ${shortOffer(offer)}.`,
          CTA: ctas.primary,
        }),
        option("Brand led", {
          Bio: `${context.businessName} | ${shortOffer(offer)} for ${audience}.`,
          CTA: ctas.primary,
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Choose the draft that most accurately describes the real offer.",
        "Shorten it to fit the primary platform without removing the audience, offer, or next step.",
        "Add one working CTA or profile link that matches the wording.",
        "Adapt the same core positioning across each confirmed profile.",
      ],
      placementGuidance: [
        "Use this in the bio or About field of the primary confirmed social profile.",
        "Keep the same offer language across secondary profiles while respecting each platform's format.",
      ],
      validationChecklist: [
        "The bio names the real audience and offer.",
        "The CTA matches a working DM, booking, storefront, community, call, email, or profile-link path.",
        "No unsupported result or customer claim was added.",
      ],
    };
  }

  if (context.type === "social_cta") {
    return {
      ...common,
      title: "Social CTA options",
      summary: "A small set of next-step prompts for bios, captions, and pinned posts.",
      options: [
        option("Primary CTA", {
          CTA: ctas.primary,
          "Supporting line": `Ready to ${conversionOutcome(context)}? ${ctas.primary}.`,
        }),
        option("Conversation CTA", {
          CTA: "Send a DM",
          "Supporting line": `Message ${context.businessName} to ask about ${shortOffer(offer)}.`,
        }),
        option("Low-friction CTA", {
          CTA: ctas.secondary,
          "Supporting line": `${ctas.secondary} to see whether this is a fit.`,
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Choose one primary CTA that matches the real conversion path.",
        "Use it consistently in the bio, pinned offer post, and relevant captions.",
        "Link it to the shortest working next step and test it on mobile.",
      ],
      placementGuidance: [
        "Place the primary CTA in the profile bio and repeat it in the pinned offer post.",
      ],
      validationChecklist: [
        "The CTA describes exactly what happens next.",
        "The destination or contact action works on mobile.",
        "Each post uses one primary action rather than several competing asks.",
      ],
    };
  }

  if (context.type === "link_in_bio") {
    return {
      ...common,
      title: "Link-in-bio structure",
      summary: "A short conversion menu that keeps the main offer first and supporting trust paths secondary.",
      options: [
        option("Recommended structure", {
          "Link 1": `${ctas.primary} - the primary offer or conversion path`,
          "Link 2": "See proof - verified reviews, results, portfolio, or customer stories",
          "Link 3": "Contact or follow up - DM, call, email, booking, or community",
          "Optional link": "Secondary offer, storefront category, event, newsletter, or free resource",
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Choose the one destination that matters most and place it first.",
        "Add only the supporting links that help a visitor decide or act.",
        "Use plain labels that describe the destination instead of vague text.",
        "Test every link on mobile and remove expired or duplicate paths.",
      ],
      placementGuidance: [
        "Use this structure in the primary profile link or platform-native link list.",
      ],
      validationChecklist: [
        "The primary conversion link is first.",
        "Every destination is real and working.",
        "The list is short enough to scan quickly.",
      ],
    };
  }

  if (context.type === "pinned_post") {
    return {
      ...common,
      title: "Three-post pin plan",
      summary: "A simple pinned set that explains the offer, establishes trust, and gives new profile visitors a next step.",
      options: [
        option("Pinned post set", {
          "Post 1 - Offer": `Hook: What ${context.businessName} helps ${audience} do. Explain ${shortOffer(offer)} and who it is for. CTA: ${ctas.primary}.`,
          "Post 2 - Proof": "Share a verified review, real result, portfolio example, process demonstration, or customer story without inventing claims.",
          "Post 3 - Next step": `Explain exactly what happens after someone chooses to ${conversionOutcome(context)}. CTA: ${ctas.primary}.`,
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Draft each post around one job: offer, proof, or next step.",
        "Use only verified proof and real examples.",
        "Publish the posts in a format suited to the primary platform.",
        "Pin all three and review them whenever the offer or conversion path changes.",
      ],
      placementGuidance: [
        "Pin these to the top of the primary confirmed profile in offer, proof, and next-step order.",
      ],
      validationChecklist: [
        "A new visitor can understand the offer without browsing the full feed.",
        "Proof is real and attributable.",
        "The final post gives one working next step.",
      ],
    };
  }

  if (context.type === "social_post") {
    const platform = context.social.currentItem?.platform || context.social.confirmedPlatforms[0] || "Best-fit social platform";
    const concept = context.social.currentItem?.postConcept || context.social.currentItem?.idea || context.recommendation.description;
    return {
      ...common,
      title: "Social post draft",
      summary: `A practical ${platform} post based on the saved offer and current content idea.`,
      options: [
        option("Post draft", {
          Platform: platform,
          Hook: `A simpler way for ${audience} to ${conversionOutcome(context)}`,
          "Content concept": concept,
          Caption: `${concept}\n\n${context.businessName} helps ${audience} with ${shortOffer(offer)}.`,
          CTA: ctas.primary,
          "Production notes": "Use a real product, service, team, location, or process visual. Keep on-screen text concise.",
        }),
      ],
      recommendedOption: 0,
      implementationSteps: [
        "Confirm the platform and adjust the language to match the real audience.",
        "Pair the caption with an authentic visual from the business.",
        "Check every claim and link before scheduling or publishing.",
      ],
      placementGuidance: ["Publish only through your normal social workflow after review."],
      validationChecklist: [
        "The post matches the actual offer.",
        "The visual is owned or approved for use.",
        "The CTA points to a working next step.",
      ],
      limitations: [
        ...common.limitations,
        "Individual post performance and engagement metrics have not been analyzed.",
      ],
    };
  }

  if (context.type === "weekly_content_plan") {
    const platforms = context.social.confirmedPlatforms.length
      ? context.social.confirmedPlatforms
      : [context.social.currentItem?.platform || "Best-fit platform"];
    const ideas = [
      ["Problem education", `Explain one common problem ${audience} faces before choosing ${shortOffer(offer)}.`],
      ["Proof and process", "Show a real process, approved customer proof, or behind-the-scenes detail that builds trust."],
      ["Offer and next step", `Explain who ${offer} is for and invite the audience to ${ctas.primary.toLowerCase()}.`],
    ];
    return {
      ...common,
      title: "Next three posts",
      summary: "A manageable content sequence that moves from education to trust to action.",
      options: ideas.map(([hook, idea], index) =>
        option(`Post ${index + 1}`, {
          Platform: platforms[index % platforms.length],
          Format: index === 1 ? "Photo, carousel, or short video" : "Short video or text-led post",
          Hook: hook,
          Goal: index === 0 ? "Build relevance" : index === 1 ? "Build trust" : "Drive the next step",
          CTA: index === 2 ? ctas.primary : "Save or share this idea",
          Concept: idea,
        }),
      ),
      recommendedOption: 0,
      implementationSteps: [
        "Assign one realistic production day for all three posts.",
        "Use authentic visuals and verify every factual claim.",
        "Schedule the posts across the next seven days with breathing room between them.",
      ],
      placementGuidance: ["Keep this sequence in the existing Social Strategy content plan."],
      validationChecklist: [
        "Each post has one purpose and one CTA.",
        "The channel is confirmed or intentionally selected as a new opportunity.",
        "No performance outcome is promised.",
      ],
      limitations: [
        ...common.limitations,
        "Individual post performance and engagement metrics have not been analyzed.",
      ],
    };
  }

  const evidence = context.evidence.at(0);
  const guidance = genericGuidance(context, evidence?.description);
  return {
    ...common,
    title: "Implementation steps",
    summary: `A practical checklist for: ${context.recommendation.title}`,
    options: [],
    recommendedOption: 0,
    implementationSteps: guidance.steps,
    placementGuidance: guidance.placement,
    validationChecklist: guidance.validation,
    limitations: [...common.limitations, ...guidance.limitations],
  };
}

function genericGuidance(
  context: ImplementationContext,
  evidence?: string,
) {
  const task = `${context.recommendation.title} ${context.recommendation.description}`.toLowerCase();

  if (/alt text|image alt/.test(task)) {
    return {
      steps: [
        "Open each page named by the audit and inspect the flagged images visually.",
        "Leave decorative images with an empty alt attribute so screen readers skip them.",
        "For meaningful images, describe the information or purpose visible in that specific image.",
        "Avoid keyword stuffing, filenames, and phrases such as 'image of'.",
        "Publish the change, inspect the rendered HTML, and test the page with images disabled or an accessibility checker.",
      ],
      placement: ["Add the text to each image's alt attribute in the CMS or page component."],
      validation: [
        "Every meaningful flagged image has accurate, concise alt text.",
        "Decorative images use an empty alt attribute.",
        "The description matches what is actually visible.",
      ],
      limitations: [
        "The audit did not visually understand each image, so it does not generate image-specific alt text.",
      ],
    };
  }

  if (/canonical/.test(task)) {
    return {
      steps: [
        "Choose the public URL that should be treated as the preferred version of the page.",
        "Add one self-referencing <link rel=\"canonical\" href=\"https://preferred-url\"> tag in the page head.",
        "Use an absolute HTTPS URL and keep it consistent with redirects and internal links.",
        "Publish, inspect the page source, and verify that only one canonical tag is present.",
      ],
      placement: ["Add the canonical tag inside the document head through the CMS SEO settings or page metadata configuration."],
      validation: [
        "The canonical URL returns a successful page.",
        "Only one canonical tag is present.",
        "The tag points to the intended preferred URL.",
      ],
      limitations: [],
    };
  }

  if (/robots|sitemap|indexability/.test(task)) {
    return {
      steps: [
        "Open /robots.txt and /sitemap.xml on the live domain and confirm which file is missing or unreachable.",
        "Generate or enable the missing file through the CMS, framework, or SEO plugin used by the site.",
        "Keep important public pages crawlable and do not block the entire site unless that is intentional.",
        "Reference the sitemap URL from robots.txt when supported.",
        "Publish and fetch both public URLs again to verify successful plain-text or XML responses.",
      ],
      placement: ["These files belong at the website root and should be generated by the site's deployment or CMS configuration."],
      validation: [
        "/robots.txt returns readable crawl guidance.",
        "/sitemap.xml returns valid XML with canonical public URLs.",
        "No important public section is accidentally blocked.",
      ],
      limitations: ["Review crawl directives with a developer before changing a complex or intentionally private site."],
    };
  }

  return {
    steps: [
      "Open the page, profile, or system named in the recommendation.",
      `Review the current state against this audit evidence: ${evidence || context.recommendation.description}`,
      "Make the smallest change that fully addresses the recommendation.",
      "Review the change on desktop and mobile or in the relevant public profile.",
      "Verify the result using the checklist below, then mark the task complete yourself.",
    ],
    placement: [
      context.website.url
        ? `Start with ${context.website.url}.`
        : "Use the relevant website, profile, or business workflow named by the task.",
    ],
    validation: [
      "The change addresses the saved audit evidence.",
      "No unrelated page or workflow was changed.",
      "The public result works as expected.",
    ],
    limitations: [],
  };
}

function contextForModel(context: ImplementationContext) {
  return {
    businessName: context.businessName,
    businessContext: context.businessContext,
    goals: context.goals,
    recommendation: context.recommendation,
    evidence: context.evidence,
    website: ["homepage_headline", "meta_description", "cta_improvement", "generic_steps"].includes(context.type)
      ? context.website
      : undefined,
    googleBusiness: ["customer_proof", "review_request", "generic_steps"].includes(context.type)
      ? context.googleBusiness
      : undefined,
    social: [
      "profile_bio",
      "social_cta",
      "link_in_bio",
      "pinned_post",
      "social_post",
      "weekly_content_plan",
    ].includes(context.type)
      ? context.social
      : undefined,
    competitors:
      context.recommendation.category === "COMPETITORS" ||
      context.competitorEvidence
        ? context.competitors
        : undefined,
    competitorEvidence: context.competitorEvidence ?? undefined,
    freshnessNote: context.freshnessNote,
    auditCreatedAt: context.auditCreatedAt,
  };
}

function normalizeResult(
  value: Record<string, unknown>,
  fallback: ImplementationHelpResult,
  type: ImplementationTaskType,
): ImplementationHelpResult {
  const options = Array.isArray(value.options)
    ? value.options.map(normalizeOption).filter(Boolean).slice(0, 5)
    : [];
  const recommendedOption = number(value.recommendedOption);

  return {
    type,
    title: text(value.title) || fallback.title,
    summary: text(value.summary) || fallback.summary,
    whyItMatters: text(value.whyItMatters) || fallback.whyItMatters,
    options: options.length ? (options as ImplementationOption[]) : fallback.options,
    recommendedOption:
      recommendedOption !== null && recommendedOption >= 0
        ? Math.min(recommendedOption, Math.max(options.length - 1, 0))
        : fallback.recommendedOption,
    implementationSteps: stringList(value.implementationSteps, fallback.implementationSteps),
    placementGuidance: stringList(value.placementGuidance, fallback.placementGuidance),
    validationChecklist: stringList(value.validationChecklist, fallback.validationChecklist),
    limitations: stringList(value.limitations, fallback.limitations),
    assumptions: stringList(value.assumptions, fallback.assumptions),
    generatedAt: new Date().toISOString(),
  };
}

function normalizeOption(value: unknown): ImplementationOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fields = Array.isArray(record.fields)
    ? record.fields
        .map((field) => {
          if (!field || typeof field !== "object" || Array.isArray(field)) return null;
          const item = field as Record<string, unknown>;
          const label = text(item.label);
          const fieldValue = text(item.value);
          if (!label || !fieldValue) return null;
          return {
            label,
            value: fieldValue,
            ...(text(item.meta) ? { meta: text(item.meta) } : {}),
          };
        })
        .filter(Boolean)
        .slice(0, 10)
    : [];

  if (!fields.length) return null;

  return {
    label: text(record.label) || "Draft option",
    fields: fields as ImplementationOption["fields"],
    ...(text(record.rationale) ? { rationale: text(record.rationale) } : {}),
  };
}

function option(
  label: string,
  fields: Record<string, string>,
  rationale?: string,
): ImplementationOption {
  return {
    label,
    fields: Object.entries(fields).map(([fieldLabel, value]) => ({
      label: fieldLabel,
      value,
      ...(fieldLabel === "Meta description"
        ? { meta: `${value.length} characters` }
        : {}),
    })),
    rationale,
  };
}

function whyItMatters(context: ImplementationContext) {
  const evidence = context.evidence.at(0)?.description;
  return evidence
    ? `${context.recommendation.description} Audit evidence: ${evidence}`
    : context.recommendation.description;
}

function callToActions(context: ImplementationContext) {
  const textValue = `${context.businessContext.businessType} ${context.businessContext.industry} ${context.businessContext.description} ${context.businessContext.mainOffer} ${context.businessContext.conversionGoal}`.toLowerCase();

  if (/restaurant|bar|cafe|food|venue/.test(textValue)) {
    return { primary: "View Menu", secondary: "Get Directions" };
  }
  if (/saas|software|platform|app|subscription/.test(textValue)) {
    return { primary: "Start Free", secondary: "View Pricing" };
  }
  if (/consult|agency|b2b|professional service/.test(textValue)) {
    return { primary: "Book a Consultation", secondary: "View Services" };
  }
  if (/shop|ecommerce|product|retail/.test(textValue)) {
    return { primary: "Shop Now", secondary: "View Products" };
  }
  if (/appointment|salon|fitness|clinic|local service/.test(textValue)) {
    return { primary: "Book an Appointment", secondary: "View Services" };
  }

  return { primary: "Get Started", secondary: "Learn More" };
}

function conversionOutcome(context: ImplementationContext) {
  const goal = context.businessContext.conversionGoal?.trim();
  if (goal) {
    return goal
      .replace(/^(get|help|encourage|make)\s+(visitors|customers|people|users)\s+to\s+/i, "")
      .replace(/[.!]+$/, "")
      .toLowerCase();
  }
  return "take the next step";
}

function supportingLine(context: ImplementationContext, audience: string) {
  const offer = shortOffer(context.businessContext.mainOffer || context.businessName);
  return `${context.businessName} helps ${audience} with ${offer}, with a clear path to ${conversionOutcome(context)}.`;
}

function clearOffer(value: string) {
  const cleaned = shortOffer(value);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function shortOffer(value: string) {
  return value.trim().replace(/[.!]+$/, "").slice(0, 110);
}

function fitMeta(value: string) {
  let normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 135) {
    normalized = `${normalized.replace(/[.!]+$/, "")}. Explore the offer and choose a clear next step.`;
  }
  if (normalized.length < 120) {
    normalized = `${normalized.replace(/[.!]+$/, "")}. Learn more today.`;
  }
  if (normalized.length <= 160) return normalized;
  const shortened = normalized.slice(0, 157);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, Math.max(lastSpace, 120)).replace(/[,. ]+$/, "")}...`;
}

function ctaSentence(cta: string) {
  return `${cta} today.`;
}

function verifiedRatingLine(context: ImplementationContext) {
  const { rating, reviewCount, status } = context.googleBusiness;
  if (status === "confirmed" && rating !== null && reviewCount !== null) {
    return `${rating.toFixed(1)} stars from ${reviewCount.toLocaleString()} Google reviews.`;
  }
  if (status === "confirmed" && rating !== null) {
    return `${rating.toFixed(1)} stars on the confirmed Google Business listing.`;
  }
  return "Add a verified rating or review count here once it is confirmed.";
}

function parseJson(value: string) {
  try {
    const normalized = value
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 2500) : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function stringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const list = value.map(text).filter(Boolean).slice(0, 10);
  return list.length ? list : fallback;
}
