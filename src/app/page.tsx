import type { Metadata } from "next";

import { AnalysisCategories } from "@/components/marketing/analysis-categories";
import { AudiencePaths } from "@/components/marketing/audience-paths";
import { CompetitorShowcase } from "@/components/marketing/competitor-showcase";
import { DeliverablesSection } from "@/components/marketing/deliverables-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ImplementationHelpShowcase } from "@/components/marketing/implementation-help-showcase";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { OutcomesSection } from "@/components/marketing/outcomes-section";
import { TransformationSection } from "@/components/marketing/transformation-section";
import { TrustSection } from "@/components/marketing/trust-section";
import {
  brand,
  createMarketingMetadata,
  getCanonicalUrl,
  getPublicAppUrl,
} from "@/lib/brand";
import { marketingFaqs } from "@/lib/marketing-content";

const title = `AI Business Audit & Growth Strategy Consultant | ${brand.name}`;
const description =
  "Analyze your website, SEO, reviews, social presence, and competitors. Get an evidence-backed action plan, implementation help, and an AI Consultant.";

export const metadata: Metadata = createMarketingMetadata({
  title,
  description,
  pathname: "/",
});

function homepageStructuredData() {
  const publicUrl = getPublicAppUrl();
  const homepage = getCanonicalUrl("/");
  const graph: Record<string, unknown>[] = [];

  if (publicUrl && homepage) {
    graph.push(
      {
        "@type": "Organization",
        "@id": `${homepage.href}#organization`,
        name: brand.name,
        url: homepage.href,
        logo: new URL(brand.logoPath, publicUrl).href,
      },
      {
        "@type": "WebApplication",
        "@id": `${homepage.href}#application`,
        name: brand.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: homepage.href,
        description,
        featureList: [
          "Online presence audit",
          "Website and SEO analysis",
          "Public competitor intelligence",
          "Prioritized action plan",
          "Implementation help",
          "AI Consultant",
          "PDF reports and Presentation Mode",
        ],
        publisher: { "@id": `${homepage.href}#organization` },
      },
    );
  }

  graph.push({
    "@type": "FAQPage",
    "@id": homepage ? `${homepage.href}#faq` : undefined,
    mainEntity: marketingFaqs.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  });

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export default function HomePage() {
  const jsonLd = homepageStructuredData();

  return (
    <MarketingShell>
      <main>
        <HeroSection />
        <TransformationSection />
        <HowItWorks />
        <AnalysisCategories />
        <OutcomesSection />
        <CompetitorShowcase />
        <ImplementationHelpShowcase />
        <AudiencePaths />
        <DeliverablesSection />
        <TrustSection />
        <FaqSection />
        <FinalCta />
      </main>
      <script
        id="homepage-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </MarketingShell>
  );
}
