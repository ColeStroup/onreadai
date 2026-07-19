import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Terms | Onread AI",
  description:
    "Current usage expectations, analysis limitations, generated-content responsibilities, and service availability for Onread AI.",
  pathname: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Product terms overview"
      description="Effective July 17, 2026. These terms describe current product expectations and limitations."
    >
      <LegalSection title="Using the service">
        <p>Use the application only for businesses, profiles, and public sources you are authorized to assess. Do not use it to evade access controls, collect private information, or misrepresent generated output as verified evidence.</p>
      </LegalSection>
      <LegalSection title="Audit limitations">
        <p>Scores and recommendations are decision-support tools based on available evidence. Sites can block requests, public information can be incomplete, and a limited crawl cannot represent every page or business outcome.</p>
      </LegalSection>
      <LegalSection title="Generated content">
        <p>AI Consultant responses and Implementation Help drafts must be reviewed before use. You remain responsible for accuracy, brand claims, customer permissions, legal compliance, and any changes made to external websites or profiles.</p>
      </LegalSection>
      <LegalSection title="Competitor information">
        <p>Competitor analysis is limited to observable public evidence. It does not provide private traffic, sales, ad spend, engagement, conversion, or revenue data, and it must not be presented as if it does.</p>
      </LegalSection>
      <LegalSection title="Availability and billing">
        <p>Paid purchases use Stripe Checkout and paid access is granted only after verified server-side Stripe confirmation. Monthly subscriptions renew until canceled through the Stripe Customer Portal; cancellation normally takes effect at the end of the current billing period. The price and product shown at Checkout control the purchase. Features and limits may change prospectively as the service develops.</p>
      </LegalSection>
      <LegalSection title="No guaranteed outcomes">
        <p>The service does not guarantee search rankings, revenue, traffic, customer acquisition, conversion improvements, or any other business result.</p>
      </LegalSection>
      <LegalSection title="Questions">
        <p>Contact <a className="font-medium text-accent underline" href="mailto:support@onread.ai">support@onread.ai</a> for billing or account questions.</p>
      </LegalSection>
    </LegalPage>
  );
}
