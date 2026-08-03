import type { Metadata } from "next";

import { AnalysisCategories } from "@/components/marketing/analysis-categories";
import { AudiencePaths } from "@/components/marketing/audience-paths";
import { DeliverablesSection } from "@/components/marketing/deliverables-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { ImplementationHelpShowcase } from "@/components/marketing/implementation-help-showcase";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { OutcomesSection } from "@/components/marketing/outcomes-section";
import { PricingPreview } from "@/components/marketing/pricing-preview";
import { TransformationSection } from "@/components/marketing/transformation-section";
import { TrustSection } from "@/components/marketing/trust-section";
import {
  brand,
  createMarketingMetadata,
  getCanonicalUrl,
  getPublicAppUrl,
} from "@/lib/brand";
import { marketingFaqs } from "@/lib/marketing-content";

const title = `Website & SEO Audit Software for Small Businesses | ${brand.name}`;
const description =
  "Audit your website and SEO, uncover evidence-backed priorities, get clear implementation help, and verify measurable improvements with repeat audits.";

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
          "Controlled multi-page website crawl",
          "Website and SEO evidence analysis",
          "Prioritized website Action Plan",
          "Website implementation help",
          "Website and SEO AI Consultant",
          "Repeat audit progress verification",
          "PDF reports and presentation mode",
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
        <ImplementationHelpShowcase />
        <AudiencePaths />
        <DeliverablesSection />
        <TrustSection />
        <FaqSection />
        <PricingPreview />
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
