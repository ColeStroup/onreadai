import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Privacy | Onread AI",
  description:
    "A concise description of the account, business, public website, audit, and AI context data used by Onread AI.",
  pathname: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy overview"
      description="Effective July 17, 2026. This plain-language notice describes the current product data flow."
    >
      <LegalSection title="Information you provide">
        <p>
          The application stores account information, submitted business names
          or URLs, confirmed websites, Business Context, goals, chat messages,
          recommendation status, and other information you choose to enter. It
          may also retain social profiles, competitors, and public listing
          information you previously entered or use when optional modules are
          enabled.
        </p>
      </LegalSection>
      <LegalSection title="Public information analyzed">
        <p>
          The launch audit may fetch accessible public website pages,
          robots.txt, and sitemap.xml. Optional feature modules, when explicitly
          enabled, may also fetch public profile, competitor, or listing
          information. Crawls are controlled and do not provide access to
          private analytics or accounts.
        </p>
      </LegalSection>
      <LegalSection title="AI processing">
        <p>
          When the AI Consultant or Implementation Help is used and an AI
          provider is configured, a compact context based on saved business and
          audit data may be sent to that provider to generate a response.
          Deterministic analyzers remain the source of audit scores and
          findings.
        </p>
      </LegalSection>
      <LegalSection title="Authentication and service providers">
        <p>
          The application uses Vercel for application hosting, Render for
          database hosting, Auth.js and Google for authentication, Resend for
          transactional email, Stripe for billing, and OpenAI and Google Places
          for requested product features. Provider credentials remain
          server-side.
        </p>
      </LegalSection>
      <LegalSection title="Payments and account security">
        <p>
          Stripe processes payment details on its hosted pages; Onread AI stores
          billing identifiers, product and subscription state, and fulfillment
          records rather than full card numbers. Session cookies support sign-in
          and account security.
        </p>
      </LegalSection>
      <LegalSection title="Your choices">
        <p>
          Confirm only profiles that belong to the business, avoid entering
          unnecessary sensitive information, and review generated content before
          publishing it. Automated account deletion is not currently available.
          Contact support to request access, correction, or deletion assistance;
          requests remain subject to applicable legal and operational
          requirements.
        </p>
      </LegalSection>
      <LegalSection title="Questions">
        <p>
          Contact{" "}
          <a
            className="font-medium text-accent underline"
            href="mailto:support@onread.ai"
          >
            support@onread.ai
          </a>{" "}
          with privacy or account questions.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
